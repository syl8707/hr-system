import Link from "next/link";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { EmployeeStatus } from "@/app/generated/prisma/enums";
import { EmployeesFilters } from "./EmployeesFilters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

function formatDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "—";
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
  const department = first(sp.department);
  const site = first(sp.site);
  const status = first(sp.status);
  const requestedPage = Number.parseInt(first(sp.page), 10);
  const page = Number.isNaN(requestedPage) || requestedPage < 1 ? 1 : requestedPage;

  // Build the filter once; reused for both the count and the page query.
  const where: Prisma.EmployeeWhereInput = {};
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { employeeId: { contains: q, mode: "insensitive" } },
    ];
  }
  if (department) where.department = department;
  if (site) where.site = site;
  if (status && status in EmployeeStatus) {
    where.status = status as EmployeeStatus;
  }

  const [total, departmentRows, siteRows] = await Promise.all([
    prisma.employee.count({ where }),
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
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const departments = departmentRows
    .map((row) => row.department)
    .filter((value): value is string => value !== null);
  const sites = siteRows
    .map((row) => row.site)
    .filter((value): value is string => value !== null);

  // Preserve the active filters when building pagination links.
  function pageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (department) params.set("department", department);
    if (site) params.set("site", site);
    if (status) params.set("status", status);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/employees?${qs}` : "/employees";
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        <Link
          href="/employees/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          New employee
        </Link>
      </div>

      <EmployeesFilters
        departments={departments}
        sites={sites}
        statuses={Object.values(EmployeeStatus)}
      />

      {employees.length === 0 ? (
        <p className="text-zinc-500">
          {total === 0 && !q && !department && !site && !status ? (
            <>
              No employees yet.{" "}
              <Link href="/employees/new" className="underline">
                Add the first one
              </Link>
              .
            </>
          ) : (
            "No employees match your filters."
          )}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Employee ID</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Site</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Hire date</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const href = `/employees/${employee.id}`;
                // Each cell is a block-level link so the whole row is clickable
                // while staying valid HTML (anchors can't wrap <tr>/<td>).
                const cell = "block px-4 py-3";
                return (
                  <tr
                    key={employee.id}
                    className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <td>
                      <Link href={href} className={`${cell} font-mono text-xs`}>
                        {employee.employeeId}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cell}>
                        {employee.firstName} {employee.lastName}
                        {employee.preferredName ? (
                          <span className="text-zinc-500">
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
                      <Link href={href} className={cell}>
                        {employee.status}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cell}>
                        {formatDate(employee.hireDate)}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
          <span>
            {total.toLocaleString()}{" "}
            {total === 1 ? "employee" : "employees"} · Page {currentPage} of{" "}
            {totalPages}
          </span>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Link
                href={pageHref(currentPage - 1)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Previous
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-md border border-zinc-200 px-3 py-1.5 font-medium text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
                Previous
              </span>
            )}
            {currentPage < totalPages ? (
              <Link
                href={pageHref(currentPage + 1)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Next
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-md border border-zinc-200 px-3 py-1.5 font-medium text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
                Next
              </span>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
