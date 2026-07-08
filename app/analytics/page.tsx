import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { EmployeeStatus } from "@/app/generated/prisma/enums";
import { AnalyticsFilters } from "./AnalyticsFilters";
import { CategoryBar, Donut, WorkforceTrend, type ColoredDatum } from "./Charts";
import {
  bucketTenure,
  bucketTenureAt,
  computeWorkforceTrend,
  EMPLOYMENT_TYPE_META,
  first,
  formatDay,
  parseDateParam,
  STATUS_META,
  toCategoryData,
  UNSPECIFIED_TYPE_COLOR,
} from "./metrics";

export const dynamic = "force-dynamic";

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
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
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
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
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
  const role = first(sp.role);
  const startParam = first(sp.start);
  const endParam = first(sp.end);

  // The category/equality filters. Every metric below is scoped by these.
  const where: Prisma.EmployeeWhereInput = {};
  if (company) where.company = company;
  if (department) where.department = department;
  if (site) where.site = site;
  if (role) where.roleTitle = role;

  // Optional date window. An employee is included when they were active at some
  // point within [windowStart, windowEnd]: hired on/before the end and either
  // still active or terminated on/after the start. Employees with no hireDate
  // can't be placed in time, so the window excludes them. With neither bound
  // set the window is inactive and the dashboard behaves exactly as before.
  const parsedStart = parseDateParam(startParam, "start");
  const parsedEnd = parseDateParam(endParam, "end");
  const hasWindow = parsedStart !== null || parsedEnd !== null;

  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;
  if (hasWindow) {
    // Partial ranges: missing end ⇒ today; missing start ⇒ earliest hire in
    // the filtered slice (so the lower bound never clips anyone out).
    const now = new Date();
    windowEnd =
      parsedEnd ??
      new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      );
    if (parsedStart) {
      windowStart = parsedStart;
    } else {
      const earliest = await prisma.employee.aggregate({
        where: { ...where, hireDate: { not: null } },
        _min: { hireDate: true },
      });
      windowStart = earliest._min.hireDate ?? new Date(0);
    }
  }

  // The slice that every metric and chart below is computed over: the category
  // filters AND, when a window is active, the active-during-window predicate.
  const slice: Prisma.EmployeeWhereInput =
    hasWindow && windowStart && windowEnd
      ? {
          AND: [
            where,
            { hireDate: { not: null, lte: windowEnd } },
            {
              OR: [
                { terminationDate: null },
                { terminationDate: { gte: windowStart } },
              ],
            },
          ],
        }
      : where;

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
    roleRows,
  ] = await Promise.all([
    prisma.employee.groupBy({ by: ["status"], where: slice, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["company"], where: slice, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["department"], where: slice, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["site"], where: slice, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["employmentType"], where: slice, _count: { _all: true } }),
    // Active employees with a hire date — bucketed into tenure ranges for the
    // default (no-window) view, measured as of today.
    prisma.employee.findMany({
      where: { ...where, status: EmployeeStatus.ACTIVE, hireDate: { not: null } },
      select: { hireDate: true },
    }),
    // Hire/termination dates for the slice — drives the per-year hires,
    // terminations, headcount, turnover and retention (and windowed tenure).
    prisma.employee.findMany({
      where: slice,
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
    prisma.employee.findMany({
      where: { roleTitle: { not: null } },
      select: { roleTitle: true },
      distinct: ["roleTitle"],
      orderBy: { roleTitle: "asc" },
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

  const typeData: ColoredDatum[] = typeGroups
    .map((row) => ({
      name: row.employmentType
        ? EMPLOYMENT_TYPE_META[row.employmentType].label
        : "Unspecified",
      value: row._count._all,
      color: row.employmentType
        ? EMPLOYMENT_TYPE_META[row.employmentType].color
        : UNSPECIFIED_TYPE_COLOR,
    }))
    .sort((a, b) => b.value - a.value);

  // --- Tenure distribution ---------------------------------------------------
  // Default view: active employees as of today. Windowed view: the whole
  // included population, with tenure measured as of the window end.
  const tenureData =
    hasWindow && windowEnd
      ? bucketTenureAt(employeeDates, windowEnd.getTime())
      : bucketTenure(activeHireDates);

  // --- Hires, terminations, turnover & retention per year --------------------
  const trendData = computeWorkforceTrend(
    employeeDates,
    hasWindow && windowStart && windowEnd
      ? { a: windowStart.getTime(), b: windowEnd.getTime() }
      : undefined,
  );

  const companies = companyRows
    .map((row) => row.company)
    .filter((value): value is string => value !== null);
  const departments = departmentRows
    .map((row) => row.department)
    .filter((value): value is string => value !== null);
  const sites = siteRows
    .map((row) => row.site)
    .filter((value): value is string => value !== null);
  const roles = roleRows
    .map((row) => row.roleTitle)
    .filter((value): value is string => value !== null);

  const windowLabel =
    hasWindow && windowStart && windowEnd
      ? `${formatDay(windowStart)} → ${formatDay(windowEnd)}`
      : null;

  const sliceLabel = [
    company ? `${company}` : null,
    department ? `${department}` : null,
    site ? `${site}` : null,
    role ? `${role}` : null,
    windowLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const tenureSubtitle = hasWindow
    ? "Included employees, by tenure as of the window end"
    : "Active employees, by years since hire date";

  const reportParams = new URLSearchParams();
  if (parsedStart) reportParams.set("start", startParam);
  if (parsedEnd) reportParams.set("end", endParam);
  const reportQuery = reportParams.size > 0 ? `?${reportParams}` : "";

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Workforce overview{sliceLabel ? ` — ${sliceLabel}` : ""}.
          </p>
        </div>
        {/* The printable report shares the date-window semantics, so carry the
            current window over; its other filters don't apply there. */}
        <Link
          href={`/report${reportQuery}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path
              fillRule="evenodd"
              d="M4.25 2A2.25 2.25 0 0 0 2 4.25v11.5A2.25 2.25 0 0 0 4.25 18h11.5A2.25 2.25 0 0 0 18 15.75V4.25A2.25 2.25 0 0 0 15.75 2H4.25ZM6 13.25V6.75a.75.75 0 0 1 1.5 0v6.5a.75.75 0 0 1-1.5 0Zm3.25-4.5v4.5a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-1.5 0Zm3.25 2v2.5a.75.75 0 0 0 1.5 0v-2.5a.75.75 0 0 0-1.5 0Z"
              clipRule="evenodd"
            />
          </svg>
          Printable report
        </Link>
      </div>

      <AnalyticsFilters
        companies={companies}
        departments={departments}
        sites={sites}
        roles={roles}
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
        <ChartCard title="Tenure distribution" subtitle={tenureSubtitle}>
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
