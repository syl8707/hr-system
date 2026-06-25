// One-off (re-runnable): reconcile the database against the new "Patry Group
// Employees" spreadsheet. It fills in real emails for current employees and
// loads past employees as TERMINATED. Run with:
//
//   npx tsx scripts/load-employee-update.ts            # dry run — writes nothing
//   npx tsx scripts/load-employee-update.ts --commit   # apply the staged changes
//
// Like scripts/load-roster.ts this is a direct-to-Prisma loader (the Microsoft
// login that gates the import UI isn't working locally). It reuses the SAME
// Prisma client setup, the shared date parser and enum constants, and the
// change-log snapshot helper (app/employees/validation.ts) so the rows it writes
// match what the UI would produce — including YYYY-MM-DD date parsing, email
// lowercasing, and CREATE/UPDATE change-log shapes.
//
// All reconciliation happens in memory BEFORE any write, so the dry run is an
// exact preview of what --commit will do. Re-running after a commit produces 0
// changes: email updates only stage when the value differs, active->terminated
// flips only fire on an ACTIVE record, and a past person who already has a
// TERMINATED record is reported as already-loaded.

// Read DATABASE_URL (and friends) from .env.local specifically, not .env.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import * as XLSX from "xlsx";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Relative imports (not the "@/" alias) keep this runnable standalone via tsx,
// matching scripts/load-roster.ts and prisma/seed.ts.
import { PrismaClient } from "../app/generated/prisma/client";
import { ChangeAction, EmployeeStatus } from "../app/generated/prisma/enums";
import type { Employee, Prisma } from "../app/generated/prisma/client";
import {
  parseDate,
  snapshotForCreate,
  EMAIL_PATTERN,
  type EmployeeData,
} from "../app/employees/validation";

const WORKBOOK_PATH = "Patry_Group_Employees.xlsx";
// Stamp the audit trail so this load is distinguishable in history, the same
// way load-roster.ts uses "Data import" / assign-single-site.ts uses its label.
const CHANGED_BY = "Employee data update 2026-06";

const COMMIT = process.argv.includes("--commit") || process.env.COMMIT === "1";

// A row whose Start Date is empty is only a company header when its name is one
// of these. Any OTHER empty-start-date row is a real person with missing data
// (e.g. "Shahrokh Farzam"), which we keep and flag rather than treat as a header.
const KNOWN_COMPANIES = [
  "Jay Patry Enterprises LLC",
  "Kenlar Investments Inc.",
  "2274 Princess Street Limited Partnership",
  "Skyfal Investments Inc.",
  "150 Marketplace Ave Inc.",
  "Kanata Woods Inc.",
  "QM&E Engineering",
  "Urban Form Studio Inc.",
  "Contractors",
];
// normalized header name -> canonical (nicely-trimmed) company string.
const COMPANY_BY_KEY = new Map(
  KNOWN_COMPANIES.map((c) => [c.trim().toLowerCase(), c]),
);

// Marker the spreadsheet uses for "no work email".
const NO_EMAIL = "----";

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function cell(row: unknown[], index: number): string | null {
  const value = row[index];
  return isBlank(value) ? null : String(value).trim();
}

// Match key for reconciling spreadsheet names to DB records: trimmed, lowercased,
// accents folded, and internal whitespace collapsed. Parenthetical segments —
// nicknames/aliases the spreadsheet carries but the DB doesn't, e.g.
// "Jide (Olajide) Sunday" or "RJ Graham (Robert)" — are dropped so those match
// their plain DB records ("Jide Sunday", "RJ Graham").
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/\([^)]*\)/g, " ") // drop parenthetical nicknames/aliases
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Split a single "Name" cell into first/last. First token is the first name,
// everything after is the last name (so "Maunuel Torres Garza" -> last "Torres
// Garza", and parentheticals like "RJ Graham (Robert)" stay in the last name).
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function fmtDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

