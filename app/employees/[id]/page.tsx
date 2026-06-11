import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { deleteEmployee } from "../actions";
import { DeleteEmployeeButton } from "../DeleteEmployeeButton";
import { StatusBadge } from "../StatusBadge";

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
    <main className="mx-auto w-full max-w-3xl px-8 py-10">
      <Link
        href="/employees"
        className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← Back to list
      </Link>
      <div className="mt-2 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {employee.firstName} {employee.lastName}
            {employee.preferredName ? (
              <span className="font-normal text-slate-400">
                {" "}
                ({employee.preferredName})
              </span>
            ) : null}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <span className="font-mono text-xs">{employee.employeeId}</span>
            <StatusBadge status={employee.status} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/employees/${employee.id}/edit`}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Edit
          </Link>
          <DeleteEmployeeButton action={deleteThisEmployee} />
        </div>
      </div>

      <dl className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {fields.map((field) => (
          <div
            key={field.label}
            className="grid grid-cols-3 gap-4 px-5 py-3.5 text-sm"
          >
            <dt className="font-medium text-slate-500 dark:text-slate-400">
              {field.label}
            </dt>
            <dd className="col-span-2 whitespace-pre-wrap text-slate-800 dark:text-slate-200">
              {field.label === "Status" ? (
                <StatusBadge status={employee.status} />
              ) : (
                formatValue(field.value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
