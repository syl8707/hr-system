"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";

const controlClass =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export function ReviewFilters({
  issues,
}: {
  issues: { key: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Locally controlled search box (URL updates after a debounce). Re-sync to
  // the URL's `q` when it changes from elsewhere — the same render-time pattern
  // the employees list uses.
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply a mutation to the current params, always resetting to page 1 since
  // the matching set changes, then push it to the URL.
  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function onSearchChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams((params) => {
        const trimmed = value.trim();
        if (trimmed) params.set("q", trimmed);
        else params.delete("q");
      });
    }, 300);
  }

  function onSelect(key: string, value: string) {
    updateParams((params) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
  }

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-opacity dark:border-slate-800 dark:bg-slate-900 ${
        isPending ? "opacity-70" : ""
      }`}
    >
      <input
        type="search"
        value={query}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search name or employee ID…"
        aria-label="Search employees"
        className={`${controlClass} min-w-64 flex-1`}
      />

      <select
        value={searchParams.get("issue") ?? ""}
        onChange={(event) => onSelect("issue", event.target.value)}
        aria-label="Filter by issue"
        className={controlClass}
      >
        <option value="">All issues</option>
        {issues.map((issue) => (
          <option key={issue.key} value={issue.key}>
            {issue.label}
          </option>
        ))}
      </select>
    </div>
  );
}
