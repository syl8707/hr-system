import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { EmployeeStatus, EmploymentType } from "@/app/generated/prisma/enums";
import { AnalyticsFilters } from "./AnalyticsFilters";
import {
  CategoryBar,
  Donut,
  WorkforceTrend,
  type CategoryDatum,
  type TrendDatum,
} from "./Charts";

export const dynamic = "force-dynamic";

// searchParams values are string | string[] | undefined; normalize to one string.
function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// Status slice colors mirror the StatusBadge palette so the donut reads the
// same as the badges elsewhere in the app.
const STATUS_META: Record<EmployeeStatus, { label: string; color: string }> = {
  [EmployeeStatus.ACTIVE]: { label: "Active", color: "#16a34a" }, // green-600
  [EmployeeStatus.LEAVE_OF_ABSENCE]: { label: "On leave", color: "#d97706" }, // amber-600
  [EmployeeStatus.TERMINATED]: { label: "Terminated", color: "#dc2626" }, // red-600
};

const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  [EmploymentType.FULL_TIME]: "Full-time",
  [EmploymentType.PART_TIME]: "Part-time",
  [EmploymentType.CONTRACTOR]: "Contractor",
  [EmploymentType.SEASONAL]: "Seasonal",
};

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
function toCategoryData(
  rows: { key: string | null; count: number }[],
): CategoryDatum[] {
  return rows
    .map((row) => ({ name: row.key ?? "Unassigned", value: row.count }))
    .sort((a, b) => b.value - a.value);
}

