import { SITE_OPTIONS } from "./siteOptions";

// Sites scoped to a specific company *and* department. The most specific match:
// when both the selected company and department are found here, these are the
// only sites offered (before "Add new").
export const COMPANY_DEPARTMENT_SITES: Record<
  string,
  Record<string, string[]>
> = {
  "Jay Patry Enterprises LLC": {
    "Property Management": [
      "Main office",
      "Various properties",
      "2274 Princess",
      "The Sante",
      "Eagle Point",
    ],
    Finance: ["Main office", "Construction office (Westgate)"],
    "Architect/Planning": ["Main office", "Ottawa", "Remote"],
    Construction: [
      "Construction office",
      "Frontenac Mall",
      "2314 Princess",
      "800 Princess",
      "544 College",
      "150 Marketplace",
      "180 Kanata",
    ],
    "Human Resources": ["Main office"],
    Marketing: ["Main office", "Remote", "Ottawa"],
    Events: ["Main office", "Various sites"],
    "AI/Operations": ["Main office", "Remote"],
    Student: [
      "Main office",
      "Construction office",
      "Remote",
      "Various properties",
    ],
  },
  "Kenlar Investments Inc.": {
    "Property Management": [
      "Main office",
      "Various properties",
      "2274 Princess",
      "The Sante",
    ],
    "Events/Marketing": ["Main office", "Various properties", "2274 Princess"],
    Construction: [
      "Construction office",
      "Frontenac Mall",
      "2314 Princess",
      "800 Princess",
      "544 College",
      "150 Marketplace",
      "180 Kanata",
    ],
  },
};

// Union of every site across a company's departments — used as the company-wide
// site list when there's no department-level match.
function unionOfDepartments(
  departments: Record<string, string[]>,
): string[] {
  return [...new Set(Object.values(departments).flat())];
}

// Sites scoped to a company only, used when there's no department-level match.
export const COMPANY_SITES: Record<string, string[]> = {
  "Jay Patry Enterprises LLC": unionOfDepartments(
    COMPANY_DEPARTMENT_SITES["Jay Patry Enterprises LLC"],
  ),
  "Kenlar Investments Inc.": unionOfDepartments(
    COMPANY_DEPARTMENT_SITES["Kenlar Investments Inc."],
  ),
  "2274 Princess Street Limited Partnership": ["2274 Princess"],
  "Skyfal Investments Inc.": ["The Sante", "Various properties", "Main office"],
  "150 Marketplace Ave Inc.": ["150 Marketplace", "180 Kanata"],
  "Kanata Woods Inc.": ["180 Kanata"],
  "QM&E Engineering": ["Various sites", "Theberge Office"],
  "Urban Form Studio Inc.": ["Main office", "Ottawa", "Remote"],
  Contractors: [
    "Remote",
    "Main office",
    "Various sites",
    "Construction office",
    "2314 Princess",
  ],
};

// Compare company/department names case-insensitively and trimmed.
function norm(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeSort(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

// Normalized lookup tables, built once so the resolver can match
// case-insensitively without rescanning the source objects each call.
const companyDeptIndex = new Map<string, Map<string, string[]>>();
for (const [company, departments] of Object.entries(COMPANY_DEPARTMENT_SITES)) {
  const deptMap = new Map<string, string[]>();
  for (const [department, sites] of Object.entries(departments)) {
    deptMap.set(norm(department), sites);
  }
  companyDeptIndex.set(norm(company), deptMap);
}

const companySiteIndex = new Map<string, string[]>();
for (const [company, sites] of Object.entries(COMPANY_SITES)) {
  companySiteIndex.set(norm(company), sites);
}

// Resolves the sites valid for a given company/department selection:
//   1. the company→department list, if both match;
//   2. else the company-wide list, if the company matches;
//   3. else the full canonical SITE_OPTIONS list.
// The result is deduplicated and sorted.
export function getSiteOptionsFor(
  company: string,
  department: string,
): string[] {
  const c = norm(company ?? "");
  const d = norm(department ?? "");

  const deptMap = companyDeptIndex.get(c);
  if (deptMap) {
    const sites = deptMap.get(d);
    if (sites) return dedupeSort(sites);
  }

  const companySites = companySiteIndex.get(c);
  if (companySites) return dedupeSort(companySites);

  return dedupeSort([...SITE_OPTIONS]);
}
