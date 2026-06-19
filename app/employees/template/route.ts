import * as XLSX from "xlsx";

import { EMPLOYEE_COLUMNS } from "../validation";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// GET /employees/template — downloads an empty .xlsx containing just the
// expected header row, so users can fill it in and import it.
export async function GET() {
  const worksheet = XLSX.utils.aoa_to_sheet([[...EMPLOYEE_COLUMNS]]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
  const buffer: Buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": 'attachment; filename="employee-import-template.xlsx"',
    },
  });
}
