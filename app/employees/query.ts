import type { Prisma } from "@/app/generated/prisma/client";
import { EmployeeStatus } from "@/app/generated/prisma/enums";

// searchParams values are string | string[] | undefined; normalize to a single string.
export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export type EmployeeFilters = {
  q?: string;
  department?: string;
  site?: string;
  status?: string;
};

// Builds the Prisma filter shared by the list view and the export route, so a
// download honors whatever search/filter the user currently has applied.
export function buildEmployeeWhere(
  filters: EmployeeFilters,
): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = {};

  const q = (filters.q ?? "").trim();
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { employeeId: { contains: q, mode: "insensitive" } },
    ];
  }
  if (filters.department) where.department = filters.department;
  if (filters.site) where.site = filters.site;
  if (filters.status && filters.status in EmployeeStatus) {
    where.status = filters.status as EmployeeStatus;
  }

  return where;
}
