import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

// Reads request headers (the cron Authorization) and queries the database at
// request time, so it must never be cached or prerendered.
export const dynamic = "force-dynamic";

const DEFAULT_LEAD_DAYS = 7;
const PROBATION_MONTHS = 3;

// --- date helpers (all date-only, anchored to UTC) -------------------------
// hireDate values are stored as UTC-midnight DateTimes (the importer/exporter
// round-trip them as YYYY-MM-DD), so we work entirely in UTC to compare the
// date portion without timezone drift.

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDaysUtc(d: Date, days: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days),
  );
}

function addMonthsUtc(d: Date, months: number): Date {
  // Day overflow (e.g. Nov 30 + 3 months) is normalised forward by Date,
  // which is a sensible behaviour for an anniversary date.
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()),
  );
}

// YYYYMMDD for an all-day VALUE=DATE ics field.
function toIcsDate(d: Date): string {
  return [
    d.getUTCFullYear().toString().padStart(4, "0"),
    (d.getUTCMonth() + 1).toString().padStart(2, "0"),
    d.getUTCDate().toString().padStart(2, "0"),
  ].join("");
}

// Full UTC timestamp (YYYYMMDDTHHMMSSZ) for DTSTAMP.
function toIcsTimestamp(d: Date): string {
  return (
    toIcsDate(d) +
    "T" +
    [
      d.getUTCHours().toString().padStart(2, "0"),
      d.getUTCMinutes().toString().padStart(2, "0"),
      d.getUTCSeconds().toString().padStart(2, "0"),
    ].join("") +
    "Z"
  );
}

// Human-friendly date like "July 3, 2026" (UTC) for the email body.
function formatLongDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

// --- content builders ------------------------------------------------------

// Per RFC 5545, ics fields must escape commas, semicolons and backslashes.
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function buildIcs(opts: {
  employeeId: string;
  employeeName: string;
  anniversary: Date;
  now: Date;
}): string {
  const { employeeId, employeeName, anniversary, now } = opts;
  const summary = `3-month probation review — ${employeeName}`;
  // Stable UID: the same employee + same date always yields the same event,
  // so re-sends update rather than duplicate the calendar entry.
  const uid = `probation-${employeeId}-${toIcsDate(anniversary)}@hr-system`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HR System//Probation Reminders//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsTimestamp(now)}`,
    // All-day event on the 3-month mark; DTEND is the exclusive next day.
    `DTSTART;VALUE=DATE:${toIcsDate(anniversary)}`,
    `DTEND;VALUE=DATE:${toIcsDate(addDaysUtc(anniversary, 1))}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(
      `${employeeName} reaches their 3-month probation mark on ${formatLongDate(anniversary)}.`,
    )}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // iCalendar requires CRLF line endings.
  return lines.join("\r\n");
}

// Matches the "First Last (Preferred)" convention used across the app.
function displayName(e: {
  firstName: string;
  lastName: string;
  preferredName: string | null;
}): string {
  const base = `${e.firstName} ${e.lastName}`.trim();
  return e.preferredName ? `${base} (${e.preferredName})` : base;
}

// --- core logic ------------------------------------------------------------

type ReminderSummary = {
  ok: boolean;
  today: string;
  leadDays: number;
  anniversaryDate: string;
  recipient: string | null;
  matched: number;
  sent: number;
  skipped: number;
  employees: string[];
};

async function runProbationReminders(): Promise<ReminderSummary> {
  const leadDays = Number.parseInt(
    process.env.PROBATION_REMINDER_LEAD_DAYS ?? "",
    10,
  );
  const effectiveLeadDays =
    Number.isFinite(leadDays) && leadDays >= 0 ? leadDays : DEFAULT_LEAD_DAYS;

  // Treat an empty/whitespace value the same as unset.
  const recipient = process.env.PROBATION_REMINDER_TO?.trim() || null;

  const now = new Date();
  const today = startOfUtcDay(now);
  // We fire on a single exact day: the day on which the 3-month anniversary is
  // exactly LEAD_DAYS away. That makes each employee trigger once, so no
  // dedupe table is needed.
  const targetAnniversary = addDaysUtc(today, effectiveLeadDays);

  const candidates = await prisma.employee.findMany({
    where: { status: "ACTIVE", hireDate: { not: null } },
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      hireDate: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const matches = candidates.filter((e) => {
    if (!e.hireDate) return false;
    const anniversary = addMonthsUtc(startOfUtcDay(e.hireDate), PROBATION_MONTHS);
    return anniversary.getTime() === targetAnniversary.getTime();
  });

  let sent = 0;
  let skipped = 0;

  for (const employee of matches) {
    const name = displayName(employee);
    const anniversary = addMonthsUtc(
      startOfUtcDay(employee.hireDate as Date),
      PROBATION_MONTHS,
    );
    const startDate = formatLongDate(startOfUtcDay(employee.hireDate as Date));
    const markDate = formatLongDate(anniversary);

    const subject = `Probation check-in: ${name} hits 3 months on ${markDate}`;
    const html =
      `<p>Hi,</p>` +
      `<p>${name} started on ${startDate}, and their 3-month probation mark is on ${markDate}.</p>` +
      `<p>This is a heads-up so you can schedule their probation review. ` +
      `I've attached a calendar hold for the date.</p>` +
      `<p>— HR System</p>`;

    // When no recipient is configured we still build everything and let
    // sendEmail no-op/log, but there is genuinely nowhere to send it, so skip.
    if (!recipient) {
      console.log(
        `probation reminder skipped: PROBATION_REMINDER_TO is not set — would have flagged ${name} (3-month mark ${markDate})`,
      );
      skipped += 1;
      continue;
    }

    const ics = buildIcs({
      employeeId: employee.employeeId ?? employee.id,
      employeeName: name,
      anniversary,
      now,
    });

    const result = await sendEmail({
      to: recipient,
      subject,
      html,
      icsContent: ics,
      icsFilename: "probation-review.ics",
    });

    if (result.sent) sent += 1;
    else skipped += 1;
  }

  return {
    ok: true,
    today: toIcsDate(today).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
    leadDays: effectiveLeadDays,
    anniversaryDate: toIcsDate(targetAnniversary).replace(
      /(\d{4})(\d{2})(\d{2})/,
      "$1-$2-$3",
    ),
    recipient,
    matched: matches.length,
    sent,
    skipped,
    employees: matches.map((e) => displayName(e)),
  };
}

// --- auth + handler --------------------------------------------------------

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // If no secret is configured, refuse rather than run wide open. Vercel only
  // attaches the Authorization header when CRON_SECRET is set, so an unset
  // secret means the endpoint is simply not enabled.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Vercel Cron invokes this with a GET carrying `Authorization: Bearer
// <CRON_SECRET>`. The same call works locally for manual testing — hit it with
// the same header to see the matched-employees summary without waiting for the
// scheduled run.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runProbationReminders();
  return Response.json(summary);
}
