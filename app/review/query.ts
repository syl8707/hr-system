import type { Prisma } from "@/app/generated/prisma/client";

// searchParams values are string | string[] | undefined; normalize to a single
// string, mirroring app/employees/query.ts.
export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// Emails generated during import for people we don't yet have a real address
// for use this suffix. Kept as a single constant so changing the placeholder
// domain later is a one-line edit.
export const PLACEHOLDER_EMAIL_SUFFIX = "@placeholder.local";

// The fields a review row carries so each check can test it without loading the
// whole record. `employmentType` is an enum on Employee; we only ever test it
// for null, so `unknown` keeps this loosely coupled.
export type ReviewableEmployee = {
  email: string | null;
  site: string | null;
  hireDate: Date | null;
  department: string | null;
  employmentType: unknown;
};

// One data-completeness rule. `where` matches employees that HAVE the issue (so
// it drives both the summary counts and the table filter); `matches` is the
// equivalent per-row test for tagging the Issues column. Add a new entry here
// to extend the checks — the summary, filter, and Issues column all derive from
// this list.
export type ReviewCheck = {
  key: string; // doubles as the `?issue=` URL param value
  label: string; // full label for the summary + filter control
  shortLabel: string; // compact label for the Issues column
  where: Prisma.EmployeeWhereInput;
  matches: (employee: ReviewableEmployee) => boolean;
};

export const REVIEW_CHECKS: ReviewCheck[] = [
  {
    key: "placeholder_email",
    label: "Placeholder email",
    shortLabel: "Email",
    where: { email: { endsWith: PLACEHOLDER_EMAIL_SUFFIX } },
    matches: (e) =>
      e.email != null && e.email.endsWith(PLACEHOLDER_EMAIL_SUFFIX),
  },
  {
    key: "missing_site",
    label: "Missing site",
    shortLabel: "Site",
    where: { OR: [{ site: null }, { site: "" }] },
    matches: (e) => e.site == null || e.site === "",
  },
  {
    key: "missing_hire_date",
    label: "Missing hire date",
    shortLabel: "Hire date",
    where: { hireDate: null },
    matches: (e) => e.hireDate == null,
  },
  {
    key: "missing_department",
    label: "Missing department",
    shortLabel: "Department",
    where: { OR: [{ department: null }, { department: "" }] },
    matches: (e) => e.department == null || e.department === "",
  },
  {
    key: "missing_employment_type",
    label: "Missing employment type",
    shortLabel: "Type",
    where: { employmentType: null },
    matches: (e) => e.employmentType == null,
  },
];

export function findCheck(key: string): ReviewCheck | undefined {
  return REVIEW_CHECKS.find((check) => check.key === key);
}

export type ReviewFilters = {
  q?: string;
  issue?: string;
};

// Builds the Prisma filter for the review table. Search is AND-ed with the
// issue condition: when a specific issue is selected we narrow to just that
// rule, otherwise we match anyone failing at least one check.
export function buildReviewWhere(
  filters: ReviewFilters,
): Prisma.EmployeeWhereInput {
  const and: Prisma.EmployeeWhereInput[] = [];

  const q = (filters.q ?? "").trim();
  if (q) {
    and.push({
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { employeeId: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const selected = filters.issue ? findCheck(filters.issue) : undefined;
  if (selected) {
    and.push(selected.where);
  } else {
    // Any employee with at least one issue.
    and.push({ OR: REVIEW_CHECKS.map((check) => check.where) });
  }

  return and.length === 1 ? and[0] : { AND: and };
}
