"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const controlClass =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export function AnalyticsFilters({
  companies,
  departments,
  sites,
  roles,
}: {
  companies: string[];
  departments: string[];
  sites: string[];
  roles: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function onSelect(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const company = searchParams.get("company") ?? "";
  const department = searchParams.get("department") ?? "";
  const site = searchParams.get("site") ?? "";
  const role = searchParams.get("role") ?? "";
  const hasFilters =
    company !== "" || department !== "" || site !== "" || role !== "";

  return (
    <div
      className={`mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-opacity dark:border-slate-800 dark:bg-slate-900 ${
        isPending ? "opacity-70" : ""
      }`}
    >
      <span className="px-1 text-sm font-medium text-slate-500 dark:text-slate-400">
        Filter
      </span>

      <select
        value={company}
        onChange={(event) => onSelect("company", event.target.value)}
        aria-label="Filter by company"
        className={controlClass}
      >
        <option value="">All companies</option>
        {companies.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        value={department}
        onChange={(event) => onSelect("department", event.target.value)}
        aria-label="Filter by department"
        className={controlClass}
      >
        <option value="">All departments</option>
        {departments.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        value={site}
        onChange={(event) => onSelect("site", event.target.value)}
        aria-label="Filter by site"
        className={controlClass}
      >
        <option value="">All sites</option>
        {sites.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <select
        value={role}
        onChange={(event) => onSelect("role", event.target.value)}
        aria-label="Filter by role"
        className={controlClass}
      >
        <option value="">All roles</option>
        {roles.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      {hasFilters ? (
        <button
          type="button"
          onClick={() => {
            startTransition(() => {
              router.replace(pathname, { scroll: false });
            });
          }}
          className="rounded-md px-2 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
