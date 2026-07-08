import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { EmployeeStatus } from "@/app/generated/prisma/enums";
import {
  CategoryBar,
  Donut,
  WorkforceTrend,
  type ColoredDatum,
} from "../analytics/Charts";
import {
  bucketTenureAt,
  computeWorkforceTrend,
  EMPLOYMENT_TYPE_META,
  first,
  formatDay,
  parseDateParam,
  STATUS_META,
  toCategoryData,
  UNSPECIFIED_TYPE_COLOR,
} from "../analytics/metrics";
import { ReportControls } from "./ReportControls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workforce Summary — HR System",
  description: "Printable workforce summary report",
};

const COMPANY_NAME = "Patry Group";

// Formal date rendering for the report header, e.g. "July 3, 2026". All range
// math is done in UTC (matching the analytics window logic), so format in UTC
// too — otherwise the label could drift a day from the actual bound.
function formatLong(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
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
    <div className="break-inside-avoid rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none dark:border-slate-800 dark:bg-slate-900">
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
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`break-inside-avoid rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none dark:border-slate-800 dark:bg-slate-900 ${
        wide ? "lg:col-span-2" : ""
      }`}
    >
      <h3 className="text-base font-semibold text-slate-900 dark:text-white">
        {title}
      </h3>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
          {subtitle}
        </p>
      ) : null}
      {/* report-chart / report-chart-wide only exist in the @media print
          rules below — they pin the chart to a fixed print size and are
          inert on screen. */}
      <div
        className={`report-chart mt-4 ${wide ? "report-chart-wide h-80" : "h-72"}`}
      >
        {children}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
      {children}
    </h2>
  );
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;

  // The reporting period. Bounds parse exactly like the analytics window; when
  // a bound is absent the report defaults to the last 12 months (a sensible
  // recent range for a recurring meeting report) rather than all time.
  const now = new Date();
  const parsedStart = parseDateParam(first(sp.start), "start");
  const parsedEnd = parseDateParam(first(sp.end), "end");
  const windowEnd =
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
  const windowStart =
    parsedStart ??
    new Date(
      Date.UTC(
        windowEnd.getUTCFullYear() - 1,
        windowEnd.getUTCMonth(),
        windowEnd.getUTCDate(),
      ),
    );

  // Same "active during the window" predicate the analytics dashboard uses:
  // hired on/before the end and either still active or terminated on/after the
  // start. Employees with no hireDate can't be placed in time, so the window
  // excludes them — also matching analytics.
  const slice: Prisma.EmployeeWhereInput = {
    AND: [
      { hireDate: { not: null, lte: windowEnd } },
      {
        OR: [
          { terminationDate: null },
          { terminationDate: { gte: windowStart } },
        ],
      },
    ],
  };

  const [
    statusGroups,
    companyGroups,
    departmentGroups,
    siteGroups,
    typeGroups,
    employeeDates,
  ] = await Promise.all([
    prisma.employee.groupBy({ by: ["status"], where: slice, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["company"], where: slice, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["department"], where: slice, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["site"], where: slice, _count: { _all: true } }),
    prisma.employee.groupBy({ by: ["employmentType"], where: slice, _count: { _all: true } }),
    // Hire/termination dates for the slice — drives movements, windowed
    // tenure, and the per-year hires/terminations/turnover chart.
    prisma.employee.findMany({
      where: slice,
      select: { hireDate: true, terminationDate: true },
    }),
  ]);

  // --- Summary metrics -------------------------------------------------------
  const statusCount = (status: EmployeeStatus) =>
    statusGroups.find((row) => row.status === status)?._count._all ?? 0;
  const active = statusCount(EmployeeStatus.ACTIVE);
  const onLeave = statusCount(EmployeeStatus.LEAVE_OF_ABSENCE);
  const terminated = statusCount(EmployeeStatus.TERMINATED);
  const total = statusGroups.reduce((sum, row) => sum + row._count._all, 0);

  // --- Movements within the period -------------------------------------------
  // Counted from the same rows as the trend chart so the numbers always agree.
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();
  const inRange = (date: Date | null) =>
    date !== null && date.getTime() >= startMs && date.getTime() <= endMs;
  const hiredInRange = employeeDates.filter((row) => inRange(row.hireDate)).length;
  const terminatedInRange = employeeDates.filter((row) =>
    inRange(row.terminationDate),
  ).length;
  const netChange = hiredInRange - terminatedInRange;

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

  const tenureData = bucketTenureAt(employeeDates, endMs);
  const trendData = computeWorkforceTrend(employeeDates, {
    a: startMs,
    b: endMs,
  });

  const rangeLabel = `${formatLong(windowStart)} – ${formatLong(windowEnd)}`;

  return (
    <main className="mx-auto w-full max-w-5xl px-8 py-10 print:max-w-none print:px-0 print:py-0">
      {/* Print rules that reach outside this page's own markup: hide the app
          shell (the layout's sidebar), force a white canvas, and pin each
          chart to a fixed print size — Recharts sizes its SVGs from the
          on-screen layout and won't re-measure for print. */}
      <style>{`
        @media print {
          body { background: #ffffff; color: #0f172a; }
          /* Browsers strip "background" colors to save ink, and some engines
             extend that to SVG fills — force exact colors on the roots, on
             every element, and on the chart SVGs themselves so bar/slice/line
             fills and strokes survive in the PDF. */
          html, body, body *, svg, svg * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          aside { display: none; }
          /* Recharts' ResponsiveContainer measures the on-screen layout and
             wraps each chart in a 0×0 overflow-visible sizing div, so at
             print time any percentage width inside that stack resolves
             against 0 and the SVG collapses to nothing (series and axes
             vanish while the HTML legend survives). Pin every layer —
             container, sizing div, wrapper, and the SVG itself — to a fixed
             pixel size that fits the printable width of Letter and A4. The
             SVG carries a viewBox, so the already-drawn chart scales to this
             box instead of collapsing or clipping. */
          .report-chart,
          .report-chart .recharts-responsive-container,
          .report-chart .recharts-responsive-container > div,
          .report-chart .recharts-wrapper,
          .report-chart .recharts-wrapper > svg.recharts-surface {
            width: 620px !important;
            max-width: none !important;
            height: 288px !important;
          }
          .report-chart-wide,
          .report-chart-wide .recharts-responsive-container,
          .report-chart-wide .recharts-responsive-container > div,
          .report-chart-wide .recharts-wrapper,
          .report-chart-wide .recharts-wrapper > svg.recharts-surface {
            height: 320px !important;
          }
        }
      `}</style>

      <ReportControls start={formatDay(windowStart)} end={formatDay(windowEnd)} />

      {/* Report header */}
      <header className="mb-10 border-b border-slate-200 pb-8 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              HR
            </span>
            <span className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
              {COMPANY_NAME}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Generated on {formatLong(now)}
          </p>
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Workforce Summary
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Reporting period: {rangeLabel}
        </p>
      </header>

      {/* Headcount at a glance */}
      <section className="mb-10">
        <SectionHeading>Headcount at a glance</SectionHeading>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 print:grid-cols-4">
          <MetricCard
            label="Employed during period"
            value={total}
            accent="bg-indigo-500"
          />
          <MetricCard label="Active" value={active} accent="bg-green-500" />
          <MetricCard label="On leave" value={onLeave} accent="bg-amber-500" />
          <MetricCard label="Terminated" value={terminated} accent="bg-red-500" />
        </div>
      </section>

      {/* Movements */}
      <section className="mb-10">
        <SectionHeading>Movements during the period</SectionHeading>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Hired" value={hiredInRange} accent="bg-indigo-500" />
          <MetricCard
            label="Terminated"
            value={terminatedInRange}
            accent="bg-sky-500"
          />
          <MetricCard
            label="Net change"
            value={netChange}
            accent={netChange >= 0 ? "bg-green-500" : "bg-red-500"}
          />
        </div>
      </section>

      {/* Breakdown charts — same charts and components as the dashboard */}
      <section className="mb-10">
        <SectionHeading>Workforce breakdowns</SectionHeading>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-1">
          {/* animate={false}: the print snapshot can happen mid-animation,
              leaving bars/slices invisible in the PDF. */}
          <ChartCard title="Headcount by company" subtitle="Share of total headcount">
            <CategoryBar data={companyData} total={total} horizontal animate={false} />
          </ChartCard>
          <ChartCard
            title="Headcount by department"
            subtitle="Share of total headcount"
          >
            <CategoryBar data={departmentData} total={total} horizontal animate={false} />
          </ChartCard>
          <ChartCard title="By status" subtitle="Share of total headcount">
            <Donut data={statusData} total={total} animate={false} />
          </ChartCard>
          <ChartCard title="Headcount by site" subtitle="Share of total headcount">
            <CategoryBar data={siteData} total={total} horizontal animate={false} />
          </ChartCard>
          <ChartCard title="By employment type" subtitle="Share of total headcount">
            <Donut data={typeData} total={total} animate={false} />
          </ChartCard>
          <ChartCard
            title="Tenure distribution"
            subtitle="Included employees, by tenure (years) as of the period end"
          >
            <CategoryBar data={tenureData} animate={false} />
          </ChartCard>
          <ChartCard
            title="Hires, terminations & turnover"
            subtitle="Per calendar year within the period — turnover and retention as % of average headcount"
            wide
          >
            <WorkforceTrend data={trendData} animate={false} />
          </ChartCard>
        </div>
      </section>

      {/* Accuracy footnote */}
      <footer className="break-inside-avoid border-t border-slate-200 pt-5 dark:border-slate-800">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          About these numbers
        </p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <li>
            Hire and termination dates are historical, so headcount, who was
            employed during the period, and tenure are exact for the selected
            dates.
          </li>
          <li>
            Department, site, company, employment type, and leave status are
            stored as current values only. For a past period, those breakdowns
            reflect each employee&apos;s <em>current</em> values, not their
            values as of that date.
          </li>
          <li>
            Employees without a hire date cannot be placed in time and are
            excluded from this report.
          </li>
        </ul>
      </footer>
    </main>
  );
}
