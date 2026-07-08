import Link from "next/link";

import { prisma } from "@/lib/prisma";
import {
  buildReviewWhere,
  findCheck,
  firstParam,
  REVIEW_CHECKS,
} from "./query";
import { ReviewFilters } from "./ReviewFilters";

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

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const q = firstParam(sp.q).trim();
  const issue = firstParam(sp.issue);
  const requestedPage = Number.parseInt(firstParam(sp.page), 10);
  const page =
    Number.isNaN(requestedPage) || requestedPage < 1 ? 1 : requestedPage;

  // Roster-wide counts for the summary: one count per check, run in parallel.
  // These ignore the search/filter so they always reflect the whole roster.
  const summaryCounts = await Promise.all(
    REVIEW_CHECKS.map((check) => prisma.employee.count({ where: check.where })),
  );

  // The table's filter (search AND issue), reused for the count and the page.
  const where = buildReviewWhere({ q, issue });
  const total = await prisma.employee.count({ where });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const employees = await prisma.employee.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const selectedCheck = issue ? findCheck(issue) : undefined;

  // Preserve the active search/filter when building pagination links.
  function pageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (issue) params.set("issue", issue);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/review?${qs}` : "/review";
  }

  const navBtn =
    "rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
  const navBtnDisabled =
    "cursor-not-allowed rounded-md border border-slate-200 px-3 py-1.5 font-medium text-slate-300 dark:border-slate-800 dark:text-slate-600";

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Data to review
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Employees with missing or placeholder data that still needs to be
          completed.
        </p>
      </div>

      {/* Roster-wide summary: one card per check. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {REVIEW_CHECKS.map((check, index) => (
          <div
            key={check.key}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
              {summaryCounts[index].toLocaleString()}
            </div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {check.label}
            </div>
          </div>
        ))}
      </div>

      <ReviewFilters
        issues={REVIEW_CHECKS.map((check) => ({
          key: check.key,
          label: check.label,
        }))}
      />

      {employees.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          {total === 0 && !q && !issue
            ? "Nothing to review — every employee has complete data."
            : "No employees match your filters."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-semibold">Employee ID</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Department</th>
                  <th className="px-4 py-3 font-semibold">Site</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Hire date</th>
                  <th className="px-4 py-3 font-semibold">Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {employees.map((employee) => {
                  const href = `/employees/${employee.id}/edit`;
                  // Each cell is a block-level link so the whole row is
                  // clickable while staying valid HTML.
                  const cell =
                    "block px-4 py-3 text-slate-800 dark:text-slate-200";
                  // The issues this row actually has. When a single issue is
                  // filtered, only that one is relevant; otherwise tag them all.
                  const checks = selectedCheck ? [selectedCheck] : REVIEW_CHECKS;
                  const issueLabels = checks
                    .filter((check) => check.matches(employee))
                    .map((check) => check.shortLabel);
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
                          {employee.employeeId ?? "—"}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={href}
                          className={`${cell} font-medium text-slate-900 dark:text-white`}
                        >
                          {employee.firstName} {employee.lastName}
                          {employee.preferredName ? (
                            <span className="font-normal text-slate-500 dark:text-slate-400">
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
                          {employee.department || "—"}
                        </Link>
                      </td>
                      <td>
                        <Link href={href} className={cell}>
                          {employee.site || "—"}
                        </Link>
                      </td>
                      <td>
                        <Link href={href} className={cell}>
                          {employee.employmentType ?? "—"}
                        </Link>
                      </td>
                      <td>
                        <Link href={href} className={`${cell} tabular-nums`}>
                          {formatDate(employee.hireDate)}
                        </Link>
                      </td>
                      <td>
                        <Link href={href} className="block px-4 py-3">
                          <span className="flex flex-wrap gap-1">
                            {issueLabels.map((label) => (
                              <span
                                key={label}
                                className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                              >
                                {label}
                              </span>
                            ))}
                          </span>
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
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
          <span>
            <span className="font-medium text-slate-900 dark:text-white">
              {total.toLocaleString()}
            </span>{" "}
            {total === 1 ? "employee" : "employees"} to review · Page{" "}
            {currentPage} of {totalPages}
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
