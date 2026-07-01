# HR System

A custom HR management web application (a lightweight HRIS) for managing employee records and viewing workforce analytics. Built in-house instead of buying an off-the-shelf product, so it can grow with the company's needs.

> **📖 Taking this project over, or keeping it running?** Read **[MAINTENANCE.md](./MAINTENANCE.md)** — a plain, step-by-step maintenance & handover guide (env vars, deployment, routine tasks, data scripts, login setup, probation reminders, and troubleshooting) written for a new or non-original maintainer.

> **Status:** Live in production on Vercel, with Microsoft sign-in working and running on the real company employee data (~360 records — current employees plus past employees loaded as terminated). See [Project Status & Roadmap](#project-status--roadmap).

---

## Overview

The app has three main areas:

- **Employee records** — add, edit, view, search, sort, filter, import, export, and paginate employees.
- **Analytics dashboard** — headcount, tenure, and turnover/retention, broken down by department, site, status, and employment type, with interactive filters and a date-range window.
- **Activity log** — an audit trail of every create / edit / delete, with who and when.

It runs on the **real company employee data** (~360 records): current employees plus past employees loaded as `TERMINATED` so the turnover/retention analytics stay accurate. A seed script (`npm run seed`) that generates fake employees still exists, but it's only for local development — production is real data.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL (currently hosted on Neon) |
| ORM | Prisma (with the `@prisma/adapter-pg` driver adapter) |
| Charts | Recharts |
| Data mutations | Next.js Server Actions |
| Hosting | Vercel (live) |
| Auth | Microsoft Entra ID via Auth.js (live) |
| Email | Pluggable provider layer — Azure Communication Services (active) or Resend |
| Scheduled jobs | Vercel Cron |

All of these are standard, widely-used technologies, so any web developer can pick this project up without learning a proprietary system.

---

## Features

- **Employee list** (`/employees`) — server-side search (name / employee ID), filtering (company / department / site / status), sorting (name, hire date, company, duration), and pagination (25 per page). Columns include company, department, role, site, type, status, hire date, **termination date**, **duration** (tenure to termination or today), and last-updated.
- **Create / edit / view** employees (`/employees/new`, `/employees/[id]`, `/employees/[id]/edit`) with a two-step delete confirmation.
  - **Required fields:** first name, last name, and email (email format-validated). Employee ID is optional.
  - **Pick-or-add dropdowns** for department, site, role, and manager — populated from existing values, with an "Add new" option to keep entries consistent.
  - **Input validation & normalization** — phone numbers and emails are validated and stored in a consistent format.
- **Import / export** — import employees from CSV or Excel (`/employees/import`) with column mapping, a downloadable template, and a validation preview (valid / duplicate / error counts); export the current filtered list to `.xlsx`.
- **Change log / audit history** — every create, edit, and delete is recorded (old → new). Visible per employee in a "History" section and across the whole roster on the **Activity** page (`/activity`), filterable by action, user, and date range.
- **Data to review** (`/review`) — flags employee records with incomplete data: placeholder emails, missing site, missing hire date, missing department, or missing employment type. Summary cards count each issue across the whole roster; the table links straight to each record's edit page.
- **Analytics dashboard** (`/analytics`):
  - Summary cards (total / active / on leave / terminated)
  - Headcount by department, site, status, and employment type (with percentages); the employment-type donut uses distinct categorical colors so each type is easy to tell apart
  - Tenure distribution
  - Hires vs. terminations, with turnover % and retention % on a separate 0–100% axis
  - Company / department / site / role filters, plus a **date-range window** so you can view the workforce over any period, not just today
- **Probation reminders** — a daily Vercel Cron job emails a reminder near each active employee's 3-month mark, with a calendar invite attached. Sends through a pluggable email layer that no-ops safely until a provider is configured. See [Probation reminders](#probation-reminders).
- **"Last updated" / "created" timestamps** on each record.
- **Sample data seeding** — realistic fake employees for local development.
- Light / dark mode.

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm**
- Access to a **PostgreSQL database** (a free Neon project works for development)
- **Git**

---

## Getting Started (local setup)

```bash
# 1. Clone the repo
git clone https://github.com/syl8707/hr-system.git
cd hr-system

# 2. Install dependencies (also runs `prisma generate` via postinstall)
npm install

# 3. Create your environment file (see "Environment Variables" below)
#    Create a file named .env.local in the project root with at least DATABASE_URL

# 4. Set up the database
npx prisma migrate dev      # apply the schema / migrations
npx prisma generate         # generate the Prisma client (usually done by step above)
npm run seed                # load fake sample employees for local dev (optional)

# 5. Run the development server
npm run dev
```

Then open **http://localhost:3000** — it redirects to the employee list.

> For local login and the exact file names Next.js loads (`.env.local`), see [MAINTENANCE.md](./MAINTENANCE.md).

---

## Environment Variables

Create a `.env.local` file in the project root (production values live in the Vercel project settings instead). **Never commit secret values** anywhere in the repo.

### Database & authentication

These five are the only variables the app reads for the core app and login. `DATABASE_URL` is the one that truly must be set to run the app; the four `AUTH_*` values are needed for Microsoft sign-in.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string. **On Vercel, use Neon's _pooled_ connection string** (the host contains `-pooler`) so serverless functions don't exhaust connections. |
| `AUTH_SECRET` | For auth | Random secret used by Auth.js. Generate with `npx auth secret`. |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | For auth | The Entra ID application (client) ID. |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | For auth | The Entra ID client secret **value** (from Azure). **Sensitive — never commit.** |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | For auth | `https://login.microsoftonline.com/<TENANT_ID>/v2.0` |

> There is **no** `AUTH_URL` variable — the app sets `trustHost: true` in `auth.ts` and resolves callback URLs from the deployment host, so it isn't needed.

### Email & probation reminders

Only needed for the daily probation-reminder cron. The reminder logic runs regardless; if these are unset it just logs who it *would* have emailed and sends nothing.

| Variable | Required | Description |
|----------|----------|-------------|
| `ACS_CONNECTION_STRING` | For email | Azure Communication Services connection string. When set, ACS is the active email provider. **Sensitive.** |
| `EMAIL_FROM` | For email | Verified sender address (on a domain verified in the active email provider). |
| `PROBATION_REMINDER_TO` | For reminders | The single recipient address for probation reminders. If unset, the job runs but skips sending. |
| `PROBATION_REMINDER_LEAD_DAYS` | Optional | Days before the 3-month mark to send. Defaults to `7`. |
| `CRON_SECRET` | For cron | Shared secret protecting the cron endpoint. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>`; requests without it get `401`. If unset, the endpoint refuses all requests. **Sensitive.** |
| `RESEND_API_KEY` | Optional | Fallback email provider key, used only when `ACS_CONNECTION_STRING` is unset. **Sensitive.** |

---

## Database

- The data model lives in **`prisma/schema.prisma`** — a single readable file describing every field and relationship.
- Migrations are versioned under **`prisma/migrations/`**, so the database can be recreated from scratch with `npx prisma migrate dev` (or `npx prisma migrate deploy` in production).
- The Prisma client is generated into **`app/generated/prisma/`** (gitignored; regenerated by `npx prisma generate`).
- The client is instantiated as a singleton with a bounded connection pool in **`lib/prisma.ts`**.
- **`npm run seed`** runs `prisma/seed.ts`, which inserts fake employees using `@faker-js/faker` — for local development only.

### The Employee data model

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (cuid) | Primary key |
| `employeeId` | String? | Optional, unique business ID |
| `firstName`, `lastName` | String | |
| `preferredName` | String? | Optional |
| `email`, `phone` | String? | Optional |
| `company`, `department`, `roleTitle`, `roleFamily`, `site`, `manager` | String? | Kept as free text for flexibility |
| `employmentType` | Enum? | `FULL_TIME` / `PART_TIME` / `CONTRACTOR` / `SEASONAL` |
| `payType` | Enum? | `HOURLY` / `SALARY` |
| `status` | Enum | `ACTIVE` / `LEAVE_OF_ABSENCE` / `TERMINATED` (default `ACTIVE`) |
| `hireDate`, `terminationDate` | DateTime? | |
| `notes` | String? | |
| `createdAt`, `updatedAt` | DateTime | Managed automatically |

> Terminated employees are **not deleted** — their `status` is set to `TERMINATED` with a `terminationDate`, preserving history for turnover/retention metrics.

> A separate **`EmployeeChangeLog`** model records every create/edit/delete with the changed fields (old → new), a timestamp, and a `changedBy` field. It has no foreign key to `Employee`, so the history is preserved even if an employee is deleted.

---

## Project Structure

```
app/
  page.tsx                  # redirects to /employees
  Sidebar.tsx               # left-hand nav
  employees/
    page.tsx                # list: search, sort, filters, pagination
    new/page.tsx            # create form
    [id]/page.tsx           # employee detail (+ History)
    [id]/edit/page.tsx      # edit form
    EmployeeForm.tsx        # shared form (pick-or-add dropdowns)
    actions.ts              # server actions (create/update/delete + change-log)
    query.ts                # shared where/orderBy for list + export
    options.ts              # distinct dropdown values from the DB
    import/                 # CSV/Excel import (mapping + preview)
    export/route.ts         # .xlsx export of the filtered list
    template/route.ts       # downloadable import template
  analytics/
    page.tsx                # dashboard (server component)
    Charts.tsx              # chart components (client)
    AnalyticsFilters.tsx    # dashboard filters + date-range window
  review/
    page.tsx                # "Data to review" — flags incomplete records
    query.ts                # the data-completeness checks
  activity/page.tsx         # roster-wide audit log
  api/
    auth/[...nextauth]/     # Auth.js route handler
    cron/probation-reminders/route.ts   # daily probation-reminder cron
  generated/prisma/         # generated Prisma client (gitignored)
lib/
  prisma.ts                 # Prisma client singleton (pooled)
  email.ts                  # provider-agnostic sendEmail (ACS / Resend / no-op)
prisma/
  schema.prisma             # data model
  migrations/               # migration history
  seed.ts                   # seeds fake employees (local dev only)
scripts/
  load-roster.ts            # one-time load of the real roster (destructive)
  load-employee-update.ts   # apply an employee-data update
  assign-single-site.ts     # auto-fill missing sites (safe to re-run)
auth.ts                     # Auth.js (Microsoft Entra ID) config
middleware.ts               # login gate (excludes /api/cron)
vercel.json                 # Vercel Cron schedule
.env.local                  # environment variables (NOT committed)
```

---

## Authentication (Microsoft Entra ID)

Sign-in uses **Microsoft Entra ID** through **Auth.js**, with a secure server-side authorization-code flow (a confidential client with a client secret) — chosen over browser-only sign-in because the app handles sensitive employee data. It is **live in production**: users sign in with their company Microsoft account, and `middleware.ts` requires a session on every page except the sign-in page and the cron endpoints.

Setup overview:

1. An app registration in Microsoft Entra ID (type **Web**) provides the client ID, tenant ID, and a client secret.
2. The redirect URIs are registered:
   - Dev: `http://localhost:3000/api/auth/callback/microsoft-entra-id`
   - Production: `https://<deployment-url>/api/auth/callback/microsoft-entra-id`
3. The values go into the `AUTH_*` environment variables (see above).

> The `AUTH_MICROSOFT_ENTRA_ID_SECRET` must be the client secret **value**, not the Secret ID — pasting the Secret ID causes an `invalid_client` error. See [MAINTENANCE.md](./MAINTENANCE.md) for the full walkthrough.

---

## Probation reminders

A daily Vercel Cron job (configured in `vercel.json`, running once a day) hits `/api/cron/probation-reminders`. The endpoint finds **ACTIVE** employees whose 3-month anniversary (from `hireDate`) is exactly `PROBATION_REMINDER_LEAD_DAYS` away (default 7) and emails one reminder per match to `PROBATION_REMINDER_TO`, with an `.ics` calendar invite for the 3-month date.

- **Forward-only:** it fires `LEAD_DAYS` *before* the 3-month mark and never looks back, so employees whose mark has already passed are not emailed retroactively. Employees with no `hireDate` are skipped. Firing on a single exact day means each employee triggers once, so there's no dedupe table and no schema change.
- **Email goes through `lib/email.ts`**, a provider-agnostic layer. It picks a provider by which env vars are set: **Azure Communication Services** when `ACS_CONNECTION_STRING` is set (the active provider), **Resend** as a fallback when `RESEND_API_KEY` is set, and otherwise a **no-op** that logs who it would have emailed and reports `sent: 0`. So the feature is safe to run before email is configured, and a send failure is caught and logged rather than crashing the cron.
- **Protected by `CRON_SECRET`.** The endpoint is a `GET` that authenticates solely via the bearer token, so you can hit it manually to preview the matched-employees summary.

Full operational detail (schedule, manual testing, provider setup) is in [MAINTENANCE.md → Probation reminders](./MAINTENANCE.md#10-probation-reminders).

---

## Deployment (Vercel)

The app is deployed on Vercel and redeploys automatically on every push to `main`.

1. The GitHub repo is imported as a Vercel project.
2. Environment variables are set in the Vercel project settings — most importantly `DATABASE_URL` using Neon's **pooled** connection string, plus the `AUTH_*`, email, and cron variables above.
3. The Prisma client is generated on each build via the `postinstall` script (`prisma generate`), so Vercel regenerates it automatically.
4. The production URL's callback is registered in the Entra redirect URIs; the cron schedule in `vercel.json` runs the probation reminder daily.

---

## Common Tasks

### Add a new employee field
1. Add the field to the `Employee` model in `prisma/schema.prisma`.
2. Run `npx prisma migrate dev --name add_<field>` to create and apply the migration.
3. Add the field to the create/edit forms (`app/employees/new` and `app/employees/[id]/edit`, via `EmployeeForm.tsx`) and the detail view.

### Add a new chart / report
Add a component in `app/analytics/Charts.tsx` and render it from `app/analytics/page.tsx`, computing the data with a Prisma query in the page (server component).

### Add a new "data to review" check
Add an entry to `REVIEW_CHECKS` in `app/review/query.ts` — the summary counts, the filter, and the Issues column all derive from that list.

### Load / update the real employee data
- `scripts/load-roster.ts` does the initial one-time load from `roster.xlsx` (**destructive** — it wipes existing employees and change-log rows first, after validating every row).
- `scripts/load-employee-update.ts` applies an update to existing employee data.
- `scripts/assign-single-site.ts` auto-fills missing sites where the mapping is unambiguous (safe to re-run).

Run these with `npx tsx scripts/<name>.ts`. See [MAINTENANCE.md → Data scripts](./MAINTENANCE.md#6-data-scripts-run-from-a-terminal) for the details and the `DATABASE_URL` gotcha.

### Reset / reseed local sample data
Re-run `npm run seed` (clear existing rows first if needed). Local development only — don't run against production.

---

## Project Status & Roadmap

**Done**
- Employee CRUD with search, sort, filters, and pagination (plus a duration column and termination-date column)
- Required-field rules, pick-or-add dropdowns, and input validation/normalization
- CSV/Excel import (with mapping + preview) and filtered `.xlsx` export
- "Last updated" timestamps, per-employee History, and a roster-wide Activity/audit log
- "Data to review" page flagging incomplete records
- Analytics dashboard (headcount, tenure, turnover/retention) with company / department / site / role filters and a date-range window; distinct categorical colors on the employment-type chart
- Probation reminders (daily Vercel Cron + calendar invite) through a pluggable email layer (ACS / Resend / no-op)
- **Microsoft Entra ID sign-in** — working in production
- **Deployment to Vercel** — live
- **Connected the real company employee data** — loaded via `scripts/load-roster.ts`
- Polished UI (light/dark mode)

**Planned**
- Migrate off the temporary Neon instance onto the company database (only a new `DATABASE_URL` + `migrate deploy` + data load are needed)
- Link with the SharePoint new-hire onboarding (one shared employee data source)
- Reusable form templates
- Payroll integration

---

## Handoff Notes

To take this project over, you'll need ownership/access to:

- **The GitHub repository** (this repo) — contains all code and history.
- **The Vercel project** — hosting and environment variables.
- **The PostgreSQL database** (Neon or the company database).
- **The Microsoft Entra ID app registration** — for sign-in.
- **The email/ACS setup** (and, if used, Resend) — for probation reminders.

Everything needed to run the app is in this repo plus the environment variables above. Because the stack is standard and the data model and migrations are in code, the project can be cloned, configured, and run by any web developer. Start with [MAINTENANCE.md](./MAINTENANCE.md).
</content>
</invoke>
