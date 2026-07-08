"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const controlClass =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "CREATE", label: "Created" },
  { value: "UPDATE", label: "Updated" },
  { value: "DELETE", label: "Deleted" },
];

export function ActivityFilters({ users }: { users: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

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
      <select
        value={searchParams.get("action") ?? ""}
        onChange={(event) => onSelect("action", event.target.value)}
        aria-label="Filter by action"
        className={controlClass}
      >
        {ACTION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get("user") ?? ""}
        onChange={(event) => onSelect("user", event.target.value)}
        aria-label="Filter by user"
        className={controlClass}
      >
        <option value="">All users</option>
        {users.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
        From
        <input
          type="date"
          value={searchParams.get("from") ?? ""}
          onChange={(event) => onSelect("from", event.target.value)}
          aria-label="From date"
          className={controlClass}
        />
      </label>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
        To
        <input
          type="date"
          value={searchParams.get("to") ?? ""}
          onChange={(event) => onSelect("to", event.target.value)}
          aria-label="To date"
          className={controlClass}
        />
      </label>
    </div>
  );
}
