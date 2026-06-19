// Pure (non-server-action) validation and normalization for Employee records.
//
// This logic is shared by two callers: the create/update server actions in
// ./actions.ts (which feed it FormData) and the CSV/Excel import flow (which
// feeds it spreadsheet rows). Keeping it here — outside a "use server" module —
// lets both import the synchronous helpers and the constants below, which a
// "use server" file may not export (those may only export async functions).

import type { Employee } from "@/app/generated/prisma/client";
import {
  EmploymentType,
  PayType,
  EmployeeStatus,
} from "@/app/generated/prisma/enums";

// A pragmatic email shape check: a non-empty local part, an "@", a domain,
// and at least one dot in the domain. Mirrors the browser's type="email".
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Collapse a phone number to a canonical shape: an optional leading "+" (kept
// only when typed at the start) followed by digits. Separators, spaces, parens,
// and other stray characters are dropped so stored numbers are consistent
// regardless of how they were typed.
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return value.startsWith("+") ? `+${digits}` : digits;
}

// Accepts the common range of real phone numbers (national up to E.164's 15
// digits) while rejecting clearly invalid input like a stray "123" or text.
export function isValidPhone(normalized: string): boolean {
  const digitCount = normalized.replace(/\D/g, "").length;
  return digitCount >= 7 && digitCount <= 15;
}

// The set of tracked/importable/exportable Employee columns. Declared as an
// explicit literal union (rather than `keyof EmployeeData`) so it doesn't
// circularly reference the data type, which is built using this union.
export type EmployeeColumn =
  | "employeeId"
  | "firstName"
  | "lastName"
  | "preferredName"
  | "email"
  | "phone"
  | "department"
  | "roleTitle"
  | "roleFamily"
  | "site"
  | "manager"
  | "employmentType"
  | "payType"
  | "status"
  | "hireDate"
  | "terminationDate"
  | "notes";

// A loosely-typed source of raw field values, keyed by Employee field name.
// FormData and parsed spreadsheet rows both get adapted into this shape.
export type EmployeeFieldSource = Partial<
  Record<EmployeeColumn, string | null | undefined>
>;

