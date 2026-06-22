import { prisma } from "@/lib/prisma";

// The free-text columns we surface as "pick an existing value or add a new one"
// dropdowns on the employee form.
export type EmployeeFieldOptions = {
  company: string[];
  department: string[];
  site: string[];
  roleTitle: string[];
  roleFamily: string[];
  manager: string[];
};

// Collects the distinct, non-empty values for a column, sorted alphabetically
// (case-insensitive) so the dropdown reads naturally.
function distinct(values: (string | null)[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      seen.add(value);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// Reads the existing values for each free-text field straight from the
// database so the form can offer them as dropdown options. A single projected
// query keeps it to one round-trip; distinctness is computed server-side.
export async function getEmployeeFieldOptions(): Promise<EmployeeFieldOptions> {
  const rows = await prisma.employee.findMany({
    select: {
      company: true,
      department: true,
      site: true,
      roleTitle: true,
      roleFamily: true,
      manager: true,
    },
  });

  return {
    company: distinct(rows.map((r) => r.company)),
    department: distinct(rows.map((r) => r.department)),
    site: distinct(rows.map((r) => r.site)),
    roleTitle: distinct(rows.map((r) => r.roleTitle)),
    roleFamily: distinct(rows.map((r) => r.roleFamily)),
    manager: distinct(rows.map((r) => r.manager)),
  };
}
