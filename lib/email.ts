// Provider-agnostic email sending.
//
// Callers use `sendEmail(...)` and never learn which provider (if any) is
// behind it. Today there is one real provider — Resend — selected when
// `RESEND_API_KEY` is set. When no provider env is configured, sending is a
// logged no-op that returns `{ sent: false }` rather than throwing, so the
// surrounding feature is safe to deploy before email is wired up. Adding a
// new provider later (e.g. Microsoft Graph) means adding a branch here; no
// caller changes.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  // Optional iCalendar attachment. When both are present the .ics is attached
  // so the message doubles as a calendar invite.
  icsContent?: string;
  icsFilename?: string;
};

export type SendEmailResult =
  | { sent: true; provider: string; id?: string }
  | { sent: false; reason: string };

// Resend's REST API is called directly with `fetch` so we don't take on the
// `resend` npm package as a dependency. The contract is small and stable.
const RESEND_ENDPOINT = "https://api.resend.com/emails";

async function sendViaResend(
  input: SendEmailInput,
  apiKey: string,
): Promise<SendEmailResult> {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    return {
      sent: false,
      reason: "RESEND_API_KEY is set but EMAIL_FROM is missing",
    };
  }

  const body: Record<string, unknown> = {
    from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
  };

  if (input.icsContent) {
    body.attachments = [
      {
        filename: input.icsFilename ?? "invite.ics",
        // Resend expects attachment content as a base64 string.
        content: Buffer.from(input.icsContent, "utf-8").toString("base64"),
        content_type: "text/calendar; method=PUBLISH",
      },
    ];
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      sent: false,
      reason: `Resend responded ${response.status}: ${detail.slice(0, 500)}`,
    };
  }

  const data = (await response.json().catch(() => ({}))) as { id?: string };
  return { sent: true, provider: "resend", id: data.id };
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey) {
    return sendViaResend(input, resendApiKey);
  }

  // No provider configured: do not throw. Log a clear line and report back
  // that nothing was sent, so callers can summarise accurately.
  const reason = "no provider configured";
  console.log(
    `email skipped: ${reason} — would have sent to ${input.to}: ${input.subject}`,
  );
  return { sent: false, reason };
}
