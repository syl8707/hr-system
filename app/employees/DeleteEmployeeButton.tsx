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
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">
        Are you sure?
      </span>
      <form action={action}>
        <button
          type="submit"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Confirm delete
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Cancel
      </button>
    </span>
  );
}
