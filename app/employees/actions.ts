"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Employee, Prisma } from "@/app/generated/prisma/client";
import {
  EmploymentType,
  PayType,
  EmployeeStatus,
  ChangeAction,
} from "@/app/generated/prisma/enums";

// The signed-in user's email for stamping change-log rows. Returns null when
// no one is signed in — which is the case today (login is built but not yet
// enforced), and auto-populates once Microsoft login is active.
async function currentUserEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}

// The mutable employee columns we track in the audit log. Mirrors the keys
// produced by buildData (excludes id/createdAt/updatedAt).
type EmployeeData = ReturnType<typeof buildData>;
const TRACKED_FIELDS = [
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
] as const satisfies ReadonlyArray<keyof EmployeeData>;

// JSON-friendly representation of a stored value (dates as YYYY-MM-DD).
type LoggedValue = string | null;
function serializeValue(value: unknown): LoggedValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

// CREATE snapshot: the initial non-empty values, keyed by field.
function snapshotForCreate(data: EmployeeData): Record<string, LoggedValue> {
  const snapshot: Record<string, LoggedValue> = {};
  for (const field of TRACKED_FIELDS) {
    const value = serializeValue(data[field]);
    if (value !== null) snapshot[field] = value;
  }
  return snapshot;
}

// UPDATE diff: only the fields whose value actually changed, old → new.
function diffForUpdate(
  existing: Employee,
  data: EmployeeData,
): Record<string, { from: LoggedValue; to: LoggedValue }> {
  const diff: Record<string, { from: LoggedValue; to: LoggedValue }> = {};
  for (const field of TRACKED_FIELDS) {
    const from = serializeValue(existing[field]);
    const to = serializeValue(data[field]);
    if (from !== to) diff[field] = { from, to };
  }
  return diff;
}

// Returns the trimmed string value for a form field, or null when it's blank.
// Optional columns are nullable, so empty inputs should be stored as NULL
// rather than empty strings.
function optionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// Narrow an optional form value to a member of the given enum, or null.
function optionalEnum<T extends Record<string, string>>(
  formData: FormData,
  key: string,
  enumObject: T,
): T[keyof T] | null {
  const value = optionalString(formData, key);
  if (value === null) return null;
  return Object.values(enumObject).includes(value)
    ? (value as T[keyof T])
    : null;
}

function optionalDate(formData: FormData, key: string): Date | null {
  const value = optionalString(formData, key);
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// A pragmatic email shape check: a non-empty local part, an "@", a domain,
// and at least one dot in the domain. Mirrors the browser's type="email".
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Collapse a phone number to a canonical shape: an optional leading "+" (kept
// only when the user typed one at the start) followed by digits. Separators,
// spaces, parens, and other stray characters are dropped so stored numbers are
// consistent regardless of how they were typed.
function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return value.startsWith("+") ? `+${digits}` : digits;
}

// Accepts the common range of real phone numbers (national up to E.164's 15
// digits) while rejecting clearly invalid input like a stray "123" or text.
function isValidPhone(normalized: string): boolean {
  const digitCount = normalized.replace(/\D/g, "").length;
  return digitCount >= 7 && digitCount <= 15;
}

// Returned to the form via useActionState so a clear message can be shown
// next to the inputs instead of crashing to an error boundary.
export type EmployeeFormState = { error?: string };

// Builds the column values shared by create and update from a submitted form.
// Returns a validation error message when a required field is missing or a
// field is malformed; otherwise returns the (normalized) data to persist.
function employeeDataFromForm(
  formData: FormData,
): { error: string } | { data: ReturnType<typeof buildData> } {
  const firstName = optionalString(formData, "firstName");
  const lastName = optionalString(formData, "lastName");
  const email = optionalString(formData, "email");

  if (!firstName) return { error: "First name is required." };
  if (!lastName) return { error: "Last name is required." };
  if (!email) return { error: "Email is required." };
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  // Phone stays optional, but validate + normalize it when present.
  const phoneRaw = optionalString(formData, "phone");
  let phone: string | null = null;
  if (phoneRaw !== null) {
    phone = normalizePhone(phoneRaw);
    if (!isValidPhone(phone)) {
      return { error: "Please enter a valid phone number." };
    }
  }

  return {
    data: buildData(formData, {
      firstName,
      lastName,
      // Store email in a consistent, lowercased form.
      email: email.toLowerCase(),
      phone,
    }),
  };
}

function buildData(
  formData: FormData,
  normalized: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  },
) {
  return {
    employeeId: optionalString(formData, "employeeId"),
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    email: normalized.email,
    preferredName: optionalString(formData, "preferredName"),
    phone: normalized.phone,
    department: optionalString(formData, "department"),
    roleTitle: optionalString(formData, "roleTitle"),
    roleFamily: optionalString(formData, "roleFamily"),
    site: optionalString(formData, "site"),
    manager: optionalString(formData, "manager"),
    employmentType: optionalEnum(formData, "employmentType", EmploymentType),
    payType: optionalEnum(formData, "payType", PayType),
    status:
      optionalEnum(formData, "status", EmployeeStatus) ?? EmployeeStatus.ACTIVE,
    hireDate: optionalDate(formData, "hireDate"),
    terminationDate: optionalDate(formData, "terminationDate"),
    notes: optionalString(formData, "notes"),
  };
}

export async function createEmployee(
  _prevState: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const result = employeeDataFromForm(formData);
  if ("error" in result) return { error: result.error };

  const changedBy = await currentUserEmail();

  // Insert the employee and record a CREATE log entry atomically.
  await prisma.$transaction(async (tx) => {
    const created = await tx.employee.create({ data: result.data });
    await tx.employeeChangeLog.create({
      data: {
        employeeId: created.id,
        action: ChangeAction.CREATE,
        changes: snapshotForCreate(result.data) as Prisma.InputJsonValue,
        changedBy,
      },
    });
  });

  revalidatePath("/employees");
  redirect("/employees");
}

export async function updateEmployee(
  id: string,
  _prevState: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const result = employeeDataFromForm(formData);
  if ("error" in result) return { error: result.error };

  const changedBy = await currentUserEmail();

  // Diff against the stored record, update, and log only the changed fields.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.employee.findUnique({ where: { id } });
    const updated = await tx.employee.update({
      where: { id },
      data: result.data,
    });

    const diff = existing ? diffForUpdate(existing, result.data) : {};
    // Skip no-op saves so the history only shows real changes.
    if (Object.keys(diff).length > 0) {
      await tx.employeeChangeLog.create({
        data: {
          employeeId: updated.id,
          action: ChangeAction.UPDATE,
          changes: diff as Prisma.InputJsonValue,
          changedBy,
        },
      });
    }
  });

  // Refresh both the list and this employee's detail/edit views.
  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  redirect(`/employees/${id}`);
}

export async function deleteEmployee(id: string) {
  const changedBy = await currentUserEmail();

  // Delete the employee and record a DELETE marker. The log row is kept even
  // though the employee is gone (no FK/cascade between them).
  await prisma.$transaction(async (tx) => {
    await tx.employee.delete({ where: { id } });
    await tx.employeeChangeLog.create({
      data: {
        employeeId: id,
        action: ChangeAction.DELETE,
        changes: { deleted: true } as Prisma.InputJsonValue,
        changedBy,
      },
    });
  });

  revalidatePath("/employees");
  redirect("/employees");
}
