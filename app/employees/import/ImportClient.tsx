"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import * as XLSX from "xlsx";

import {
  EMPLOYEE_COLUMNS,
  FIELD_LABELS,
  REQUIRED_FIELDS,
  guessColumnMapping,
  type EmployeeColumn,
} from "../validation";
import {
  commitImport,
  previewImport,
  type CommitResult,
  type PreviewResult,
} from "./actions";

const REQUIRED = new Set<EmployeeColumn>(REQUIRED_FIELDS);
const NOT_MAPPED = -1;

const card =
  "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";
const selectClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const primaryBtn =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

type ParsedFile = {
  name: string;
  headers: string[];
  rows: string[][];
};

// Coerce any spreadsheet cell to a trimmed-on-store string. raw:false already
// gives formatted strings, but numbers/blank cells still need flattening.
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function ImportClient() {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<EmployeeColumn, number>>(
    () => emptyMapping(),
  );

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, startPreview] = useTransition();

  const [result, setResult] = useState<CommitResult | null>(null);
  const [committing, startCommit] = useTransition();

  // Re-run the dry-run preview whenever the file or mapping changes.
  useEffect(() => {
    if (!parsed) {
      setPreview(null);
      return;
    }
    const currentMapping = mapping;
    const currentRows = parsed.rows;
    startPreview(async () => {
      const next = await previewImport(currentRows, currentMapping);
      setPreview(next);
    });
  }, [parsed, mapping]);

  async function onFile(file: File) {
    setParseError(null);
    setResult(null);
    setPreview(null);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setParseError("That file has no sheets.");
        return;
      }
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });
      if (matrix.length === 0) {
        setParseError("That file is empty.");
        return;
      }
      const headers = (matrix[0] ?? []).map(cellToString);
      const rows = matrix.slice(1).map((row) => row.map(cellToString));
      if (rows.length === 0) {
        setParseError("That file has a header row but no data rows.");
        return;
      }
      setParsed({ name: file.name, headers, rows });
      setMapping(guessColumnMapping(headers));
    } catch {
      setParseError(
        "Couldn't read that file. Make sure it's a valid .xlsx or .csv.",
      );
    }
  }

  function reset() {
    setParsed(null);
    setParseError(null);
    setPreview(null);
    setResult(null);
    setMapping(emptyMapping());
  }

  function onConfirm() {
    if (!parsed) return;
    const currentRows = parsed.rows;
    const currentMapping = mapping;
    startCommit(async () => {
      const next = await commitImport(currentRows, currentMapping);
      setResult(next);
    });
  }

  // ---- Results screen -----------------------------------------------------
  if (result) {
    return (
      <div className={`${card} p-6`}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Import complete
        </h2>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Created" value={result.created} tone="green" />
          <Stat label="Skipped (duplicates)" value={result.skipped} tone="amber" />
          <Stat label="Errors" value={result.errors} tone="red" />
        </dl>
        <div className="mt-6 flex gap-3">
          <Link href="/employees" className={primaryBtn}>
            Back to employees
          </Link>
          <button type="button" onClick={reset} className={secondaryBtn}>
            Import another file
          </button>
        </div>
      </div>
    );
  }

  // ---- Upload screen ------------------------------------------------------
  if (!parsed) {
    return (
      <div className={`${card} p-6`}>
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
          Choose a file
          <input
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
            }}
            className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700 dark:text-slate-400"
          />
        </label>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Accepts .xlsx and .csv. The first sheet&rsquo;s header row is used to
          map columns. Need a starting point?{" "}
          <a
            href="/employees/template"
            className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            Download template
          </a>
          .
        </p>
        {parseError ? (
          <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {parseError}
          </p>
        ) : null}
      </div>
    );
  }

  // ---- Mapping + preview screen ------------------------------------------
  const missingRequired = preview?.missingRequired ?? [];
  const canConfirm =
    !!preview &&
    preview.missingRequired.length === 0 &&
    preview.validCount > 0 &&
    !previewing &&
    !committing;

  return (
    <div className="space-y-6">
      <div className={`${card} p-6`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Map columns
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {parsed.name}
              </span>{" "}
              · {parsed.rows.length}{" "}
              {parsed.rows.length === 1 ? "row" : "rows"} ·{" "}
              {parsed.headers.length} columns
            </p>
          </div>
          <button type="button" onClick={reset} className={secondaryBtn}>
            Choose another file
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {EMPLOYEE_COLUMNS.map((field) => (
            <label
              key={field}
              className="block text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              {FIELD_LABELS[field]}
              {REQUIRED.has(field) ? (
                <span className="text-red-500"> *</span>
              ) : null}
              <select
                value={mapping[field]}
                onChange={(event) =>
                  setMapping((prev) => ({
                    ...prev,
                    [field]: Number(event.target.value),
                  }))
                }
                className={`mt-1.5 ${selectClass}`}
              >
                <option value={NOT_MAPPED}>— Not mapped —</option>
                {parsed.headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header || `Column ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className={`${card} p-6`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Preview
          </h2>
          {previewing ? (
            <span className="text-sm text-slate-500 dark:text-slate-400">Validating…</span>
          ) : null}
        </div>

        {missingRequired.length > 0 ? (
          <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Map the required field
            {missingRequired.length === 1 ? "" : "s"}:{" "}
            {missingRequired.map((f) => FIELD_LABELS[f]).join(", ")}.
          </p>
        ) : preview ? (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Valid" value={preview.validCount} tone="green" />
              <Stat
                label="Duplicates (skipped)"
                value={preview.duplicates.length}
                tone="amber"
              />
              <Stat label="Errors" value={preview.errors.length} tone="red" />
            </dl>

            {preview.sample.length > 0 ? (
              <div className="mt-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Sample of rows to create
                </h3>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Row</th>
                        <th className="px-3 py-2 font-semibold">Name</th>
                        <th className="px-3 py-2 font-semibold">Email</th>
                        <th className="px-3 py-2 font-semibold">Department</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {preview.sample.map((row) => (
                        <tr key={row.rowNumber}>
                          <td className="px-3 py-2 tabular-nums text-slate-500 dark:text-slate-400">
                            {row.rowNumber}
                          </td>
                          <td className="px-3 py-2 text-slate-900 dark:text-white">
                            {row.firstName} {row.lastName}
                          </td>
                          <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                            {row.email}
                          </td>
                          <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                            {row.department || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {preview.duplicates.length > 0 ? (
              <IssueList
                title={`Duplicates — skipped (${preview.duplicates.length})`}
                items={preview.duplicates}
                tone="amber"
              />
            ) : null}

            {preview.errors.length > 0 ? (
              <IssueList
                title={`Errors — not imported (${preview.errors.length})`}
                items={preview.errors}
                tone="red"
              />
            ) : null}
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            Validating…
          </p>
        )}

        <div className="mt-6 flex items-center gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className={primaryBtn}
          >
            {committing
              ? "Importing…"
              : preview && preview.validCount > 0
                ? `Import ${preview.validCount} ${
                    preview.validCount === 1 ? "employee" : "employees"
                  }`
                : "Import employees"}
          </button>
          <Link href="/employees" className={secondaryBtn}>
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}

function emptyMapping(): Record<EmployeeColumn, number> {
  return Object.fromEntries(
    EMPLOYEE_COLUMNS.map((field) => [field, NOT_MAPPED]),
  ) as Record<EmployeeColumn, number>;
}

const TONES = {
  green:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  amber:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  red: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
} as const;

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof TONES;
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${TONES[tone]}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs font-medium">{label}</div>
    </div>
  );
}

function IssueList({
  title,
  items,
  tone,
}: {
  title: string;
  items: { rowNumber: number; reason: string }[];
  tone: "amber" | "red";
}) {
  const accent =
    tone === "amber"
      ? "text-amber-800 dark:text-amber-300"
      : "text-red-700 dark:text-red-300";
  return (
    <div className="mt-5">
      <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${accent}`}>
        {title}
      </h3>
      <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full border-collapse text-left text-sm">
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((item) => (
              <tr key={item.rowNumber}>
                <td className="w-16 px-3 py-2 align-top tabular-nums text-slate-500 dark:text-slate-400">
                  Row {item.rowNumber}
                </td>
                <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                  {item.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
