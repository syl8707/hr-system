// One-off (re-runnable): assign a Site to employees whose company + department
// resolves to exactly one site, and only when their site is currently empty.
// Never overwrites an existing site. Run with:
//
//   npx tsx scripts/assign-single-site.ts
//
// Each rule matches company (and department, where specified) case-insensitively
// and trimmed. Every assignment writes an UPDATE EmployeeChangeLog row recording
// site null -> <value>, mirroring the shape the edit server action produces
// (`{ site: { from, to } }`). Safe to re-run: once a site is set, the empty-site
// filter excludes that employee, so a second run updates 0.

// Read DATABASE_URL (and friends) from .env.local specifically, not .env.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Relative imports (not the "@/" alias) keep this runnable standalone via tsx,
// matching scripts/load-roster.ts.
import { PrismaClient } from "../app/generated/prisma/client";
import { ChangeAction } from "../app/generated/prisma/enums";
import type { Prisma } from "../app/generated/prisma/client";

// Stamp the audit trail so these auto-assignments are distinguishable in history.
const CHANGED_BY = "Site auto-assign";

// company + optional department -> the single site that combination resolves to.
type Rule = { company: string; department?: string; site: string };

const RULES: Rule[] = [
  {
    company: "Jay Patry Enterprises LLC",
    department: "Human Resources",
    site: "Main office",
  },
  { company: "2274 Princess Street Limited Partnership", site: "2274 Princess" },
  { company: "Kanata Woods Inc.", site: "180 Kanata" },
];

// Case-insensitive, trimmed comparison key for company/department matching.
function norm(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

// A site is "empty" when null or whitespace-only.
function isEmptySite(site: string | null): boolean {
  return site === null || site.trim() === "";
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    // Pull every employee once; matching/filtering happens in JS so we can
    // compare company/department trimmed + case-insensitively (and trim the
    // stored site when deciding emptiness).
    const employees = await prisma.employee.findMany({
      select: { id: true, company: true, department: true, site: true },
    });

    let grandTotal = 0;

    for (const rule of RULES) {
      const ruleCompany = norm(rule.company);
      const ruleDept = rule.department ? norm(rule.department) : null;

      // Employees matching this rule's company (and department, if specified),
      // regardless of current site — this is the "matched" figure.
      const matched = employees.filter((e) => {
        if (norm(e.company) !== ruleCompany) return false;
        if (ruleDept !== null && norm(e.department) !== ruleDept) return false;
        return true;
      });

      // Of those, the ones whose site is currently empty are the ones we update.
      const toUpdate = matched.filter((e) => isEmptySite(e.site));

      if (toUpdate.length > 0) {
        await prisma.$transaction(
          async (tx) => {
            for (const employee of toUpdate) {
              await tx.employee.update({
                where: { id: employee.id },
                data: { site: rule.site },
              });
              await tx.employeeChangeLog.create({
                data: {
                  employeeId: employee.id,
                  action: ChangeAction.UPDATE,
                  changes: {
                    site: { from: null, to: rule.site },
                  } as Prisma.InputJsonValue,
                  changedBy: CHANGED_BY,
                },
              });
            }
          },
          { maxWait: 30_000, timeout: 60_000 },
        );
      }

      const label = rule.department
        ? `${rule.company} / ${rule.department}`
        : rule.company;
      console.log(
        `${label} -> "${rule.site}": matched ${matched.length}, updated ${toUpdate.length}`,
      );
      grandTotal += toUpdate.length;
    }

    console.log(`\nTotal employees updated: ${grandTotal}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
