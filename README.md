# HR System

A custom HR management web application (a lightweight HRIS) for managing employee records and viewing workforce analytics. Built in-house instead of buying an off-the-shelf product, so it can grow with the company's needs.

> **📖 Taking this project over, or keeping it running?** Read **[MAINTENANCE.md](./MAINTENANCE.md)** — a plain, step-by-step maintenance & handover guide (env vars, deployment, routine tasks, data scripts, login setup, and troubleshooting) written for a new or non-original maintainer.

> **Status:** Core features complete and demo-ready, running locally on sample data. Microsoft sign-in and deployment are in progress. See [Project Status & Roadmap](#project-status--roadmap).

---

## Overview

The app has two main areas:

- **Employee records** — add, edit, view, search, filter, and paginate employees.
- **Analytics dashboard** — headcount, tenure, and turnover/retention, broken down by department, site, status, and employment type, with interactive filters.

It currently runs on **500 generated sample employees** so the features can be built and tested without real data. Connecting the real company data is a small configuration change (see [Connecting the real database](#connecting-the-real-database)).

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
| Hosting (target) | Vercel |
| Auth (in progress) | Microsoft Entra ID via Auth.js |

All of these are standard, widely-used technologies, so any web developer can pick this project up without learning a proprietary system.

---

## Features

- **Employee list** (`/employees`) — server-side search, filtering (department / site / status), and pagination (25 per page), with a "last updated" column.
- **Create / edit / view** employees (`/employees/new`, `/employees/[id]`, `/employees/[id]/edit`) with a two-step delete confirmation.
  - **Required fields:** first name, last name, and email (email format-validated). Employee ID is optional.
  - **Pick-or-add dropdowns** for department, site, role, and manager — populated from existing values, with an "Add new" option to keep entries consistent.
  - **Input validation & normalization** — phone numbers and emails are validated and stored in a consistent format.
- **Change log / audit history** — every create, edit, and delete is recorded (old → new) and shown in a "History" section on each employee's page.
- **Analytics dashboard** (`/analytics`):
  - Summary cards (total / active / on leave / terminated)
  - Headcount by department, site, status, and employment type (with percentages)
  - Tenure distribution
  - Hires vs. terminations, with turnover % and retention % on a separate 0–100% axis
  - Department / site / role filters
- **"Last updated" / "created" timestamps** on each record.
- **Sample data seeding** — 500 realistic fake employees for development.
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

# 2. Install dependencies
npm install

# 3. Create your environment file (see "Environment Variables" below)
#    Create a file named .env in the project root with at least DATABASE_URL

# 4. Set up the database
npx prisma migrate dev      # apply the schema / migrations
npx prisma generate         # generate the Prisma client
npm run seed                # load 500 sample employees (optional)

# 5. Run the development server
npm run dev
```

Then open **http://localhost:3000** — it redirects to the employee list.

---

## Environment Variables

Create a `.env` file in the project root. **Never commit this file** (it is gitignored) and never hardcode these values in the code.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string. For local dev, use your Neon (or other Postgres) connection string. **On Vercel, use Neon's _pooled_ connection string** (the host contains `-pooler`) so serverless functions don't exhaust connections. |
| `AUTH_SECRET` | For auth | Random secret used by Auth.js. Generate with `npx auth secret`. |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | For auth | The Entra ID application (client) ID. |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | For auth | The Entra ID client secret (from Azure). **Secret — never commit.** |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | For auth | `https://login.microsoftonline.com/<TENANT_ID>/v2.0` |
| `AUTH_URL` | For auth | Base URL of the app (`http://localhost:3000` in dev, the deployment URL in production). |

> The `AUTH_*` variables are for the Microsoft sign-in, which is being wired in. Until then, only `DATABASE_URL` is required to run the app.

---

## Database

- The data model lives in **`prisma/schema.prisma`** — a single readable file describing every field and relationship.
- Migrations are versioned under **`prisma/migrations/`**, so the database can be recreated from scratch with `npx prisma migrate dev` (or `npx prisma migrate deploy` in production).
- The Prisma client is generated into **`app/generated/prisma/`** (gitignored; regenerated by `npx prisma generate`).
- The client is instantiated as a singleton with a bounded connection pool in **`lib/prisma.ts`**.
- **`npm run seed`** runs `prisma/seed.ts`, which inserts 500 fake employees using `@faker-js/faker`.

### The Employee data model

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (cuid) | Primary key |
| `employeeId` | String? | Optional, unique business ID |
| `firstName`, `lastName` | String | |
| `preferredName` | String? | Optional |
| `email`, `phone` | String? | Optional |
| `department`, `site`, `roleTitle`, `roleFamily`, `manager` | String? | Kept as free text for flexibility |
| `employmentType` | Enum? | `FULL_TIME` / `PART_TIME` / `CONTRACTOR` / `SEASONAL` |
| `payType` | Enum? | `HOURLY` / `SALARY` |
| `status` | Enum | `ACTIVE` / `LEAVE_OF_ABSENCE` / `TERMINATED` (default `ACTIVE`) |
| `hireDate`, `terminationDate` | DateTime? | |
| `notes` | String? | |
| `createdAt`, `updatedAt` | DateTime | Managed automatically |

> Terminated employees are **not deleted** — their `status` is set to `TERMINATED` with a `terminationDate`, preserving history for turnover/retention metrics.

> A separate **`EmployeeChangeLog`** model records every create/edit/delete with the changed fields (old → new), a timestamp, and a `changedBy` field (populated once Microsoft sign-in is added). It has no foreign key to `Employee`, so the history is preserved even if an employee is deleted.

---

## Project Structure

```
app/
  page.tsx                  # redirects to /employees
  employees/
    page.tsx                # list: search, filters, pagination
    new/page.tsx            # create form
    [id]/page.tsx           # employee detail (+ History)
    [id]/edit/page.tsx      # edit form
    EmployeeForm.tsx        # shared form (pick-or-add dropdowns)
    actions.ts              # server actions (create/update/delete + change-log)
    options.ts              # distinct dropdown values from the DB
    History.tsx             # change-log / audit history view
  analytics/
    page.tsx                # dashboard (server component)
    Charts.tsx              # chart components (client)
    AnalyticsFilters.tsx    # dashboard filters
  generated/prisma/         # generated Prisma client (gitignored)
lib/
  prisma.ts                 # Prisma client singleton (pooled)
prisma/
  schema.prisma             # data model
  migrations/               # migration history
  seed.ts                   # seeds 500 sample employees
.env                        # environment variables (NOT committed)
```

---

## Authentication (Microsoft Entra ID) — in progress

Sign-in uses **Microsoft Entra ID** through **Auth.js**, with a secure server-side authorization-code flow (a confidential client with a client secret) — chosen over browser-only sign-in because the app handles sensitive employee data.

Setup overview:

1. An app registration is created in Microsoft Entra ID (type **Web**), which provides the client ID, tenant ID, and a client secret.
2. The redirect URIs are registered:
   - Dev: `http://localhost:3000/api/auth/callback/microsoft-entra-id`
   - Production: `https://<deployment-url>/api/auth/callback/microsoft-entra-id`
3. The values go into the `AUTH_*` environment variables (see above).

Once enabled, users sign in with their company Microsoft account, and only authorized accounts can access the app.

---

## Deployment (Vercel)

1. Import the GitHub repo as a new Vercel project.
2. Set the environment variables in the Vercel project settings — most importantly `DATABASE_URL` using Neon's **pooled** connection string.
3. Ensure the Prisma client is generated on each build. This project runs `prisma generate` via a `postinstall` script in `package.json`, so Vercel regenerates the client automatically.
4. Deploy. After the first deploy, add the production URL's callback to the Entra redirect URIs.

---

## Common Tasks

### Add a new employee field
1. Add the field to the `Employee` model in `prisma/schema.prisma`.
2. Run `npx prisma migrate dev --name add_<field>` to create and apply the migration.
3. Add the field to the create/edit forms (`app/employees/new` and `app/employees/[id]/edit`) and the detail view.

### Add a new chart / report
Add a component in `app/analytics/Charts.tsx` and render it from `app/analytics/page.tsx`, computing the data with a Prisma query in the page (server component).

### Connecting the real database
1. Point `DATABASE_URL` at the company's PostgreSQL database.
2. Run `npx prisma migrate deploy` to apply the schema.
3. Import the real employee data (replacing the seed step).

### Reset / reseed sample data
Re-run `npm run seed` (clear existing rows first if needed).

---

## Project Status & Roadmap

**Done**
- Employee CRUD with search, filters, and pagination
- Required-field rules, pick-or-add dropdowns, and input validation/normalization
- "Last updated" timestamps and a change-log / audit history
- Analytics dashboard (headcount, tenure, turnover/retention) with department / site / role filters
- 500-employee sample data seeding
- Polished UI (light/dark mode)

**In progress**
- Microsoft Entra ID sign-in (app registration done; finishing the wiring)
- Deployment to Vercel

**Planned**
- Connect the real company database
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

Everything needed to run the app is in this repo plus the environment variables above. Because the stack is standard and the data model and migrations are in code, the project can be cloned, configured, and run by any web developer.
