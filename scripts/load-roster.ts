// One-off: load the real employee roster from roster.xlsx into the database,
// replacing the fake seed data. Run with:
//
//   npx tsx scripts/load-roster.ts
//
// This is intentionally a direct-to-Prisma loader (the Microsoft login that
// gates the import UI isn't working locally). It reuses the SAME validation,
// normalization, and change-log snapshot logic as the create/import server
// actions (app/employees/validation.ts), so the rows it writes are identical
// to what the UI would produce — including enum coercion, email lowercasing,
// text trimming, and YYYY-MM-DD date parsing.

// Read DATABASE_URL (and friends) from .env.local specifically, not .env.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import * as XLSX from "xlsx";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Relative imports (not the "@/" alias) keep this runnable standalone via tsx,
// matching prisma/seed.ts.
import { PrismaClient } from "../app/generated/prisma/client";
import { ChangeAction } from "../app/generated/prisma/enums";
import type { Prisma } from "../app/generated/prisma/client";
import {
  validateEmployeeData,
  snapshotForCreate,
  type EmployeeData,
  type EmployeeColumn,
  type EmployeeFieldSource,
} from "../app/employees/validation";

const ROSTER_PATH = "roster.xlsx";
// Stamp the audit trail the same way the import flow would for an unattended
// load. (The UI uses the signed-in user's email; there's no session here.)
const CHANGED_BY = "Data import";
// Small batches keep each interactive transaction well under its timeout:
// every row is 2 round-trips (create + log) to a remote Neon database.
const BATCH_SIZE = 20;

// Spreadsheet header -> Employee field. Only the columns present in this
// roster; every other Employee field (phone, manager, etc.) stays unset/null.
const COLUMN_MAP: Record<string, EmployeeColumn> = {
  "First Name": "firstName",
  "Last Name": "lastName",
  "Preferred Name": "preferredName",
  Email: "email",
  Company: "company",
  Department: "department",
  Site: "site",
  "Job Title": "roleTitle",
  "Employment Type": "employmentType",
  "Pay Type": "payType",
  Status: "status",
  "Hire Date": "hireDate",
  Notes: "notes",
};

type RawRow = Record<string, unknown>;

// Turn a spreadsheet row into the raw field source the validator expects:
// each mapped field as a string (or null when blank/missing). Trimming and
// blank->null are handled downstream in validation.ts.
function rowToSource(row: RawRow): EmployeeFieldSource {
  const source: EmployeeFieldSource = {};
  for (const [header, field] of Object.entries(COLUMN_MAP)) {
    const value = row[header];
    source[field] =
      value === null || value === undefined ? null : String(value);
  }
  return source;
}

async function main() {
  // 1. Read + validate the whole roster BEFORE touching the database. A bad
  //    row aborts here, so we never wipe the table and then fail to refill it.
  const workbook = XLSX.readFile(ROSTER_PATH);
  const sheetName = workbook.SheetNames[0];
  // raw:false renders dates with their cell format (YYYY-MM-DD here) so the
  // shared date parser sees the same string the export/import path would.
  const rows = XLSX.utils.sheet_to_json<RawRow>(workbook.Sheets[sheetName], {
    defval: null,
    raw: false,
  });

  const prepared: EmployeeData[] = [];
  const errors: string[] = [];
  rows.forEach((row, i) => {
    const result = validateEmployeeData(rowToSource(row));
    if ("error" in result) {
      // +2: 1 for the header row, 1 for 1-based spreadsheet rows.
      errors.push(`Row ${i + 2}: ${result.error}`);
    } else {
      prepared.push(result.data);
    }
  });

  if (errors.length > 0) {
    console.error(`Aborting — ${errors.length} invalid row(s), nothing changed:`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  console.log(`Parsed ${prepared.length} valid employee row(s) from ${ROSTER_PATH}.`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    // 2. Clear the fake seed data. Change log first, then employees.
    const deletedLogs = await prisma.employeeChangeLog.deleteMany();
    const deletedEmployees = await prisma.employee.deleteMany();
    console.log(`Deleted ${deletedLogs.count} EmployeeChangeLog row(s).`);
    console.log(`Deleted ${deletedEmployees.count} Employee row(s).`);

    // 3. Insert in batches; each batch is one transaction that creates the
    //    employee and its CREATE change-log row together, exactly like the
    //    createEmployeesWithLog server action.
    let created = 0;
    for (let start = 0; start < prepared.length; start += BATCH_SIZE) {
      const batch = prepared.slice(start, start + BATCH_SIZE);
      await prisma.$transaction(
        async (tx) => {
          for (const data of batch) {
            const employee = await tx.employee.create({ data });
            await tx.employeeChangeLog.create({
              data: {
                employeeId: employee.id,
                action: ChangeAction.CREATE,
                changes: snapshotForCreate(data) as Prisma.InputJsonValue,
                changedBy: CHANGED_BY,
              },
            });
          }
        },
        // Generous ceilings for a remote DB; a batch still finishes in ~1-2s.
        { maxWait: 30_000, timeout: 60_000 },
      );
      created += batch.length;
      console.log(`  inserted ${created}/${prepared.length}`);
    }

    // 4. Summary + breakdown by company.
    console.log(`\nCreated ${created} employee(s).`);
    const byCompany = new Map<string, number>();
    for (const data of prepared) {
      const key = data.company ?? "(no company)";
      byCompany.set(key, (byCompany.get(key) ?? 0) + 1);
    }
    console.log("By company:");
    for (const [company, count] of [...byCompany].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${company}: ${count}`);
    }

    const total = await prisma.employee.count();
    console.log(`\nEmployee row count is now ${total}.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
