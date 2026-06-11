"use client";

import { useState } from "react";

export function DeleteEmployeeButton({
  action,
}: {
  // A server action already bound to the employee's id.
  action: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-sm text-slate-600 dark:text-slate-400">
        Are you sure?
      </span>
      <form action={action}>
        <button
          type="submit"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700"
        >
          Confirm delete
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Cancel
      </button>
    </span>
  );
}
