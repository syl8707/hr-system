// Shared metric helpers for the analytics dashboard and the printable report.
// Everything here is pure (no data access) so both server pages can compute
// identical numbers from the same employee rows.

import { EmployeeStatus, EmploymentType } from "@/app/generated/prisma/enums";
import type { CategoryDatum, TrendDatum } from "./Charts";

// searchParams values are string | string[] | undefined; normalize to one string.
export function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// Parse a `YYYY-MM-DD` date param (as produced by the <input type="date">
// filters) into a UTC instant, returning null for empty or unparseable values
// so a bad param degrades to "no bound" rather than erroring. The start bound
// anchors to the start of its day and the end bound to the end of its day, so
// the window is inclusive of employees hired or terminated on the edge dates.
export function parseDateParam(
  value: string,
  edge: "start" | "end",
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const suffix = edge === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Status slice colors mirror the StatusBadge palette so the donut reads the
// same as the badges elsewhere in the app.
export const STATUS_META: Record<
  EmployeeStatus,
  { label: string; color: string }
> = {
  [EmployeeStatus.ACTIVE]: { label: "Active", color: "#16a34a" }, // green-600
  [EmployeeStatus.LEAVE_OF_ABSENCE]: { label: "On leave", color: "#d97706" }, // amber-600
  [EmployeeStatus.TERMINATED]: { label: "Terminated", color: "#dc2626" }, // red-600
};

// Each employment type gets a fixed slice color from a categorical palette of
// distinct hues (indigo / teal / orange / pink), so the donut stays readable
// even though slices are reordered by headcount. "Unspecified" falls back to a
// neutral slate. Hues are spaced far enough apart to tell apart at a glance.
export const EMPLOYMENT_TYPE_META: Record<
  EmploymentType,
  { label: string; color: string }
> = {
  [EmploymentType.FULL_TIME]: { label: "Full-time", color: "#4f46e5" }, // indigo-600
  [EmploymentType.PART_TIME]: { label: "Part-time", color: "#0d9488" }, // teal-600
  [EmploymentType.CONTRACTOR]: { label: "Contractor", color: "#ea580c" }, // orange-600
  [EmploymentType.SEASONAL]: { label: "Seasonal", color: "#db2777" }, // pink-600
};

export const UNSPECIFIED_TYPE_COLOR = "#94a3b8"; // slate-400

// Active-employee tenure buckets, in years since hireDate. Boundaries are
// contiguous so every active employee with a hire date lands in exactly one.
const TENURE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "<1", min: 0, max: 1 },
  { label: "1-2", min: 1, max: 3 },
  { label: "3-5", min: 3, max: 5 },
  { label: "5-10", min: 5, max: 10 },
  { label: "10+", min: 10, max: Infinity },
];

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

// Turn a groupBy result over a nullable string field into chart data, mapping
// nulls to "Unassigned" and sorting by headcount (desc) for a readable chart.
export function toCategoryData(
  rows: { key: string | null; count: number }[],
): CategoryDatum[] {
  return rows
    .map((row) => ({ name: row.key ?? "Unassigned", value: row.count }))
    .sort((a, b) => b.value - a.value);
}

// Bucket active employees into tenure ranges. Lives at module scope (not in a
// component) since it reads the current time, which must not happen in render.
export function bucketTenure(
  hireDates: { hireDate: Date | null }[],
): CategoryDatum[] {
  const now = Date.now();
  const counts = TENURE_BUCKETS.map((bucket) => ({ ...bucket, value: 0 }));
  for (const { hireDate } of hireDates) {
    if (!hireDate) continue;
    const years = (now - hireDate.getTime()) / MS_PER_YEAR;
    const bucket = counts.find((b) => years >= b.min && years < b.max);
    if (bucket) bucket.value += 1;
  }
  return counts.map((b) => ({ name: b.label, value: b.value }));
}

// Tenure buckets measured as of the window end B: each included employee's
// tenure runs from hireDate to min(terminationDate, B), so a person who left
// during the window contributes the tenure they had reached when they left.
export function bucketTenureAt(
  rows: { hireDate: Date | null; terminationDate: Date | null }[],
  endMs: number,
): CategoryDatum[] {
  const counts = TENURE_BUCKETS.map((bucket) => ({ ...bucket, value: 0 }));
  for (const { hireDate, terminationDate } of rows) {
    if (!hireDate) continue;
    const endedAt =
      terminationDate && terminationDate.getTime() < endMs
        ? terminationDate.getTime()
        : endMs;
    const years = (endedAt - hireDate.getTime()) / MS_PER_YEAR;
    const bucket = counts.find((b) => years >= b.min && years < b.max);
    if (bucket) bucket.value += 1;
  }
  return counts.map((b) => ({ name: b.label, value: b.value }));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

// Per-year hires, terminations, turnover and retention, all derived from
// hire/termination dates so they respect the active filter slice.
//
//   turnover  = terminations that year ÷ average headcount that year × 100
//   retention = 100 − turnover
//
// Average headcount uses the start-of-year and end-of-year counts, where a
// person is "present" at instant T if hired on/before T and not yet terminated.
//
// When a window [a, b] (ms) is given, only hires/terminations that fall inside
// it are counted — so the chart's years collapse to those touching the window —
// while headcount (the turnover denominator) still uses every row's real dates.
export function computeWorkforceTrend(
  rows: { hireDate: Date | null; terminationDate: Date | null }[],
  window?: { a: number; b: number },
): TrendDatum[] {
  const inWindow = (t: number) => !window || (t >= window.a && t <= window.b);
  const hireByYear = new Map<number, number>();
  const termByYear = new Map<number, number>();
  for (const { hireDate, terminationDate } of rows) {
    if (hireDate && inWindow(hireDate.getTime())) {
      const y = hireDate.getUTCFullYear();
      hireByYear.set(y, (hireByYear.get(y) ?? 0) + 1);
    }
    if (terminationDate && inWindow(terminationDate.getTime())) {
      const y = terminationDate.getUTCFullYear();
      termByYear.set(y, (termByYear.get(y) ?? 0) + 1);
    }
  }

  // Headcount present at instant T (ms): hired on/before T, terminated after T.
  const headcountAt = (t: number) =>
    rows.reduce((count, { hireDate, terminationDate }) => {
      if (!hireDate || hireDate.getTime() > t) return count;
      if (terminationDate && terminationDate.getTime() <= t) return count;
      return count + 1;
    }, 0);

  const years = [...new Set([...hireByYear.keys(), ...termByYear.keys()])].sort(
    (a, b) => a - b,
  );

  return years.map((year) => {
    const hires = hireByYear.get(year) ?? 0;
    const terminations = termByYear.get(year) ?? 0;
    const startHc = headcountAt(Date.UTC(year, 0, 1));
    const endHc = headcountAt(Date.UTC(year + 1, 0, 1));
    const avgHc = (startHc + endHc) / 2;
    const turnover = avgHc > 0 ? round1((terminations / avgHc) * 100) : null;
    const retention = turnover === null ? null : round1(100 - turnover);
    return { year: String(year), hires, terminations, turnover, retention };
  });
}
