import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { deleteEmployee } from "../actions";
import { DeleteEmployeeButton } from "../DeleteEmployeeButton";

export const dynamic = "force-dynamic";

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id } });

  if (!employee) {
    notFound();
  }

  const fields: { label: string; value: unknown }[] = [
    { label: "Employee ID", value: employee.employeeId },
    { label: "First name", value: employee.firstName },
    { label: "Last name", value: employee.lastName },
    { label: "Preferred name", value: employee.preferredName },
    { label: "Email", value: employee.email },
    { label: "Phone", value: employee.phone },
    { label: "Department", value: employee.department },
    { label: "Role title", value: employee.roleTitle },
    { label: "Role family", value: employee.roleFamily },
    { label: "Site", value: employee.site },
    { label: "Manager", value: employee.manager },
    { label: "Employment type", value: employee.employmentType },
    { label: "Pay type", value: employee.payType },
    { label: "Status", value: employee.status },
    { label: "Hire date", value: employee.hireDate },
    { label: "Termination date", value: employee.terminationDate },
    { label: "Notes", value: employee.notes },
    { label: "Created", value: employee.createdAt },
    { label: "Updated", value: employee.updatedAt },
  ];

  // Pre-bind the server action to this employee's id so the delete button
  // doesn't need to pass it through the form.
  const deleteThisEmployee = deleteEmployee.bind(null, employee.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/employees" className="text-sm text-zinc-500 underline">
            ← Back to list
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {employee.firstName} {employee.lastName}
            {employee.preferredName ? (
              <span className="text-zinc-500"> ({employee.preferredName})</span>
            ) : null}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/employees/${employee.id}/edit`}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Edit
          </Link>
          <DeleteEmployeeButton action={deleteThisEmployee} />
        </div>
      </div>

      <dl className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {fields.map((field) => (
          <div
            key={field.label}
            className="grid grid-cols-3 gap-4 px-4 py-3 text-sm"
          >
            <dt className="font-medium text-zinc-500">{field.label}</dt>
            <dd className="col-span-2 whitespace-pre-wrap">
              {formatValue(field.value)}
            </dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
