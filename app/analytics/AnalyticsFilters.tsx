"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const controlClass =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export function AnalyticsFilters({
  departments,
  sites,
}: {
  departments: string[];
  sites: string[];
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

  const department = searchParams.get("department") ?? "";
  const site = searchParams.get("site") ?? "";
  const hasFilters = department !== "" || site !== "";

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
