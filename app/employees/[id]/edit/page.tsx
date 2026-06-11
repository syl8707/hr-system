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
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit {employee.firstName} {employee.lastName}
        </h1>
        <Link
          href={`/employees/${employee.id}`}
          className="text-sm text-zinc-500 underline"
        >
          Back to detail
        </Link>
      </div>

      <EmployeeForm
        action={updateThisEmployee}
        employee={employee}
        submitLabel="Save changes"
        cancelHref={`/employees/${employee.id}`}
      />
    </main>
  );
}
