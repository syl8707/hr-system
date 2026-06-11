"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  EmploymentType,
  PayType,
  EmployeeStatus,
} from "@/app/generated/prisma/enums";

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

// Builds the column values shared by create and update from a submitted form.
// Throws if a required (non-null) column is missing.
function employeeDataFromForm(formData: FormData) {
  const employeeId = optionalString(formData, "employeeId");
  const firstName = optionalString(formData, "firstName");
  const lastName = optionalString(formData, "lastName");

  if (!employeeId || !firstName || !lastName) {
    throw new Error("employeeId, firstName, and lastName are required.");
  }

  return {
    employeeId,
    firstName,
    lastName,
    preferredName: optionalString(formData, "preferredName"),
    email: optionalString(formData, "email"),
    phone: optionalString(formData, "phone"),
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

export async function createEmployee(formData: FormData) {
  await prisma.employee.create({ data: employeeDataFromForm(formData) });

  revalidatePath("/employees");
  redirect("/employees");
}

export async function updateEmployee(id: string, formData: FormData) {
  await prisma.employee.update({
    where: { id },
    data: employeeDataFromForm(formData),
  });

  // Refresh both the list and this employee's detail/edit views.
  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  redirect(`/employees/${id}`);
}

export async function deleteEmployee(id: string) {
  await prisma.employee.delete({ where: { id } });

  revalidatePath("/employees");
  redirect("/employees");
}
