import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "—";
}

export default async function EmployeesPage() {
  const employees = await prisma.employee.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        <Link
          href="/employees/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          New employee
        </Link>
      </div>

      {employees.length === 0 ? (
        <p className="text-zinc-500">
          No employees yet.{" "}
          <Link href="/employees/new" className="underline">
            Add the first one
          </Link>
          .
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Employee ID</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Site</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Hire date</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const href = `/employees/${employee.id}`;
                // Each cell is a block-level link so the whole row is clickable
                // while staying valid HTML (anchors can't wrap <tr>/<td>).
                const cell = "block px-4 py-3";
                return (
                  <tr
                    key={employee.id}
                    className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <td>
                      <Link href={href} className={`${cell} font-mono text-xs`}>
                        {employee.employeeId}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cell}>
                        {employee.firstName} {employee.lastName}
                        {employee.preferredName ? (
                          <span className="text-zinc-500">
                            {" "}
                            ({employee.preferredName})
                          </span>
                        ) : null}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cell}>
                        {employee.email ?? "—"}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cell}>
                        {employee.department ?? "—"}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cell}>
                        {employee.roleTitle ?? "—"}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cell}>
                        {employee.site ?? "—"}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cell}>
                        {employee.employmentType ?? "—"}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cell}>
                        {employee.status}
                      </Link>
                    </td>
                    <td>
                      <Link href={href} className={cell}>
                        {formatDate(employee.hireDate)}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
