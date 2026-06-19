"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { createEmployeesWithLog } from "../actions";
import {
  EMPLOYEE_COLUMNS,
  REQUIRED_FIELDS,
  validateEmployeeData,
  type EmployeeColumn,
  type EmployeeData,
  type EmployeeFieldSource,
} from "../validation";

// field → spreadsheet column index (-1 means "not mapped").
export type ColumnMapping = Partial<Record<EmployeeColumn, number>>;

export type PreviewResult = {
  totalRows: number;
  validCount: number;
  errors: { rowNumber: number; reason: string }[];
  duplicates: { rowNumber: number; reason: string }[];
  // A small sample of the rows that would be created, for the preview table.
  sample: {
    rowNumber: number;
    firstName: string;
    lastName: string;
    email: string;
    department: string;
  }[];
  missingRequired: EmployeeColumn[];
};

export type CommitResult = {
  created: number;
  skipped: number;
  errors: number;
};

const SAMPLE_LIMIT = 8;

// One classified row: its spreadsheet row number plus an outcome.
type Classified =
  | { kind: "empty" }
  | { kind: "error"; rowNumber: number; reason: string }
  | { kind: "duplicate"; rowNumber: number; reason: string }
  | { kind: "valid"; rowNumber: number; data: EmployeeData };

// Builds a raw field source for one spreadsheet row from the column mapping.
function rowToSource(row: string[], mapping: ColumnMapping): EmployeeFieldSource {
  const source: EmployeeFieldSource = {};
  for (const field of EMPLOYEE_COLUMNS) {
    const index = mapping[field];
    if (typeof index === "number" && index >= 0) {
      source[field] = row[index] ?? null;
    }
  }
  return source;
}

function isRowEmpty(row: string[]): boolean {
  return row.every((cell) => (cell ?? "").trim() === "");
}

// Validates and classifies every row against the SAME rules as the create
// action, then flags duplicates: a row whose email (or employeeId) matches an
// existing employee, or an earlier valid row in this same file. The first
// occurrence wins; later collisions are duplicates and get skipped.
async function classifyRows(
  rows: string[][],
  mapping: ColumnMapping,
): Promise<Classified[]> {
  const existing = await prisma.employee.findMany({
    select: { email: true, employeeId: true },
  });
  const seenEmails = new Set<string>();
  const seenIds = new Set<string>();
  for (const e of existing) {
    if (e.email) seenEmails.add(e.email.toLowerCase());
    if (e.employeeId) seenIds.add(e.employeeId.toLowerCase());
  }

  return rows.map((row, index) => {
    const rowNumber = index + 2; // +1 for header row, +1 for 1-based numbering
    if (isRowEmpty(row)) return { kind: "empty" };

    const result = validateEmployeeData(rowToSource(row, mapping));
    if ("error" in result) {
      return { kind: "error", rowNumber, reason: result.error };
    }

    const email = result.data.email.toLowerCase();
    const employeeId = result.data.employeeId?.toLowerCase() ?? null;

    if (seenEmails.has(email)) {
      return {
        kind: "duplicate",
        rowNumber,
        reason: `Duplicate email (${result.data.email})`,
      };
    }
    if (employeeId && seenIds.has(employeeId)) {
      return {
        kind: "duplicate",
        rowNumber,
        reason: `Duplicate employee ID (${result.data.employeeId})`,
      };
    }

    seenEmails.add(email);
    if (employeeId) seenIds.add(employeeId);
    return { kind: "valid", rowNumber, data: result.data };
  });
}

// Reports which required fields the current mapping is missing.
function missingRequiredFields(mapping: ColumnMapping): EmployeeColumn[] {
  return REQUIRED_FIELDS.filter((field) => {
    const index = mapping[field];
    return typeof index !== "number" || index < 0;
  });
}

// Dry run: classify the file under the given mapping and return the counts,
// error/duplicate detail, and a sample of rows that would be created.
export async function previewImport(
  rows: string[][],
  mapping: ColumnMapping,
): Promise<PreviewResult> {
  const missingRequired = missingRequiredFields(mapping);
  if (missingRequired.length > 0) {
    return {
      totalRows: rows.filter((row) => !isRowEmpty(row)).length,
      validCount: 0,
      errors: [],
      duplicates: [],
      sample: [],
      missingRequired,
    };
  }

  const classified = await classifyRows(rows, mapping);

  const errors: PreviewResult["errors"] = [];
  const duplicates: PreviewResult["duplicates"] = [];
  const sample: PreviewResult["sample"] = [];
  let validCount = 0;
  let totalRows = 0;

  for (const item of classified) {
    if (item.kind === "empty") continue;
    totalRows += 1;
    if (item.kind === "error") {
      errors.push({ rowNumber: item.rowNumber, reason: item.reason });
    } else if (item.kind === "duplicate") {
      duplicates.push({ rowNumber: item.rowNumber, reason: item.reason });
    } else {
      validCount += 1;
      if (sample.length < SAMPLE_LIMIT) {
        sample.push({
          rowNumber: item.rowNumber,
          firstName: item.data.firstName,
          lastName: item.data.lastName,
          email: item.data.email,
          department: item.data.department ?? "",
        });
      }
    }
  }

  return {
    totalRows,
    validCount,
    errors,
    duplicates,
    sample,
    missingRequired: [],
  };
}

// Commit: re-classify (against a fresh DB read) and create the valid,
// non-duplicate rows, each with its CREATE change-log entry. Re-classifying
// here keeps the write consistent even if the data changed since preview.
export async function commitImport(
  rows: string[][],
  mapping: ColumnMapping,
): Promise<CommitResult> {
  if (missingRequiredFields(mapping).length > 0) {
    return { created: 0, skipped: 0, errors: 0 };
  }

  const classified = await classifyRows(rows, mapping);

  const valid = classified.filter(
    (item): item is Extract<Classified, { kind: "valid" }> =>
      item.kind === "valid",
  );
  const skipped = classified.filter((item) => item.kind === "duplicate").length;
  const errors = classified.filter((item) => item.kind === "error").length;

  const created = await createEmployeesWithLog(valid.map((item) => item.data));

  revalidatePath("/employees");
  return { created, skipped, errors };
}
