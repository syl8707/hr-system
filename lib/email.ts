// Provider-agnostic email sending.
//
// Callers use `sendEmail(...)` and never learn which provider (if any) is
// behind it. The provider is chosen by which env vars are set, checked in
// order: Azure Communication Services (`ACS_CONNECTION_STRING`) is the active
// provider when configured, falling back to Resend (`RESEND_API_KEY`). When
// no provider env is configured, sending is a logged no-op that returns
// `{ sent: false }` rather than throwing, so the surrounding feature is safe
// to deploy before email is wired up. Adding a new provider later means adding
// a branch here; no caller changes.

import { EmailClient } from "@azure/communication-email";

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

async function sendViaAcs(
  input: SendEmailInput,
  connectionString: string,
): Promise<SendEmailResult> {
  const senderAddress = process.env.EMAIL_FROM;
  if (!senderAddress) {
    return {
      sent: false,
      reason: "ACS_CONNECTION_STRING is set but EMAIL_FROM is missing",
    };
  }

  try {
    const client = new EmailClient(connectionString);

    const message = {
      senderAddress,
      content: {
        subject: input.subject,
        html: input.html,
      },
      recipients: {
        to: [{ address: input.to }],
      },
      ...(input.icsContent
        ? {
            attachments: [
              {
                name: input.icsFilename ?? "invite.ics",
                contentType: "text/calendar",
                contentInBase64: Buffer.from(input.icsContent).toString(
                  "base64",
                ),
              },
            ],
          }
        : {}),
    };

    const poller = await client.beginSend(message);
    const result = await poller.pollUntilDone();
    return { sent: true, provider: "acs", id: result.id };
  } catch (error) {
    // A send failure must never crash the cron route. Log and report back.
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`email send via ACS failed: ${reason}`);
    return { sent: false, reason };
  }
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const acsConnectionString = process.env.ACS_CONNECTION_STRING;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (acsConnectionString) {
    return sendViaAcs(input, acsConnectionString);
  }

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
