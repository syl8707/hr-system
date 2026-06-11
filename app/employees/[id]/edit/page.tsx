import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { EmployeeForm } from "../../EmployeeForm";
import { updateEmployee } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id } });

  if (!employee) {
    notFound();
  }

  // Bind the employee's id so the action receives (id, formData).
  const updateThisEmployee = updateEmployee.bind(null, employee.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-8 py-10">
      <Link
        href={`/employees/${employee.id}`}
        className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← Back to detail
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        Edit {employee.firstName} {employee.lastName}
      </h1>

      <EmployeeForm
        action={updateThisEmployee}
        employee={employee}
        submitLabel="Save changes"
        cancelHref={`/employees/${employee.id}`}
      />
    </main>
  );
}