// Returns the trimmed string value for a field, or null when it's blank.
// Optional columns are nullable, so empty inputs become NULL not "".
function sourceString(
  source: EmployeeFieldSource,
  key: EmployeeColumn,
): string | null {
  const value = source[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// Normalize an enum candidate to a comparison key: uppercase, alphanumerics
// only. So "Full-Time", "full time", and "FULL_TIME" all collapse to the same
// key, letting us match messy spreadsheet values against the canonical enums.
function enumKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Builds a lenient coercer for an enum: it recognizes the enum's own values
// plus a table of common spreadsheet spellings, all compared via enumKey.
function buildEnumCoercer<T extends Record<string, string>>(
  enumObject: T,
  aliases: Record<string, T[keyof T]>,
): (value: string | null) => T[keyof T] | null {
  const lookup = new Map<string, T[keyof T]>();
  for (const value of Object.values(enumObject)) {
    lookup.set(enumKey(value), value as T[keyof T]);
  }
  for (const [alias, value] of Object.entries(aliases)) {
    lookup.set(enumKey(alias), value);
  }
  return (value) => (value === null ? null : lookup.get(enumKey(value)) ?? null);
}

const coerceEmploymentType = buildEnumCoercer(EmploymentType, {
  fulltime: EmploymentType.FULL_TIME,
  ft: EmploymentType.FULL_TIME,
  parttime: EmploymentType.PART_TIME,
  pt: EmploymentType.PART_TIME,
  contract: EmploymentType.CONTRACTOR,
  contractor: EmploymentType.CONTRACTOR,
  temp: EmploymentType.SEASONAL,
  temporary: EmploymentType.SEASONAL,
  seasonal: EmploymentType.SEASONAL,
});

const coercePayType = buildEnumCoercer(PayType, {
  hourly: PayType.HOURLY,
  hour: PayType.HOURLY,
  nonexempt: PayType.HOURLY,
  wage: PayType.HOURLY,
  salary: PayType.SALARY,
  salaried: PayType.SALARY,
  exempt: PayType.SALARY,
});

const coerceStatus = buildEnumCoercer(EmployeeStatus, {
  active: EmployeeStatus.ACTIVE,
  current: EmployeeStatus.ACTIVE,
  employed: EmployeeStatus.ACTIVE,
  leave: EmployeeStatus.LEAVE_OF_ABSENCE,
  loa: EmployeeStatus.LEAVE_OF_ABSENCE,
  onleave: EmployeeStatus.LEAVE_OF_ABSENCE,
  leaveofabsence: EmployeeStatus.LEAVE_OF_ABSENCE,
  terminated: EmployeeStatus.TERMINATED,
  termed: EmployeeStatus.TERMINATED,
  inactive: EmployeeStatus.TERMINATED,
  former: EmployeeStatus.TERMINATED,
});

// Parse a date from the formats real exports use: ISO (YYYY-MM-DD), US
// M/D/Y(YY), or anything else the JS engine recognizes ("Jan 5, 2020", ISO
// datetimes). All resolved to UTC midnight so they round-trip with the
// YYYY-MM-DD serialization used on export and in the change log.
export function parseDate(value: string | null): Date | null {
  if (value === null) return null;
  const v = value.trim();
  if (v === "") return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const date = new Date(`${v}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) {
    const [, mm, dd, yy] = us;
    const year =
      yy.length === 2 ? 2000 + Number(yy) - (Number(yy) < 70 ? 0 : 100) : Number(yy);
    const date = new Date(Date.UTC(year, Number(mm) - 1, Number(dd)));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(v);
  return Number.isNaN(date.getTime()) ? null : date;
}

// The persistable column values, built from a raw field source. Shared by
// create, update, and import. (employeeId/dates/enums are all nullable.)
function buildData(
  source: EmployeeFieldSource,
  normalized: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  },
) {
  return {
    employeeId: sourceString(source, "employeeId"),
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    email: normalized.email,
    preferredName: sourceString(source, "preferredName"),
    phone: normalized.phone,
    department: sourceString(source, "department"),
    roleTitle: sourceString(source, "roleTitle"),
    roleFamily: sourceString(source, "roleFamily"),
    site: sourceString(source, "site"),
    manager: sourceString(source, "manager"),
    employmentType: coerceEmploymentType(sourceString(source, "employmentType")),
    payType: coercePayType(sourceString(source, "payType")),
    status: coerceStatus(sourceString(source, "status")) ?? EmployeeStatus.ACTIVE,
    hireDate: parseDate(sourceString(source, "hireDate")),
    terminationDate: parseDate(sourceString(source, "terminationDate")),
    notes: sourceString(source, "notes"),
  };
}

export type EmployeeData = ReturnType<typeof buildData>;

// Guard: keep EmployeeColumn in lockstep with the keys buildData produces. If a
// column is added/removed, one of these assignments fails to compile.
type _ColumnsMatch = [
  EmployeeColumn extends keyof EmployeeData ? true : never,
  keyof EmployeeData extends EmployeeColumn ? true : never,
];
const _columnsMatch: _ColumnsMatch = [true, true];
void _columnsMatch;

// The Employee columns we track in the audit log, in schema order. Typed as a
// plain readonly array (not an `as const` tuple) so `.map`/iteration infers the
// element as EmployeeColumn rather than any.
export const EMPLOYEE_FIELDS: readonly EmployeeColumn[] = [
  "employeeId",
  "firstName",
  "lastName",
  "preferredName",
  "email",
  "phone",
  "department",
  "roleTitle",
  "roleFamily",
  "site",
  "manager",
  "employmentType",
  "payType",
  "status",
  "hireDate",
  "terminationDate",
  "notes",
];

// Display/export ordering of the columns (groups role + site naturally). Same
// set as EMPLOYEE_FIELDS, used for the export header row, the import template,
// and the column-mapping UI.
export const EMPLOYEE_COLUMNS: readonly EmployeeColumn[] = [
  "employeeId",
  "firstName",
  "lastName",
  "preferredName",
  "email",
  "phone",
  "department",
  "site",
  "roleTitle",
  "roleFamily",
  "manager",
  "employmentType",
  "payType",
  "status",
  "hireDate",
  "terminationDate",
  "notes",
];

export const REQUIRED_FIELDS: readonly EmployeeColumn[] = [
  "firstName",
  "lastName",
  "email",
];

export const FIELD_LABELS: Record<EmployeeColumn, string> = {
  employeeId: "Employee ID",
  firstName: "First name",
  lastName: "Last name",
  preferredName: "Preferred name",
  email: "Email",
  phone: "Phone",
  department: "Department",
  site: "Site",
  roleTitle: "Role title",
  roleFamily: "Role family",
  manager: "Manager",
  employmentType: "Employment type",
  payType: "Pay type",
  status: "Status",
  hireDate: "Hire date",
  terminationDate: "Termination date",
  notes: "Notes",
};

// Returned to the form via useActionState so a clear message can be shown
// next to the inputs instead of crashing to an error boundary.
export type EmployeeFormState = { error?: string };

// Validates and normalizes a raw field source. Returns an error message when a
// required field is missing or a field is malformed; otherwise the data to
// persist. This is the single source of truth for what a valid Employee is.
export function validateEmployeeData(
  source: EmployeeFieldSource,
): { error: string } | { data: EmployeeData } {
  const firstName = sourceString(source, "firstName");
  const lastName = sourceString(source, "lastName");
  const email = sourceString(source, "email");

  if (!firstName) return { error: "First name is required." };
  if (!lastName) return { error: "Last name is required." };
  if (!email) return { error: "Email is required." };
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  // Phone stays optional, but validate + normalize it when present.
  const phoneRaw = sourceString(source, "phone");
  let phone: string | null = null;
  if (phoneRaw !== null) {
    phone = normalizePhone(phoneRaw);
    if (!isValidPhone(phone)) {
      return { error: "Please enter a valid phone number." };
    }
  }

  return {
    data: buildData(source, {
      firstName,
      lastName,
      // Store email in a consistent, lowercased form.
      email: email.toLowerCase(),
      phone,
    }),
  };
}

// JSON-friendly representation of a stored value (dates as YYYY-MM-DD).
type LoggedValue = string | null;
function serializeValue(value: unknown): LoggedValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

// CREATE snapshot: the initial non-empty values, keyed by field.
export function snapshotForCreate(
  data: EmployeeData,
): Record<string, LoggedValue> {
  const snapshot: Record<string, LoggedValue> = {};
  for (const field of EMPLOYEE_FIELDS) {
    const value = serializeValue(data[field]);
    if (value !== null) snapshot[field] = value;
  }
  return snapshot;
}

// UPDATE diff: only the fields whose value actually changed, old → new.
export function diffForUpdate(
  existing: Employee,
  data: EmployeeData,
): Record<string, { from: LoggedValue; to: LoggedValue }> {
  const diff: Record<string, { from: LoggedValue; to: LoggedValue }> = {};
  for (const field of EMPLOYEE_FIELDS) {
    const from = serializeValue(existing[field]);
    const to = serializeValue(data[field]);
    if (from !== to) diff[field] = { from, to };
  }
  return diff;
}

// Auto-guess which spreadsheet column feeds each Employee field by normalizing
// header names (lowercase, strip non-alphanumerics) and matching against the
// field name plus common aliases. Returns a field → header-index map (-1 when
// no header matched). Each header maps to at most one field; first match wins.
const HEADER_ALIASES: Record<EmployeeColumn, string[]> = {
  employeeId: ["employeeid", "empid", "id", "employeenumber", "employeeno", "payrollid", "workerid"],
  firstName: ["firstname", "first", "givenname", "fname", "forename"],
  lastName: ["lastname", "last", "surname", "familyname", "lname"],
  preferredName: ["preferredname", "preferred", "nickname", "goesby", "knownas", "displayname"],
  email: ["email", "emailaddress", "mail", "workemail", "emailid"],
  phone: ["phone", "phonenumber", "mobile", "cell", "cellphone", "telephone", "tel", "contactnumber"],
  department: ["department", "dept", "team", "division", "org", "orgunit"],
  site: ["site", "location", "office", "worksite", "facility", "branch"],
  roleTitle: ["roletitle", "title", "jobtitle", "role", "position", "jobrole"],
  roleFamily: ["rolefamily", "jobfamily", "family", "rolecategory", "jobcategory"],
  manager: ["manager", "managername", "supervisor", "reportsto", "reportingmanager", "linemanager"],
  employmentType: ["employmenttype", "emptype", "type", "worktype", "employment", "workertype"],
  payType: ["paytype", "pay", "compensationtype", "paymenttype", "salarytype", "paybasis"],
  status: ["status", "employeestatus", "employmentstatus", "state"],
  hireDate: ["hiredate", "startdate", "datehired", "hired", "joindate", "joiningdate", "doh"],
  terminationDate: ["terminationdate", "termdate", "enddate", "dateterminated", "separationdate", "exitdate"],
  notes: ["notes", "note", "comments", "comment", "remarks"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function guessColumnMapping(
  headers: string[],
): Record<EmployeeColumn, number> {
  // Build a normalized-alias → field lookup once.
  const aliasToField = new Map<string, EmployeeColumn>();
  for (const field of EMPLOYEE_COLUMNS) {
    for (const alias of HEADER_ALIASES[field]) {
      if (!aliasToField.has(alias)) aliasToField.set(alias, field);
    }
  }

  const mapping = Object.fromEntries(
    EMPLOYEE_COLUMNS.map((field) => [field, -1]),
  ) as Record<EmployeeColumn, number>;

  headers.forEach((header, index) => {
    const field = aliasToField.get(normalizeHeader(header));
    // Assign the first unclaimed header that matches each field.
    if (field && mapping[field] === -1) mapping[field] = index;
  });

  return mapping;
}