// Bucket active employees into tenure ranges. Lives at module scope (not in the
// component) since it reads the current time, which must not happen in render.
function bucketTenure(hireDates: { hireDate: Date | null }[]): CategoryDatum[] {
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
function computeWorkforceTrend(
  rows: { hireDate: Date | null; terminationDate: Date | null }[],
): TrendDatum[] {
  const hireByYear = new Map<number, number>();
  const termByYear = new Map<number, number>();
  for (const { hireDate, terminationDate } of rows) {
    if (hireDate) {
      const y = hireDate.getUTCFullYear();
      hireByYear.set(y, (hireByYear.get(y) ?? 0) + 1);
    }
    if (terminationDate) {
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

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${accent}`} aria-hidden="true" />
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {label}
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-white">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {subtitle}
        </p>
      ) : null}
      <div className="mt-4 h-72">{children}</div>
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const company = first(sp.company);
  const department = first(sp.department);
  const site = first(sp.site);

  // The slice that every metric and chart below is computed over.
  const where: Prisma.EmployeeWhereInput = {};
  if (company) where.company = company;
  if (department) where.department = department;
  if (site) where.site = site;

  const [
    statusGroups,
    companyGroups,
    departmentGroups,
    siteGroups,
    typeGroups,
    activeHireDates,
    employeeDates,
    companyRows,
    departmentRows,
    siteRows,
  ] = await Promise.all([
    prisma.employee.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["company"], where, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["department"], where, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["site"], where, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["employmentType"], where, _count: { _all: true } }),
    // Active employees with a hire date — bucketed into tenure ranges below.
    prisma.employee.findMany({
      where: { ...where, status: EmployeeStatus.ACTIVE, hireDate: { not: null } },
      select: { hireDate: true },
    }),
    // Hire/termination dates for the whole slice — drives the per-year hires,
    // terminations, headcount, turnover and retention.
    prisma.employee.findMany({
      where,
      select: { hireDate: true, terminationDate: true },
    }),
    // Full (unfiltered) option lists so the filter selects can always switch.
    prisma.employee.findMany({
      where: { company: { not: null } },
      select: { company: true },
      distinct: ["company"],
      orderBy: { company: "asc" },
    }),
    prisma.employee.findMany({
      where: { department: { not: null } },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
    prisma.employee.findMany({
      where: { site: { not: null } },
      select: { site: true },
      distinct: ["site"],
      orderBy: { site: "asc" },
    }),
  ]);

  // --- Summary metrics -------------------------------------------------------
  const statusCount = (status: EmployeeStatus) =>
    statusGroups.find((row) => row.status === status)?._count._all ?? 0;
  const active = statusCount(EmployeeStatus.ACTIVE);
  const onLeave = statusCount(EmployeeStatus.LEAVE_OF_ABSENCE);
  const terminated = statusCount(EmployeeStatus.TERMINATED);
  const total = statusGroups.reduce((sum, row) => sum + row._count._all, 0);

  // --- Distribution charts ---------------------------------------------------
  const companyData = toCategoryData(
    companyGroups.map((row) => ({ key: row.company, count: row._count._all })),
  );
  const departmentData = toCategoryData(
    departmentGroups.map((row) => ({ key: row.department, count: row._count._all })),
  );
  const siteData = toCategoryData(
    siteGroups.map((row) => ({ key: row.site, count: row._count._all })),
  );

  const statusData = statusGroups
    .map((row) => ({
      name: STATUS_META[row.status].label,
      value: row._count._all,
      color: STATUS_META[row.status].color,
    }))
    .sort((a, b) => b.value - a.value);

  const typeData: CategoryDatum[] = typeGroups
    .map((row) => ({
      name: row.employmentType
        ? EMPLOYMENT_TYPE_LABEL[row.employmentType]
        : "Unspecified",
      value: row._count._all,
    }))
    .sort((a, b) => b.value - a.value);

  // --- Tenure distribution (active employees) --------------------------------
  const tenureData = bucketTenure(activeHireDates);

  // --- Hires, terminations, turnover & retention per year --------------------
  const trendData = computeWorkforceTrend(employeeDates);

  const companies = companyRows
    .map((row) => row.company)
    .filter((value): value is string => value !== null);
  const departments = departmentRows
    .map((row) => row.department)
    .filter((value): value is string => value !== null);
  const sites = siteRows
    .map((row) => row.site)
    .filter((value): value is string => value !== null);

  const sliceLabel = [
    company ? `${company}` : null,
    department ? `${department}` : null,
    site ? `${site}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Analytics
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Workforce overview{sliceLabel ? ` — ${sliceLabel}` : ""}.
        </p>
      </div>

      <AnalyticsFilters
        companies={companies}
        departments={departments}
        sites={sites}
      />

      {/* Summary metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total headcount" value={total} accent="bg-indigo-500" />
        <MetricCard label="Active" value={active} accent="bg-green-500" />
        <MetricCard label="On leave" value={onLeave} accent="bg-amber-500" />
        <MetricCard label="Terminated" value={terminated} accent="bg-red-500" />
      </div>

      {/* Distribution charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Headcount by company" subtitle="Share of total headcount">
          <CategoryBar data={companyData} total={total} horizontal />
        </ChartCard>
        <ChartCard title="Headcount by department" subtitle="Share of total headcount">
          <CategoryBar data={departmentData} total={total} horizontal />
        </ChartCard>
        <ChartCard title="By status" subtitle="Share of total headcount">
          <Donut data={statusData} total={total} />
        </ChartCard>
        <ChartCard title="Headcount by site" subtitle="Share of total headcount">
          <CategoryBar data={siteData} total={total} horizontal />
        </ChartCard>
        <ChartCard title="By employment type" subtitle="Share of total headcount">
          <Donut data={typeData} total={total} />
        </ChartCard>
        <ChartCard
          title="Tenure distribution"
          subtitle="Active employees, by years since hire date"
        >
          <CategoryBar data={tenureData} />
        </ChartCard>
        <ChartCard
          title="Hires, terminations & turnover"
          subtitle="Per calendar year — turnover and retention as % of average headcount"
        >
          <WorkforceTrend data={trendData} />
        </ChartCard>
      </div>
    </main>
  );
}
