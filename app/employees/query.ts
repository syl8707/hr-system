import type { Prisma } from "@/app/generated/prisma/client";
import { EmployeeStatus } from "@/app/generated/prisma/enums";

// searchParams values are string | string[] | undefined; normalize to a single string.
export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export type EmployeeFilters = {
  q?: string;
  company?: string;
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
  if (filters.company) where.company = filters.company;
  if (filters.department) where.department = filters.department;
  if (filters.site) where.site = filters.site;
  if (filters.status && filters.status in EmployeeStatus) {
    where.status = filters.status as EmployeeStatus;
  }

  return where;
}

// Sort options offered by the list's "Sort by" control. The values double as
// the `?sort=` URL param. `name_asc` matches the default ordering, so an empty
// param and `name_asc` produce the same result.
export const SORT_OPTIONS = [
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "hire_asc", label: "Hire date (oldest first)" },
  { value: "hire_desc", label: "Hire date (newest first)" },
  { value: "company_asc", label: "Company (A–Z)" },
  { value: "duration_desc", label: "Duration (longest first)" },
] as const;

export const DEFAULT_SORT = "name_asc";

// Maps a sort key to a Prisma orderBy. Unknown/empty keys fall back to the
// existing default (last name, then first name). Applied at the DB level so
// server-side pagination keeps working.
export function buildEmployeeOrderBy(
  sort: string,
): Prisma.EmployeeOrderByWithRelationInput[] {
  switch (sort) {
    case "name_desc":
      return [{ lastName: "desc" }, { firstName: "desc" }];
    case "hire_asc":
      return [{ hireDate: { sort: "asc", nulls: "last" } }];
    case "hire_desc":
      return [{ hireDate: { sort: "desc", nulls: "last" } }];
    case "company_asc":
      return [{ company: { sort: "asc", nulls: "last" } }];
    // Longest tenure first = earliest hireDate first. Exact while everyone is
    // active; refine once terminated employees' end dates factor in.
    case "duration_desc":
      return [{ hireDate: { sort: "asc", nulls: "last" } }];
    case "name_asc":
    default:
      return [{ lastName: "asc" }, { firstName: "asc" }];
  }
}