// Append a line to a notes field unless it's already present (keeps re-runs
// idempotent and never duplicates the appended text). Returns the new value.
function appendNote(existing: string | null, line: string): string {
  if (!existing) return line;
  return existing.includes(line) ? existing : `${existing}\n${line}`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type CurrentRow = {
  name: string;
  start: string | null;
  roleTitle: string | null;
  department: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  company: string;
  missingData: boolean; // empty Start Date on a real person
};

type PastRow = {
  name: string;
  start: string | null;
  end: string | null;
  cause: string | null;
  roleTitle: string | null;
  department: string | null;
  company: string;
  missingData: boolean;
};

// True when a row is a company-grouping header: a name in the known-companies
// list with an empty Start Date.
function isCompanyHeader(name: string, start: string | null): boolean {
  return start === null && COMPANY_BY_KEY.has(name.trim().toLowerCase());
}

function readSheet(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in ${WORKBOOK_PATH}.`);
  }
  // header:1 -> positional rows so we read fixed columns A.. by index and
  // ignore the stray reference columns further right. raw:false renders dates
  // with their cell format so the shared parser sees the same string the UI would.
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });
}

function parseCurrent(rows: unknown[][]): CurrentRow[] {
  const out: CurrentRow[] = [];
  let company = "(no company)";
  // Skip row 0 (the title/header row of the sheet).
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = cell(row, 0);
    if (name === null) continue; // blank spacer row
    const start = cell(row, 1);
    if (isCompanyHeader(name, start)) {
      company = COMPANY_BY_KEY.get(name.trim().toLowerCase())!;
      continue;
    }
    out.push({
      name,
      start,
      roleTitle: cell(row, 2),
      department: cell(row, 3),
      workEmail: cell(row, 4),
      personalEmail: cell(row, 5),
      company,
      missingData: start === null,
    });
  }
  return out;
}

function parsePast(rows: unknown[][]): PastRow[] {
  const out: PastRow[] = [];
  let company = "(no company)";
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = cell(row, 0);
    if (name === null) continue;
    const start = cell(row, 1);
    if (isCompanyHeader(name, start)) {
      company = COMPANY_BY_KEY.get(name.trim().toLowerCase())!;
      continue;
    }
    out.push({
      name,
      start,
      end: cell(row, 2),
      cause: cell(row, 3),
      roleTitle: cell(row, 4),
      department: cell(row, 5),
      company,
      missingData: start === null,
    });
  }
  return out;
}

// Resolve a current-employee row's primary email per the spreadsheet rules.
// Returns the email to use (or null to leave the existing one unchanged) and an
// optional secondary work address to record in notes.
function resolveEmail(row: CurrentRow): {
  email: string | null;
  secondary: string | null;
} {
  // Work email wins, unless it's the "----" marker or blank.
  let raw: string | null = null;
  if (row.workEmail !== null && row.workEmail !== NO_EMAIL) {
    raw = row.workEmail;
  } else if (row.personalEmail !== null && row.personalEmail !== NO_EMAIL) {
    raw = row.personalEmail;
  }
  if (raw === null) return { email: null, secondary: null };

  // "a@x.com / b@y.com" -> primary a@x.com, secondary b@y.com (recorded in notes).
  // An email can't contain whitespace, so stray internal spaces (e.g.
  // "cmoore@ patryinc.com") are typos — collapse all whitespace away.
  const clean = (value: string) => value.replace(/\s+/g, "").toLowerCase();
  let secondary: string | null = null;
  if (raw.includes("/")) {
    const [first, second] = raw.split("/");
    raw = first;
    if (second && second.trim() !== "") secondary = clean(second);
  }
  const email = clean(raw);
  return { email, secondary };
}

// ---------------------------------------------------------------------------
// Reconciliation (in memory, before any write)
// ---------------------------------------------------------------------------

type EmailUpdate = {
  id: string;
  name: string;
  emailFrom: string | null;
  emailTo: string | null; // null when only notes change
  notesFrom: string | null;
  notesTo: string | null; // null when notes unchanged
};

type Flip = {
  id: string;
  name: string;
  terminationDate: Date | null;
  cause: string | null;
  notesFrom: string | null;
  notesTo: string | null;
};

type Insert = {
  name: string;
  data: EmployeeData;
};

type Report = {
  emailUpdates: EmailUpdate[];
  matchedActiveNoChange: string[]; // group 1, already correct / no email available
  unmatchedCurrent: string[]; // group 2
  flips: Flip[]; // group 3
  inserts: Insert[]; // group 4
  pastAlreadyLoaded: string[]; // group 5
  inDbNotInFile: string[]; // group 6
  rehiredKeptActive: string[]; // in both sheets — past stint not flipped
  missingDataRows: string[]; // flagged for /review follow-up
  emailWarnings: string[]; // computed email failed validation; skipped
};

function reconcile(
  current: CurrentRow[],
  past: PastRow[],
  employees: Employee[],
): Report {
  // normalized name -> matching DB records (a name may resolve to several).
  const byName = new Map<string, Employee[]>();
  for (const e of employees) {
    const key = normalizeName(`${e.firstName} ${e.lastName}`);
    const list = byName.get(key);
    if (list) list.push(e);
    else byName.set(key, [e]);
  }

  // Every normalized name that appears anywhere in the new file.
  const sheetNames = new Set<string>();
  for (const r of current) sheetNames.add(normalizeName(r.name));
  for (const r of past) sheetNames.add(normalizeName(r.name));

  const report: Report = {
    emailUpdates: [],
    matchedActiveNoChange: [],
    unmatchedCurrent: [],
    flips: [],
    inserts: [],
    pastAlreadyLoaded: [],
    inDbNotInFile: [],
    rehiredKeptActive: [],
    missingDataRows: [],
    emailWarnings: [],
  };

  // --- Current sheet: groups 1 & 2 ---------------------------------------
  for (const row of current) {
    if (row.missingData) {
      report.missingDataRows.push(`${row.name} (current — missing Start Date)`);
    }

    const matches = byName.get(normalizeName(row.name)) ?? [];
    const active = matches.filter((e) => e.status === EmployeeStatus.ACTIVE);

    if (active.length !== 1) {
      // No clean active match: new hire, spelling difference, or ambiguous.
      report.unmatchedCurrent.push(
        active.length > 1 ? `${row.name} (ambiguous: ${active.length} matches)` : row.name,
      );
      continue;
    }

    const employee = active[0];
    const { email, secondary } = resolveEmail(row);

    if (email !== null && !EMAIL_PATTERN.test(email)) {
      report.emailWarnings.push(`${row.name}: computed email "${email}" is invalid — skipped`);
      report.matchedActiveNoChange.push(row.name);
      continue;
    }

    const emailChanged = email !== null && email !== (employee.email ?? null);
    const notesTo = secondary
      ? appendNote(employee.notes, `Secondary work email: ${secondary}`)
      : employee.notes;
    const notesChanged = notesTo !== (employee.notes ?? null);

    if (!emailChanged && !notesChanged) {
      report.matchedActiveNoChange.push(row.name);
      continue;
    }

    report.emailUpdates.push({
      id: employee.id,
      name: row.name,
      emailFrom: emailChanged ? employee.email : null,
      emailTo: emailChanged ? email : null,
      notesFrom: notesChanged ? employee.notes : null,
      notesTo: notesChanged ? notesTo : null,
    });
  }

  // --- Past sheet: groups 3, 4 & 5 ---------------------------------------
  for (const row of past) {
    if (row.missingData) {
      report.missingDataRows.push(`${row.name} (past — missing Start Date)`);
    }

    const matches = byName.get(normalizeName(row.name)) ?? [];
    const terminated = matches.filter((e) => e.status === EmployeeStatus.TERMINATED);
    const active = matches.filter((e) => e.status === EmployeeStatus.ACTIVE);

    // Group 5: a TERMINATED record already exists for this name -> already loaded.
    if (terminated.length > 0) {
      report.pastAlreadyLoaded.push(row.name);
      continue;
    }

    // Group 3: matches an ACTIVE record -> they have since left, flip it.
    if (active.length > 0) {
      // ...unless they're also in the Current sheet: that's a rehire, so the
      // active record is correct and we must NOT flip it to terminated.
      const key = normalizeName(row.name);
      if (current.some((c) => normalizeName(c.name) === key)) {
        report.rehiredKeptActive.push(row.name);
        continue;
      }
      const employee = active[0];
      const notesTo = row.cause
        ? appendNote(employee.notes, `Termination cause: ${row.cause}`)
        : employee.notes;
      report.flips.push({
        id: employee.id,
        name: row.name,
        terminationDate: parseDate(row.end),
        cause: row.cause,
        notesFrom: notesTo !== (employee.notes ?? null) ? employee.notes : null,
        notesTo: notesTo !== (employee.notes ?? null) ? notesTo : null,
      });
      continue;
    }

    // Group 4: no existing record -> create a new TERMINATED one.
    const { firstName, lastName } = splitName(row.name);
    const data: EmployeeData = {
      employeeId: null,
      firstName,
      lastName,
      // email left unset for past employees (schema allows null).
      email: null as unknown as string,
      preferredName: null,
      phone: null,
      company: row.company === "(no company)" ? null : row.company,
      department: row.department,
      roleTitle: row.roleTitle,
      roleFamily: null,
      site: null,
      manager: null,
      employmentType: null,
      payType: null,
      status: EmployeeStatus.TERMINATED,
      hireDate: parseDate(row.start),
      terminationDate: parseDate(row.end),
      notes: row.cause ? `Termination cause: ${row.cause}` : null,
    };
    report.inserts.push({ name: row.name, data });
  }

  // --- Group 6: active DB records not present in either sheet ------------
  for (const e of employees) {
    if (e.status !== EmployeeStatus.ACTIVE) continue;
    const key = normalizeName(`${e.firstName} ${e.lastName}`);
    if (!sheetNames.has(key)) {
      report.inDbNotInFile.push(`${e.firstName} ${e.lastName}`);
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printList(title: string, names: string[]): void {
  console.log(`\n${title} (${names.length}):`);
  if (names.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    console.log(`  - ${name}`);
  }
}

function printSummary(report: Report): void {
  console.log("\n========================================================");
  console.log("  RECONCILIATION SUMMARY");
  console.log("========================================================");
  console.log(
    `  1. Current matched to ACTIVE record:      ${
      report.emailUpdates.length + report.matchedActiveNoChange.length
    }  (email/notes updates staged: ${report.emailUpdates.length}, already correct/no email: ${report.matchedActiveNoChange.length})`,
  );
  console.log(`  2. Unmatched current (no clean match):    ${report.unmatchedCurrent.length}`);
  console.log(`  3. Active -> TERMINATED flips:            ${report.flips.length}`);
  console.log(`  4. New TERMINATED records to create:      ${report.inserts.length}`);
  console.log(`  5. Past already loaded (TERMINATED):      ${report.pastAlreadyLoaded.length}`);
  console.log(`  6. In DB, not in the new file (ACTIVE):   ${report.inDbNotInFile.length}`);
  console.log(`     Rehired — in both sheets, kept ACTIVE: ${report.rehiredKeptActive.length}`);
  console.log(`     Flagged missing-data rows:             ${report.missingDataRows.length}`);

  // Detailed name lists for the groups worth eyeballing.
  printList("Group 2 — unmatched current", report.unmatchedCurrent);
  printList(
    "Group 3 — active records flipped to TERMINATED",
    report.flips.map((f) => f.name),
  );
  printList("Group 6 — in DB, not in the new file", report.inDbNotInFile);
  printList("Rehired (kept ACTIVE, past stint not flipped)", report.rehiredKeptActive);
  printList("Flagged missing-data rows (for /review follow-up)", report.missingDataRows);

  if (report.emailWarnings.length > 0) {
    printList("Email warnings (skipped)", report.emailWarnings);
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function applyChanges(
  prisma: PrismaClient,
  report: Report,
): Promise<{ emails: number; flips: number; inserts: number }> {
  let emails = 0;
  let flips = 0;
  let inserts = 0;

  await prisma.$transaction(
    async (tx) => {
      // 1. Email (and secondary-email notes) updates on matched active records.
      for (const u of report.emailUpdates) {
        const data: Prisma.EmployeeUpdateInput = {};
        const changes: Record<string, { from: string | null; to: string | null }> = {};
        if (u.emailTo !== null) {
          data.email = u.emailTo;
          changes.email = { from: u.emailFrom, to: u.emailTo };
        }
        if (u.notesTo !== null) {
          data.notes = u.notesTo;
          changes.notes = { from: u.notesFrom, to: u.notesTo };
        }
        await tx.employee.update({ where: { id: u.id }, data });
        await tx.employeeChangeLog.create({
          data: {
            employeeId: u.id,
            action: ChangeAction.UPDATE,
            changes: changes as Prisma.InputJsonValue,
            changedBy: CHANGED_BY,
          },
        });
        emails++;
      }

      // 2. Active -> TERMINATED flips.
      for (const f of report.flips) {
        const data: Prisma.EmployeeUpdateInput = {
          status: EmployeeStatus.TERMINATED,
          terminationDate: f.terminationDate,
        };
        const changes: Record<string, { from: string | null; to: string | null }> = {
          status: { from: EmployeeStatus.ACTIVE, to: EmployeeStatus.TERMINATED },
          terminationDate: { from: null, to: fmtDate(f.terminationDate) },
        };
        if (f.notesTo !== null) {
          data.notes = f.notesTo;
          changes.notes = { from: f.notesFrom, to: f.notesTo };
        }
        await tx.employee.update({ where: { id: f.id }, data });
        await tx.employeeChangeLog.create({
          data: {
            employeeId: f.id,
            action: ChangeAction.UPDATE,
            changes: changes as Prisma.InputJsonValue,
            changedBy: CHANGED_BY,
          },
        });
        flips++;
      }

      // 3. New TERMINATED inserts, each with a CREATE log — exactly like
      //    load-roster.ts (employee.create + snapshotForCreate change log).
      for (const ins of report.inserts) {
        const employee = await tx.employee.create({
          data: ins.data as Prisma.EmployeeCreateInput,
        });
        await tx.employeeChangeLog.create({
          data: {
            employeeId: employee.id,
            action: ChangeAction.CREATE,
            changes: snapshotForCreate(ins.data) as Prisma.InputJsonValue,
            changedBy: CHANGED_BY,
          },
        });
        inserts++;
      }
    },
    // Generous ceilings for a remote DB; the whole set still finishes quickly.
    { maxWait: 30_000, timeout: 120_000 },
  );

  return { emails, flips, inserts };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const workbook = XLSX.readFile(WORKBOOK_PATH);
  const current = parseCurrent(readSheet(workbook, "Current Employees"));
  const past = parsePast(readSheet(workbook, "Past Employees"));

  console.log(
    `Parsed ${current.length} current person row(s) and ${past.length} past person row(s) from ${WORKBOOK_PATH}.`,
  );

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const employees = await prisma.employee.findMany();
    console.log(`Loaded ${employees.length} existing employee record(s) from the database.`);

    const report = reconcile(current, past, employees);
    printSummary(report);

    const staged =
      report.emailUpdates.length + report.flips.length + report.inserts.length;

    if (!COMMIT) {
      console.log("\n--------------------------------------------------------");
      console.log(`DRY RUN — nothing was written. ${staged} change(s) are staged:`);
      console.log(`  email/notes updates : ${report.emailUpdates.length}`);
      console.log(`  active -> terminated: ${report.flips.length}`);
      console.log(`  new terminated rows : ${report.inserts.length}`);
      console.log("\nRe-run with --commit to apply them.");
    } else {
      console.log("\n--------------------------------------------------------");
      console.log(`COMMIT — applying ${staged} staged change(s)...`);
      const applied = await applyChanges(prisma, report);
      console.log("\nDONE. Wrote:");
      console.log(`  email/notes updates : ${applied.emails}`);
      console.log(`  active -> terminated: ${applied.flips}`);
      console.log(`  new terminated rows : ${applied.inserts}`);
      const total = await prisma.employee.count();
      console.log(`\nEmployee row count is now ${total}.`);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
