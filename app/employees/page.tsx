import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { EmployeeStatus } from "@/app/generated/prisma/enums";
import { buildEmployeeOrderBy, buildEmployeeWhere } from "./query";
import { SITE_OPTIONS } from "./siteOptions";
import { EmployeesFilters } from "./EmployeesFilters";
import { StatusBadge } from "./StatusBadge";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(date: Date | null) {
  return date ? DATE_FORMAT.format(date) : "—";
}

// Tenure from hireDate to an end date: the termination date for terminated
// employees, otherwise today. Keeps the figure correct for both current and
// former staff. Rendered as "3 yr 4 mo", "5 mo", or "less than a month"; "—"
// when there's no hire date.
function formatDuration(
  hireDate: Date | null,
  terminationDate: Date | null,
  status: EmployeeStatus,
): string {
  if (!hireDate) return "—";
  const end =
    status === EmployeeStatus.TERMINATED && terminationDate
      ? terminationDate
      : new Date();

  let months =
    (end.getFullYear() - hireDate.getFullYear()) * 12 +
    (end.getMonth() - hireDate.getMonth());
  if (end.getDate() < hireDate.getDate()) months -= 1;

  if (months < 1) return "less than a month";

  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr`);
  if (remMonths > 0) parts.push(`${remMonths} mo`);
  return parts.join(" ");
}

// searchParams values are string | string[] | undefined; normalize to a single string.
function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const q = first(sp.q).trim();
  const company = first(sp.company);
  const department = first(sp.department);
  const site = first(sp.site);
  const status = first(sp.status);
  const sort = first(sp.sort);
  const requestedPage = Number.parseInt(first(sp.page), 10);
  const page = Number.isNaN(requestedPage) || requestedPage < 1 ? 1 : requestedPage;

  // Build the filter once; reused for both the count and the page query, and
  // for the export route so a download honors the same filters.
  const where = buildEmployeeWhere({ q, company, department, site, status });

  const [total, companyRows, departmentRows, siteRows] = await Promise.all([
    prisma.employee.count({ where }),
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const employees = await prisma.employee.findMany({
    where,
    orderBy: buildEmployeeOrderBy(sort),
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const companies = companyRows
    .map((row) => row.company)
    .filter((value): value is string => value !== null);
  const departments = departmentRows
    .map((row) => row.department)
    .filter((value): value is string => value !== null);
  // Union the canonical site list with distinct DB values so the predefined
  // sites always appear in the filter, even when unassigned to any employee.
  const sites = [
    ...new Set([
      ...SITE_OPTIONS,
      ...siteRows
        .map((row) => row.site)
        .filter((value): value is string => value !== null),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  // Preserve the active filters when building pagination links.
  function pageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (company) params.set("company", company);
    if (department) params.set("department", department);
    if (site) params.set("site", site);
    if (status) params.set("status", status);
    if (sort) params.set("sort", sort);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/employees?${qs}` : "/employees";
  }

  // The export download carries the active filters (not pagination) so users
  // get exactly the set they're looking at.
  const exportParams = new URLSearchParams();
  if (q) exportParams.set("q", q);
  if (company) exportParams.set("company", company);
  if (department) exportParams.set("department", department);
  if (site) exportParams.set("site", site);
  if (status) exportParams.set("status", status);
  const exportQs = exportParams.toString();
  const exportHref = exportQs
    ? `/employees/export?${exportQs}`
    : "/employees/export";

  const navBtn =
    "rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
  const navBtnDisabled =
    "cursor-not-allowed rounded-md border border-slate-200 px-3 py-1.5 font-medium text-slate-300 dark:border-slate-800 dark:text-slate-600";

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Employees
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your organization&rsquo;s people.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={exportHref}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Export
          </a>
          <Link
            href="/employees/import"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Import
          </Link>
          <Link
            href="/employees/new"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            New employee
          </Link>
        </div>
      </div>

      <EmployeesFilters
        companies={companies}
        departments={departments}
        sites={sites}
        statuses={Object.values(EmployeeStatus)}
      />

      {employees.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          {total === 0 && !q && !company && !department && !site && !status ? (
            <>
              No employees yet.{" "}
              <Link
                href="/employees/new"
                className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                Add the first one
              </Link>
              .
            </>
          ) : (
            "No employees match your filters."
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Employee ID</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Site</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Hire date</th>
                  <th className="px-4 py-3 font-medium">Termination date</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {employees.map((employee) => {
                  const href = `/employees/${employee.id}`;
                  // Each cell is a block-level link so the whole row is clickable
                  // while staying valid HTML (anchors can't wrap <tr>/<td>).
                  const cell = "block px-4 py-3 text-slate-700 dark:text-slate-300";
                  return (
                    <tr
                      key={employee.id}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td>
                        <Link
                          href={href}
                          className={`${cell} font-mono text-xs text-slate-500 dark:text-slate-400`}
                        >
                          {employee.employeeId}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={href}
                          className={`${cell} font-medium text-slate-900 dark:text-white`}
                        >
                          {employee.firstName} {employee.lastName}
                          {employee.preferredName ? (
                            <span className="font-normal text-slate-400">
                              {" "}
                              ({employee.preferredName})
                            </span>
                          ) : null}
                        </Link>
                      </td>
                      <td>
                        <Link href={href} className={cell}>
                          {employee.email ?? "—"}
                        </Link>
                      </td>
                      <td>
                        <Link href={href} className={cell}>
                          {employee.company ?? "—"}
                        </Link>
                      </td>
                      <td>
                        <Link href={href} className={cell}>
                          {employee.department ?? "—"}
                        </Link>
                      </td>
                      <td>
                        <Link href={href} className={cell}>
                          {employee.roleTitle ?? "—"}
                        </Link>
                      </td>
                      <td>
                        <Link href={href} className={cell}>
                          {employee.site ?? "—"}
                        </Link>
                      </td>
                      <td>
                        <Link href={href} className={cell}>
                          {employee.employmentType ?? "—"}
                        </Link>
                      </td>
                      <td>
                        <Link href={href} className="block px-4 py-3">
                          <StatusBadge status={employee.status} />
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={href}
                          className={`${cell} tabular-nums`}
                        >
                          {formatDate(employee.hireDate)}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={href}
                          className={`${cell} tabular-nums`}
                        >
                          {formatDate(employee.terminationDate)}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={href}
                          className={`${cell} tabular-nums`}
                        >
                          {formatDuration(
                            employee.hireDate,
                            employee.terminationDate,
                            employee.status,
                          )}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={href}
                          className={`${cell} tabular-nums text-slate-500 dark:text-slate-400`}
                        >
                          {formatDate(employee.updatedAt)}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>
            <span className="font-medium text-slate-900 dark:text-white">
              {total.toLocaleString()}
            </span>{" "}
            {total === 1 ? "employee" : "employees"} · Page {currentPage} of{" "}
            {totalPages}
          </span>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Link href={pageHref(currentPage - 1)} className={navBtn}>
                Previous
              </Link>
            ) : (
              <span className={navBtnDisabled}>Previous</span>
            )}
            {currentPage < totalPages ? (
              <Link href={pageHref(currentPage + 1)} className={navBtn}>
                Next
              </Link>
            ) : (
              <span className={navBtnDisabled}>Next</span>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
