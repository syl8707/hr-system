import Link from "next/link";

import { EmployeeForm } from "../EmployeeForm";
import { createEmployee } from "../actions";
import { getEmployeeFieldOptions } from "../options";

export const dynamic = "force-dynamic";

export default async function NewEmployeePage() {
  const fieldOptions = await getEmployeeFieldOptions();

  return (
    <main className="mx-auto w-full max-w-3xl px-8 py-10">
      <Link
        href="/employees"
        className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← Back to list
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        New employee
      </h1>

      <EmployeeForm
        action={createEmployee}
        submitLabel="Create employee"
        cancelHref="/employees"
        fieldOptions={fieldOptions}
      />
    </main>
  );
}
