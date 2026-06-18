import type { EmployeeChangeLog } from "@/app/generated/prisma/client";
import { ChangeAction } from "@/app/generated/prisma/enums";

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// Human-readable labels for the tracked employee columns.
const FIELD_LABELS: Record<string, string> = {
  employeeId: "Employee ID",
  firstName: "First name",
  lastName: "Last name",
  preferredName: "Preferred name",
  email: "Email",
  phone: "Phone",
  department: "Department",
  roleTitle: "Role title",
  roleFamily: "Role family",
  site: "Site",
  manager: "Manager",
  employmentType: "Employment type",
  payType: "Pay type",
  status: "Status",
  hireDate: "Hire date",
  terminationDate: "Termination date",
  notes: "Notes",
};

function labelFor(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

// A logged value renders as the value or an em dash when empty/null.
function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

const ACTION_STYLES: Record<ChangeAction, string> = {
  [ChangeAction.CREATE]:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  [ChangeAction.UPDATE]:
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  [ChangeAction.DELETE]:
    "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

const ACTION_LABELS: Record<ChangeAction, string> = {
  [ChangeAction.CREATE]: "Created",
  [ChangeAction.UPDATE]: "Updated",
  [ChangeAction.DELETE]: "Deleted",
};

// Renders the per-entry summary lines based on the action and stored changes.
function ChangeSummary({
  action,
  changes,
}: {
  action: ChangeAction;
  changes: unknown;
}) {
  if (action === ChangeAction.DELETE) {
    return <p className="text-slate-600 dark:text-slate-300">Employee record deleted.</p>;
  }

  const entries =
    changes && typeof changes === "object" && !Array.isArray(changes)
      ? Object.entries(changes as Record<string, unknown>)
      : [];

  if (action === ChangeAction.UPDATE) {
    if (entries.length === 0) {
      return <p className="text-slate-500 dark:text-slate-400">No field changes recorded.</p>;
    }
    return (
      <ul className="space-y-0.5 text-slate-600 dark:text-slate-300">
        {entries.map(([field, change]) => {
          const { from, to } = (change ?? {}) as {
            from?: unknown;
            to?: unknown;
          };
          return (
            <li key={field}>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {labelFor(field)}:
              </span>{" "}
              <span className="text-slate-400 line-through">{display(from)}</span>{" "}
              <span aria-hidden>→</span> {display(to)}
            </li>
          );
        })}
      </ul>
    );
  }

  // CREATE: list the initial values the record was created with.
  if (entries.length === 0) {
    return <p className="text-slate-600 dark:text-slate-300">Employee record created.</p>;
  }
  return (
    <>
      <p className="mb-1 text-slate-600 dark:text-slate-300">
        Employee record created with:
      </p>
      <ul className="space-y-0.5 text-slate-600 dark:text-slate-300">
        {entries.map(([field, value]) => (
          <li key={field}>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {labelFor(field)}:
            </span>{" "}
            {display(value)}
          </li>
        ))}
      </ul>
    </>
  );
}

export function EmployeeHistory({ logs }: { logs: EmployeeChangeLog[] }) {
  if (logs.length === 0) {
    return (
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
          History
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No changes recorded yet.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <details open className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-900 select-none dark:text-white">
          <span className="text-slate-400 transition-transform group-open:rotate-90">
            ▸
          </span>
          History
          <span className="font-normal text-slate-400">
            ({logs.length} {logs.length === 1 ? "change" : "changes"})
          </span>
        </summary>

        <ol className="mt-3 max-h-96 space-y-3 overflow-y-auto pr-1">
          {logs.map((log) => (
            <li
              key={log.id}
              className="rounded-lg border border-slate-200 bg-white p-3.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_STYLES[log.action]}`}
                >
                  {ACTION_LABELS[log.action]}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {DATE_TIME_FORMAT.format(log.createdAt)}
                </span>
                {log.changedBy ? (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    by {log.changedBy}
                  </span>
                ) : null}
              </div>
              <ChangeSummary action={log.action} changes={log.changes} />
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
