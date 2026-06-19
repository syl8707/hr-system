import Link from "next/link";

import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export default function ImportEmployeesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-8 py-10">
      <Link
        href="/employees"
        className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← Back to list
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        Import employees
      </h1>
      <p className="mb-6 mt-1 text-sm text-slate-500 dark:text-slate-400">
        Upload a spreadsheet, map its columns, and review what will be created
        before importing.
      </p>

      <ImportClient />
    </main>
  );
}
