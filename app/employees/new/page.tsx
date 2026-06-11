import Link from "next/link";

import { EmployeeForm } from "../EmployeeForm";
import { createEmployee } from "../actions";

export default function NewEmployeePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">New employee</h1>
        <Link href="/employees" className="text-sm text-zinc-500 underline">
          Back to list
        </Link>
      </div>

      <EmployeeForm
        action={createEmployee}
        submitLabel="Create employee"
        cancelHref="/employees"
      />
    </main>
  );
}
