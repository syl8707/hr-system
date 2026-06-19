"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { Employee } from "@/app/generated/prisma/client";
import {
  EmploymentType,
  PayType,
  EmployeeStatus,
} from "@/app/generated/prisma/enums";
import type { EmployeeFormState } from "./validation";
import type { EmployeeFieldOptions } from "./options";

const fieldClass =
  "mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const labelClass =
  "block text-sm font-medium text-slate-700 dark:text-slate-300";

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

// Sentinel <option> value that switches the control into free-text entry mode.
const ADD_NEW = "__add_new__";

// A dropdown of the values already used for a field, plus an "Add new…" option
// that swaps in a text input for entering a value not in the list. Whichever
// control is visible carries the field `name`, so the form submits a single
// value either way. Optional field — a blank "—" option clears it.
function SelectOrAddField({
  label,
  name,
  options,
  defaultValue = "",
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
}) {
  // Guarantee the saved value is always selectable, even if it's no longer
  // among the distinct options (e.g. it was the last record using it).
  const mergedOptions =
    defaultValue && !options.includes(defaultValue)
      ? [defaultValue, ...options].sort((a, b) => a.localeCompare(b))
      : options;

  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState(defaultValue);

  return (
    <label className={labelClass}>
      {label}
      {adding ? (
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="text"
            name={name}
            value={value}
            autoFocus
            placeholder={`New ${label.toLowerCase()}`}
            onChange={(event) => setValue(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setValue(defaultValue);
            }}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Use list
          </button>
        </div>
      ) : (
        <select
          name={name}
          value={value}
          onChange={(event) => {
            if (event.target.value === ADD_NEW) {
              setAdding(true);
              setValue("");
            } else {
              setValue(event.target.value);
            }
          }}
          className={fieldClass}
        >
          <option value="">—</option>
          {mergedOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={ADD_NEW}>Add new…</option>
        </select>
      )}
    </label>
  );
}

export function EmployeeForm({
  action,
  employee,
  submitLabel,
  cancelHref,
  fieldOptions,
}: {
  action: (
    prevState: EmployeeFormState,
    formData: FormData,
  ) => Promise<EmployeeFormState>;
  employee?: Employee;
  submitLabel: string;
  cancelHref: string;
  fieldOptions: EmployeeFieldOptions;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-900"
    >
      {state.error ? (
        <p
          role="alert"
          aria-live="polite"
          className="sm:col-span-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <TextField
        label="Employee ID"
        name="employeeId"
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
        required
        defaultValue={employee?.email ?? ""}
      />
      <TextField
        label="Phone"
        name="phone"
        defaultValue={employee?.phone ?? ""}
      />
      <SelectOrAddField
        label="Department"
        name="department"
        options={fieldOptions.department}
        defaultValue={employee?.department ?? ""}
      />
      <SelectOrAddField
        label="Role title"
        name="roleTitle"
        options={fieldOptions.roleTitle}
        defaultValue={employee?.roleTitle ?? ""}
      />
      <SelectOrAddField
        label="Role family"
        name="roleFamily"
        options={fieldOptions.roleFamily}
        defaultValue={employee?.roleFamily ?? ""}
      />
      <SelectOrAddField
        label="Site"
        name="site"
        options={fieldOptions.site}
        defaultValue={employee?.site ?? ""}
      />
      <SelectOrAddField
        label="Manager"
        name="manager"
        options={fieldOptions.manager}
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

      <div className="sm:col-span-2 mt-1 flex gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
