"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";

const controlClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none dark:border-zinc-700 dark:bg-zinc-900";

export function EmployeesFilters({
  departments,
  sites,
  statuses,
}: {
  departments: string[];
  sites: string[];
  statuses: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // The search box is locally controlled so typing stays responsive (the URL
  // is only updated after a debounce). When the URL's `q` changes from
  // elsewhere — back/forward navigation, a shared link — re-sync by adjusting
  // state during render, the pattern React recommends over an effect.
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply a mutation to the current params, always resetting to the first page
  // since the matching set changes, then push it to the URL.
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
      className={`mb-4 flex flex-wrap items-center gap-3 ${
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
        value={searchParams.get("department") ?? ""}
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
        value={searchParams.get("site") ?? ""}
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
        value={searchParams.get("status") ?? ""}
        onChange={(event) => onSelect("status", event.target.value)}
        aria-label="Filter by status"
        className={controlClass}
      >
        <option value="">All statuses</option>
        {statuses.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </div>
  );
}
