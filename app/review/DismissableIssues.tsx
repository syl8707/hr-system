"use client";

import { useState, useTransition } from "react";

import { dismissReviewIssue } from "./actions";

export type IssueTag = {
  key: string; // ReviewCheck.key
  label: string; // full label, for the confirmation prompt
  shortLabel: string; // chip text
};

// The Issues cell of a review row: one chip per active issue, each with its
// own Dismiss action. Dismissing follows the same inline two-step confirmation
// as DeleteEmployeeButton — the first click only asks; the action fires from
// an explicit confirm.
export function DismissableIssues({
  employeeId,
  issues,
}: {
  employeeId: string;
  issues: IssueTag[];
}) {
  // Which issue (by check key) is showing its confirmation prompt.
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const confirming = issues.find((issue) => issue.key === confirmingKey);

  if (confirming) {
    return (
      <div className="px-4 py-3 text-xs">
        <p className="mb-1.5 text-slate-700 dark:text-slate-300">
          Are you sure you want to dismiss this issue for this employee?
        </p>
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await dismissReviewIssue(employeeId, confirming.key);
                setConfirmingKey(null);
              })
            }
            className="rounded-md bg-amber-600 px-2.5 py-1 font-medium text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending
              ? "Dismissing…"
              : `Dismiss "${confirming.label.toLowerCase()}"`}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmingKey(null)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1 px-4 py-3">
      {issues.map((issue) => (
        <span
          key={issue.key}
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 py-0.5 pl-2 pr-1 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
        >
          {issue.shortLabel}
          <button
            type="button"
            onClick={() => setConfirmingKey(issue.key)}
            aria-label={`Dismiss issue: ${issue.label}`}
            className="rounded-full px-1 font-normal text-amber-700/80 transition-colors hover:bg-amber-200 hover:text-amber-900 dark:text-amber-400/80 dark:hover:bg-amber-900 dark:hover:text-amber-200"
          >
            Dismiss
          </button>
        </span>
      ))}
    </div>
  );
}
