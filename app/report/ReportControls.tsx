"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const controlClass =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

// On-screen-only toolbar: pick the reporting period and print. The inputs show
// the effective range (server defaults filled in), while the URL only carries
// explicitly chosen bounds — so sharing a default link keeps meaning "recent".
export function ReportControls({
  start,
  end,
}: {
  // Effective range bounds as YYYY-MM-DD, after the server applied defaults.
  start: string;
  end: string;
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

  return (
    <div
      className={`mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-opacity print:hidden dark:border-slate-800 dark:bg-slate-900 ${
        isPending ? "opacity-70" : ""
      }`}
    >
      <span className="px-1 text-sm font-medium text-slate-600 dark:text-slate-300">
        Reporting period
      </span>

      <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
        <span className="px-1">Start</span>
        <input
          type="date"
          value={start}
          max={end || undefined}
          onChange={(event) => onSelect("start", event.target.value)}
          aria-label="Report start date"
          className={controlClass}
        />
      </label>

      <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
        <span className="px-1">End</span>
        <input
          type="date"
          value={end}
          min={start || undefined}
          onChange={(event) => onSelect("end", event.target.value)}
          aria-label="Report end date"
          className={controlClass}
        />
      </label>

      <button
        type="button"
        onClick={() => window.print()}
        className="ml-auto inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.241l.305 1.984A1.75 1.75 0 0 1 14.084 19H5.915a1.75 1.75 0 0 1-1.73-2.016L4.492 15H4.25A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.75-.107 1.127-.153L5 6.25v-3.5Zm8.5 3.397a41.533 41.533 0 0 0-7 0V2.75a.25.25 0 0 1 .25-.25h6.5a.25.25 0 0 1 .25.25v3.397ZM6.608 12.5a.25.25 0 0 0-.247.212l-.693 4.5a.25.25 0 0 0 .247.288h8.17a.25.25 0 0 0 .246-.288l-.692-4.5a.25.25 0 0 0-.247-.212H6.608Z"
            clipRule="evenodd"
          />
        </svg>
        Print / Save as PDF
      </button>
    </div>
  );
}
