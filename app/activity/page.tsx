import Link from "next/link";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { ChangeAction } from "@/app/generated/prisma/enums";
import { ChangeLogEntry } from "../employees/ChangeLogEntry";
import { ActivityFilters } from "./ActivityFilters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

// searchParams values are string | string[] | undefined; normalize to a single string.
function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// Parse a "YYYY-MM-DD" date input into a Date at the given edge of that day,
// returning null when the value is missing or unparseable.
function parseDate(value: string, edge: "start" | "end"): Date | null {
  if (!value) return null;
  const time = edge === "start" ? "T00:00:00.000" : "T23:59:59.999";
  const date = new Date(`${value}${time}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Best-effort employee name pulled from a log row's stored changes, used when
// the employee record itself is gone. CREATE snapshots store plain values;
// UPDATE diffs store { from, to } — prefer the new value in that case.
function nameFromChanges(changes: unknown): string | null {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return null;
  }
  const record = changes as Record<string, unknown>;
  const pick = (value: unknown): string | null => {
    if (value && typeof value === "object" && !Array.isArray(value) && "to" in value) {
      const to = (value as { to?: unknown }).to;
      return typeof to === "string" && to ? to : null;
    }
    return typeof value === "string" && value ? value : null;
  };
  const full = [pick(record.firstName), pick(record.lastName)]
    .filter(Boolean)
    .join(" ")
    .trim();
  return full || null;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const action = first(sp.action);
  const user = first(sp.user);
  const from = first(sp.from);
  const to = first(sp.to);
  const requestedPage = Number.parseInt(first(sp.page), 10);
  const page = Number.isNaN(requestedPage) || requestedPage < 1 ? 1 : requestedPage;

  const fromDate = parseDate(from, "start");
  const toDate = parseDate(to, "end");

  // Build the change-log filter from the URL search params.
  const where: Prisma.EmployeeChangeLogWhereInput = {};
  if (action && action in ChangeAction) {
    where.action = action as ChangeAction;
  }
  if (user) where.changedBy = user;
  if (fromDate || toDate) {
    where.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  const [total, userRows] = await Promise.all([
    prisma.employeeChangeLog.count({ where }),
    prisma.employeeChangeLog.findMany({
      where: { changedBy: { not: null } },
      select: { changedBy: true },
      distinct: ["changedBy"],
      orderBy: { changedBy: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const logs = await prisma.employeeChangeLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // Resolve which employee each log relates to in a single query: fetch the
  // distinct employeeIds on this page, not one lookup per row.
  const employeeIds = [...new Set(logs.map((log) => log.employeeId))];
  const employees = employeeIds.length
    ? await prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          preferredName: true,
        },
      })
    : [];
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

  const users = userRows
    .map((row) => row.changedBy)
    .filter((value): value is string => value !== null);

  // Preserve the active filters when building pagination links.
  function pageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (user) params.set("user", user);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/activity?${qs}` : "/activity";
  }

  const navBtn =
    "rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
  const navBtnDisabled =
    "cursor-not-allowed rounded-md border border-slate-200 px-3 py-1.5 font-medium text-slate-300 dark:border-slate-800 dark:text-slate-600";

  const hasFilters = Boolean(action || user || from || to);

  return (
    <main className="mx-auto w-full max-w-4xl px-8 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Activity
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Every change recorded across all employees.
        </p>
      </div>

      <ActivityFilters users={users} />

      {logs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          {total === 0 && !hasFilters
            ? "No activity recorded yet."
            : "No activity matches your filters."}
        </div>
      ) : (
        <ol className="space-y-3">
          {logs.map((log) => {
            const employee = employeeById.get(log.employeeId);
            const subject = employee ? (
              <Link
                href={`/employees/${employee.id}`}
                className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                {employee.firstName} {employee.lastName}
                {employee.preferredName ? (
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    {" "}
                    ({employee.preferredName})
                  </span>
                ) : null}
              </Link>
            ) : (
              <span>
                <span className="text-slate-600 dark:text-slate-300">
                  Deleted employee
                </span>{" "}
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  ({nameFromChanges(log.changes) ?? log.employeeId})
                </span>
              </span>
            );
            return <ChangeLogEntry key={log.id} log={log} subject={subject} />;
          })}
        </ol>
      )}

      {total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
          <span>
            <span className="font-medium text-slate-900 dark:text-white">
              {total.toLocaleString()}
            </span>{" "}
            {total === 1 ? "change" : "changes"} · Page {currentPage} of{" "}
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
