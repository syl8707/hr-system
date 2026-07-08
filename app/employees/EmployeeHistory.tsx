import type { EmployeeChangeLog } from "@/app/generated/prisma/client";
import { ChangeLogEntry } from "./ChangeLogEntry";

export function EmployeeHistory({ logs }: { logs: EmployeeChangeLog[] }) {
  if (logs.length === 0) {
    return (
      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
          History
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          No changes recorded yet.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <details open className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-semibold text-slate-900 select-none dark:text-white">
          <span className="text-slate-400 transition-transform group-open:rotate-90">
            ▸
          </span>
          History
          <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
            ({logs.length} {logs.length === 1 ? "change" : "changes"})
          </span>
        </summary>

        <ol className="mt-3 max-h-96 space-y-3 overflow-y-auto pr-1">
          {logs.map((log) => (
            <ChangeLogEntry key={log.id} log={log} />
          ))}
        </ol>
      </details>
    </section>
  );
}
