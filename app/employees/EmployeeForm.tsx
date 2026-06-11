import Link from "next/link";

import type { Employee } from "@/app/generated/prisma/client";
import {
  EmploymentType,
  PayType,
  EmployeeStatus,
} from "@/app/generated/prisma/enums";

const fieldClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none dark:border-zinc-700 dark:bg-zinc-900";
const labelClass =
  "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

function TextField({
  label,
  name,
  type = "text",
  required = false,
  defaultValue = "",
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      {required ? <span className="text-red-500"> *</span> : null}
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        className={fieldClass}
      />
    </label>
  );
}

// A DateTime column rendered for an <input type="date"> needs a YYYY-MM-DD value.
function toDateInput(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function EmployeeForm({
  action,
  employee,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => void | Promise<void>;
  employee?: Employee;
  submitLabel: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextField
        label="Employee ID"
        name="employeeId"
        required
        defaultValue={employee?.employeeId ?? ""}
      />
      <div className="hidden sm:block" />
      <TextField
        label="First name"
        name="firstName"
        required
        defaultValue={employee?.firstName ?? ""}
      />
      <TextField
        label="Last name"
        name="lastName"
        required
        defaultValue={employee?.lastName ?? ""}
      />
      <TextField
        label="Preferred name"
        name="preferredName"
        defaultValue={employee?.preferredName ?? ""}
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        defaultValue={employee?.email ?? ""}
      />
      <TextField
        label="Phone"
        name="phone"
        defaultValue={employee?.phone ?? ""}
      />
      <TextField
        label="Department"
        name="department"
        defaultValue={employee?.department ?? ""}
      />
      <TextField
        label="Role title"
        name="roleTitle"
        defaultValue={employee?.roleTitle ?? ""}
      />
      <TextField
        label="Role family"
        name="roleFamily"
        defaultValue={employee?.roleFamily ?? ""}
      />
      <TextField
        label="Site"
        name="site"
        defaultValue={employee?.site ?? ""}
      />
      <TextField
        label="Manager"
        name="manager"
        defaultValue={employee?.manager ?? ""}
      />

      <label className={labelClass}>
        Employment type
        <select
          name="employmentType"
          defaultValue={employee?.employmentType ?? ""}
          className={fieldClass}
        >
          <option value="">—</option>
          {Object.values(EmploymentType).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Pay type
        <select
          name="payType"
          defaultValue={employee?.payType ?? ""}
          className={fieldClass}
        >
          <option value="">—</option>
          {Object.values(PayType).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Status
        <select
          name="status"
          defaultValue={employee?.status ?? EmployeeStatus.ACTIVE}
          className={fieldClass}
        >
          {Object.values(EmployeeStatus).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <div className="hidden sm:block" />

      <TextField
        label="Hire date"
        name="hireDate"
        type="date"
        defaultValue={toDateInput(employee?.hireDate)}
      />
      <TextField
        label="Termination date"
        name="terminationDate"
        type="date"
        defaultValue={toDateInput(employee?.terminationDate)}
      />

      <label className={`${labelClass} sm:col-span-2`}>
        Notes
        <textarea
          name="notes"
          rows={3}
          defaultValue={employee?.notes ?? ""}
          className={fieldClass}
        />
      </label>

      <div className="sm:col-span-2 flex gap-3">
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
