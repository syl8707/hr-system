"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { ChangeAction } from "@/app/generated/prisma/enums";
import {
  EMPLOYEE_FIELDS,
  diffForUpdate,
  snapshotForCreate,
  validateEmployeeData,
  type EmployeeData,
  type EmployeeFieldSource,
  type EmployeeFormState,
} from "./validation";

// The signed-in user's email for stamping change-log rows. Returns null when
// no one is signed in — which is the case today (login is built but not yet
// enforced), and auto-populates once Microsoft login is active.
async function currentUserEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}

// Adapt a submitted form into the raw field source the validator expects: each
// tracked field's value, as a string or null.
function formDataToSource(formData: FormData): EmployeeFieldSource {
  const source: EmployeeFieldSource = {};
  for (const field of EMPLOYEE_FIELDS) {
    const value = formData.get(field);
    source[field] = typeof value === "string" ? value : null;
  }
  return source;
}

function employeeDataFromForm(
  formData: FormData,
): { error: string } | { data: EmployeeData } {
  return validateEmployeeData(formDataToSource(formData));
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

// Bulk-create employees, writing a CREATE change-log row for each insert with
// the signed-in user — the same audit behavior as createEmployee, run for a
// batch inside one transaction so an import either lands whole or not at all.
// Used by the CSV/Excel import flow. Returns the number of rows created.
export async function createEmployeesWithLog(
  rows: EmployeeData[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const changedBy = await currentUserEmail();

  await prisma.$transaction(async (tx) => {
    for (const data of rows) {
      const created = await tx.employee.create({ data });
      await tx.employeeChangeLog.create({
        data: {
          employeeId: created.id,
          action: ChangeAction.CREATE,
          changes: snapshotForCreate(data) as Prisma.InputJsonValue,
          changedBy,
        },
      });
    }
  });

  return rows.length;
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
