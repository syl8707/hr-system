import * as XLSX from "xlsx";

import { prisma } from "@/lib/prisma";
import { buildEmployeeWhere } from "../query";
import { EMPLOYEE_COLUMNS, type EmployeeColumn } from "../validation";

// Reads request-time query params, so this must run dynamically.
export const dynamic = "force-dynamic";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Stored DateTimes export as YYYY-MM-DD (round-trips with the importer).
function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

// GET /employees/export — downloads the (optionally filtered) employees as an
// .xlsx with one row per employee under a header row of the field names.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const where = buildEmployeeWhere({
    q: searchParams.get("q") ?? undefined,
    department: searchParams.get("department") ?? undefined,
    site: searchParams.get("site") ?? undefined,
    status: searchParams.get("status") ?? undefined,
  });

  const employees = await prisma.employee.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const header = [...EMPLOYEE_COLUMNS];
  const rows = employees.map((employee) => {
    const record = employee as Record<string, unknown>;
    return EMPLOYEE_COLUMNS.map((field: EmployeeColumn) => {
      const value = record[field];
      if (value instanceof Date) return formatDate(value);
      return value == null ? "" : String(value);
    });
  });

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
  const buffer: Buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  const today = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="employees-${today}.xlsx"`,
    },
  });
}
