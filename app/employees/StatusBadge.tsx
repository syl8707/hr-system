import { EmployeeStatus } from "@/app/generated/prisma/enums";

const styles: Record<string, string> = {
  [EmployeeStatus.ACTIVE]:
    "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-950/40 dark:text-green-400 dark:ring-green-400/20",
  [EmployeeStatus.LEAVE_OF_ABSENCE]:
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-400/20",
  [EmployeeStatus.TERMINATED]:
    "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-400/20",
};

// "LEAVE_OF_ABSENCE" -> "Leave of absence"
function humanize(status: string) {
  const words = status.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function StatusBadge({ status }: { status: string }) {
  const style =
    styles[status] ??
    "bg-slate-50 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      {humanize(status)}
    </span>
  );
}
