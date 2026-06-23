# Maintenance & Handover Guide

This is the practical "keep it running" guide for the HR System, written for whoever
takes it over after the original developer. You don't need to be a deep web developer
to follow it — most day-to-day work happens inside the running app. The parts that do
need a terminal (running scripts, changing the data model) are spelled out command by
command.

Read this top to bottom once. After that, jump to the section you need.

---

## 1. What this app is, and what it's built from

The HR System is a small in-house web app for managing employee records and viewing
workforce analytics. It does three things:

- **Employees** — add, edit, view, search, filter, import, and export employee records.
- **Analytics** — headcount, tenure, and turnover/retention charts with filters.
- **Activity** — an audit log of every create / edit / delete, with who and when.

The stack, in plain terms:

| Piece | What it is | Why it matters to you |
|-------|-----------|------------------------|
| **Next.js** (`next` 16.x) | The web framework the whole app is written in. | This is the app itself. |
| **React 19** | The UI library Next.js uses. | You won't touch it directly. |
| **Prisma 7** (`@prisma/client`, `@prisma/adapter-pg`) | The "ORM" — the layer that talks to the database. | The data model lives in `prisma/schema.prisma`. |
| **Neon Postgres** | The PostgreSQL database, currently hosted at Neon (a cloud Postgres provider). | This is where all the data actually lives. See [section 9](#9-the-database-neon-postgres). |
| **Vercel** | Where the app is hosted/deployed. | Pushing to GitHub redeploys here. See [section 4](#4-how-deployment-works). |
| **Auth.js** (`next-auth` v5) + **Microsoft Entra ID** | Login. Users sign in with their company Microsoft account. | See [sections 8](#8-login--microsoft-entra-id). |

Everything needed to run the app is in this repo plus a handful of environment
variables (secrets and connection strings). The code is all standard, widely-used
technology, so any web developer can pick it up.

---

## 2. Running it locally

You need **Node.js 18+**, **npm**, and **git** installed.

```bash
# 1. Get the code
git clone https://github.com/syl8707/hr-system.git
cd hr-system

# 2. Install dependencies
#    (this also runs `prisma generate` automatically — see the postinstall note below)
npm install

# 3. Create your local environment file (see section 3 for what goes in it)
#    The file MUST be named .env.local and live in the project root.

# 4. Start the app
npm run dev
```

Then open **http://localhost:3000**.

**About `npm install` and `prisma generate`:** `package.json` has a `postinstall`
script that runs `prisma generate` for you. That command reads `prisma/schema.prisma`
and regenerates the Prisma client code into `app/generated/prisma/` (which is not
committed to git). So after every `npm install` — and after every schema change — the
client is rebuilt automatically. If you ever see TypeScript/build errors about missing
Prisma types, running `npx prisma generate` by hand fixes it.

### The exact environment variables the code expects

Create a file named **`.env.local`** in the project root with these keys. **Use
placeholders only here — never commit real secret values.** (`.env.local` is
gitignored, so it won't be committed by accident, but don't paste secrets into this
guide, the README, or anywhere in the repo.)

```bash
# Database connection string (Neon — use the POOLED connection string)
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DB?sslmode=require"

# Auth.js session secret — generate one with:  npx auth secret
AUTH_SECRET="REPLACE_WITH_GENERATED_SECRET"

# Microsoft Entra ID app registration values (see section 8)
AUTH_MICROSOFT_ENTRA_ID_ID="REPLACE_WITH_ENTRA_APPLICATION_CLIENT_ID"
AUTH_MICROSOFT_ENTRA_ID_SECRET="REPLACE_WITH_ENTRA_CLIENT_SECRET_VALUE"
AUTH_MICROSOFT_ENTRA_ID_ISSUER="https://login.microsoftonline.com/REPLACE_WITH_TENANT_ID/v2.0"
```

These are the exact names the code reads:

- `DATABASE_URL` — read in `lib/prisma.ts`, `prisma.config.ts`, and the data scripts.
- `AUTH_SECRET` — read automatically by Auth.js (`auth.ts`).
- `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`,
  `AUTH_MICROSOFT_ENTRA_ID_ISSUER` — read in `auth.ts`.

> If you only want to look at the app and don't need login working locally,
> `DATABASE_URL` is the one that truly must be set. The `AUTH_*` values are needed for
> the Microsoft sign-in to work.

---

## 3. How environment variables work (local vs. production)

There are two completely separate places these values live, and they do **not** sync:

- **Local development:** the `.env.local` file in the project root (see above). Only on
  your machine. Next.js loads it automatically when you run `npm run dev`.
- **Production:** the **Vercel project settings** → *Settings → Environment Variables*.
  This is what the live, deployed app uses. Changing `.env.local` does nothing to
  production, and vice versa.

What each variable is for:

| Variable | What it's for |
|----------|----------------|
| `DATABASE_URL` | Which database the app reads/writes. Local and production usually point at the same Neon database for now, but they are configured independently. |
| `AUTH_SECRET` | Signs/encrypts login session cookies. Can differ between local and production. |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | The Entra app's "Application (client) ID". |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | The Entra client secret **value** (not the Secret ID — see [section 8](#8-login--microsoft-entra-id)). |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | `https://login.microsoftonline.com/<TENANT_ID>/v2.0`. |

> **Vercel "Sensitive" variables are write-only.** When you mark a variable as
> Sensitive in Vercel (recommended for `DATABASE_URL`, `AUTH_SECRET`, and the Entra
> secret), you can update it but you can **not** read it back later — the value is
> hidden forever after saving. So keep a copy of any secret somewhere safe (a password
> manager) when you set it. If you lose it, you regenerate it at the source (Neon for
> the DB string, Entra for the secret) and paste the new one in.

After changing any production variable in Vercel, you must **redeploy** for it to take
effect (Vercel will usually prompt you, or just push a commit / use *Redeploy*).

---

## 4. How deployment works

Deployment is automatic through Vercel:

1. **Push to the `main` branch on GitHub.** That's it — Vercel watches `main` and
   starts a new deploy on every push.
2. Vercel runs `npm install` (which triggers `prisma generate` via `postinstall`) and
   then `npm run build`.
3. When it finishes, the deploy shows **"Ready"** in the Vercel dashboard.

To check a deploy:

- Go to the Vercel project → **Deployments**.
- The newest one is at the top. Watch its status go from *Building* → **Ready**.
- A green **Ready** means it's live. If it shows **Error**, click into it and read the
  build logs (see [troubleshooting](#10-troubleshooting)).

You don't run any deploy command yourself. If you need to push a change:

```bash
git add -A
git commit -m "Describe what you changed"
git push origin main
```

---

## 5. Routine tasks (done inside the running app)

These all happen in the browser, in the app's left sidebar: **Employees**,
**Analytics**, **Activity**.

### Add an employee
1. Go to **Employees**.
2. Click **New employee** (top right).
3. Fill in the form. **First name, last name, and email are required** (email must be a
   valid email format). Employee ID is optional.
4. For department, site, role, and manager you can pick an existing value from the
   dropdown or choose **Add new** to type a new one — this keeps spellings consistent.
5. Click save. The new person appears in the list, and a "created" entry is written to
   the Activity log.

### Edit an employee
1. Go to **Employees** and click the person's row.
2. Click **Edit**.
3. Change the fields and save. Every changed field is recorded in the Activity log
   (old value → new value).

> Note: to mark someone as having left, set their **Status** to `TERMINATED` and fill
> in a termination date — don't delete them. Terminated people are kept so the
> turnover/retention analytics stay accurate.

### Delete an employee
1. Open the person's detail page.
2. Click **Delete**, then confirm on the **"Are you sure?"** step (it's a two-click
   action on purpose).
3. The record is removed, but a "delete" entry stays in the Activity log permanently.

### Search and filter the employee list
On the **Employees** page, the toolbar gives you:
- **Search box** — searches by name or employee ID (type and it filters as you go).
- **Company** dropdown.
- **Department** dropdown.
- **Site** dropdown.
- **Status** dropdown (Active / Leave of absence / Terminated).
- **Sort** dropdown (changes the order of the list).

Filters combine, and they're stored in the page URL — so you can bookmark or share a
filtered view, and the back button works.

### Export employees (to Excel)
1. Set any filters you want on the **Employees** page (the export respects them — filter
   first, then export gives you just that subset).
2. Click **Export**.
3. You get an `.xlsx` file named `employees-YYYY-MM-DD.xlsx` with one row per employee.

### Import employees (from CSV or Excel)
1. Go to **Employees → Import**.
2. (Optional but recommended) click **Download template** to get a spreadsheet with the
   right column headers.
3. Choose your `.xlsx` or `.csv` file.
4. **Map columns** — the app guesses which spreadsheet column maps to which field; fix
   any it got wrong. Required fields are marked with a red `*`.
5. Review the **Preview**: it shows how many rows are **Valid**, how many are
   **Duplicates (skipped)**, and how many have **Errors** (with the row number and
   reason). Duplicates and errored rows are *not* imported.
6. Click **Import N employees** to commit. You'll get a summary of created / skipped /
   errors, and each import is recorded in the Activity log.

### Read the Activity / audit log
1. Go to **Activity**.
2. Every create, edit, and delete across all employees is listed newest-first, 25 per
   page.
3. Filter by **action** (create/update/delete), by **user** (who made the change), and
   by **date range** (from / to).
4. Click an employee's name to jump to their record. If a record was deleted, the log
   still shows it as "Deleted employee" with the name it had.

---

## 6. Data scripts (run from a terminal)

There are two helper scripts in `scripts/`. **Both write directly to whatever database
`DATABASE_URL` points at — which is currently production.** Double-check your
`.env.local`'s `DATABASE_URL` before running either one.

Both scripts read `DATABASE_URL` from **`.env.local`** (they load it explicitly), so
make sure that file has the right connection string.

### `scripts/load-roster.ts` — load the real roster (DESTRUCTIVE)
- **What it does:** reads a file named `roster.xlsx` in the project root, validates
  every row first, then **deletes all existing employees and change-log rows** and
  re-inserts the roster. It uses the same validation/normalization as the app's import,
  and stamps the audit log with "Data import".
- **Important:** this wipes existing data. It's meant for the initial one-time load of
  the real roster, not routine use. If any row is invalid, it aborts *before* deleting
  anything.
- **Run it with:**
  ```bash
  npx tsx scripts/load-roster.ts
  ```

### `scripts/assign-single-site.ts` — auto-fill missing sites (SAFE to re-run)
- **What it does:** for employees whose company (and sometimes department) maps to
  exactly one site, it fills in their **Site** — but **only when their site is currently
  empty**. It never overwrites an existing site. Each change is recorded in the Activity
  log as "Site auto-assign".
- **Safe to re-run:** because it only touches empty-site records, running it a second
  time updates 0 rows. No harm done.
- **Run it with:**
  ```bash
  npx tsx scripts/assign-single-site.ts
  ```
- The company → site rules are hard-coded near the top of the file (in the `RULES`
  array). To add or change a rule, edit that array.

---

## 7. Changing the data model (adding/changing a field)

The data model lives in **`prisma/schema.prisma`** — specifically the `Employee` and
`EmployeeChangeLog` models and the enums (`EmploymentType`, `PayType`,
`EmployeeStatus`, `ChangeAction`). Past changes are versioned in
`prisma/migrations/`.

**⚠️ Test against a non-production database first.** A migration changes the real
database structure. Point `DATABASE_URL` at a scratch/dev database, get the migration
working there, and only then run it against production.

Steps to add a field (example: a `birthDate` field on Employee):

1. Edit `prisma/schema.prisma` and add the field to the `Employee` model, e.g.
   `birthDate DateTime?`.

2. Create and apply the migration locally:
   ```bash
   npx prisma migrate dev --name add_birth_date
   ```
   This creates a new folder under `prisma/migrations/`, applies it to your dev
   database, and regenerates the Prisma client.

3. Regenerate the client explicitly if needed (usually step 2 already did it):
   ```bash
   npx prisma generate
   ```

4. Add the field to the forms and views if users should see/edit it — the create form,
   the edit form (`app/employees/new`, `app/employees/[id]/edit`), the
   `EmployeeForm.tsx`, and the detail page. (This part is real code work.)

5. Commit and push. On the production deploy, the migration is applied with:
   ```bash
   npx prisma migrate deploy
   ```
   Run `migrate deploy` (not `migrate dev`) against production — it only applies
   existing migrations and never tries to reset data.

> **Gotcha — where Prisma reads `DATABASE_URL`.** The app and the data scripts read
> `.env.local`, but the **Prisma CLI** reads its config from `prisma.config.ts`, which
> loads a plain **`.env`** file (via `dotenv/config`). There is no `.env` in this repo.
> So a bare `npx prisma migrate ...` may report it can't find the database URL. Fix it
> one of these ways:
> - set it just for that one command:
>   ```bash
>   DATABASE_URL="postgresql://...your connection string..." npx prisma migrate deploy
>   ```
> - or create a `.env` file containing the same `DATABASE_URL=` line (used only by the
>   Prisma CLI), in addition to your `.env.local`.

---

## 8. Login / Microsoft Entra ID

Login is handled by Auth.js (`auth.ts`) using **Microsoft Entra ID**. Users sign in
with their company Microsoft account; the sign-in page is at `/signin`, and almost
every page requires being signed in (enforced in `middleware.ts`).

There's an **app registration** in Microsoft Entra (in the Azure / Entra admin portal)
that provides the three `AUTH_MICROSOFT_ENTRA_ID_*` values. The most important config
on the Entra side is the **redirect URIs** — the URLs Microsoft is allowed to send the
user back to after login. Both of these must be registered on the app registration
(type **Web**):

- **Local:** `http://localhost:3000/api/auth/callback/microsoft-entra-id`
- **Production:** `https://<your-vercel-deployment-url>/api/auth/callback/microsoft-entra-id`

If you deploy to a new URL, add its callback to the Entra redirect URIs or login will
fail there.

> ### ⚠️ The #1 gotcha: "Secret ID" is NOT the secret
> When you create a client secret in Entra, the portal shows two things: a **Secret ID**
> (a GUID that just identifies the secret) and a **Value** (the actual secret string,
> shown only once when you create it). **`AUTH_MICROSOFT_ENTRA_ID_SECRET` must be the
> Value, not the Secret ID.** Pasting the Secret ID causes an **`invalid_client`** error
> at login. The Value is only visible right after you create the secret — if you didn't
> copy it, you can't get it back; create a new secret and copy its Value immediately.

---

## 9. The database (Neon Postgres)

- The data currently lives on a **temporary Neon Postgres instance** (Neon is a cloud
  Postgres host). This is fine for now but is **not** the long-term home.
- **Where `DATABASE_URL` comes from:** the **Neon console** → your project → *Connection
  Details*. Copy the **pooled** connection string — the host contains **`-pooler`**.
  The pooled string matters because the app runs as serverless functions on Vercel and
  would otherwise exhaust the database's connection limit. Use the pooled string in both
  `.env.local` and the Vercel `DATABASE_URL`.
- The connection is made in `lib/prisma.ts` using a bounded pool (max 5 connections) via
  the `@prisma/adapter-pg` driver — you don't need to change that.

> **Planned work:** migrating off this temporary Neon instance onto the **company
> database**. When that happens, the only change the app needs is a new `DATABASE_URL`
> (and running `npx prisma migrate deploy` against the new database to create the
> schema, then loading the data). Everything else stays the same.

---

## 10. Troubleshooting

| Symptom | Likely cause & fix |
|---------|--------------------|
| **`invalid_client` error at login** | The Entra secret is wrong — almost always because the **Secret ID** was pasted instead of the secret **Value**. Create a fresh client secret in Entra, copy its **Value**, and update `AUTH_MICROSOFT_ENTRA_ID_SECRET` (locally in `.env.local`, in production in Vercel). See [section 8](#8-login--microsoft-entra-id). |
| **Login redirect fails / "redirect URI mismatch"** | The callback URL for this environment isn't registered in Entra. Add `https://<deployment-url>/api/auth/callback/microsoft-entra-id` (or the localhost one for dev). |
| **Build fails after a schema change** | The Prisma client is out of date. Run `npx prisma generate`, and make sure the migration was created/applied (`npx prisma migrate dev` locally, `npx prisma migrate deploy` in production). |
| **Prisma CLI says it can't find the database URL** | The Prisma CLI reads `.env`, not `.env.local`. Set `DATABASE_URL` inline for the command or add a `.env` file — see the gotcha box in [section 7](#7-changing-the-data-model-addingchanging-a-field). |
| **App can't connect to the database / connection errors** | Check `DATABASE_URL` is correct and is the **pooled** Neon string (host has `-pooler`). Confirm the Neon project is still running (free Neon instances can sleep). |
| **A data script does nothing / errors out** | Both scripts read `DATABASE_URL` from `.env.local` — make sure it's set there. `assign-single-site.ts` updating 0 rows is normal if sites are already filled. |
| **Vercel deploy shows "Error"** | Open the deployment in Vercel → read the build logs. Most failures are a missing/renamed env var or a schema/migration mismatch. |

---

## 11. Who to contact / where things live

Fill these in for your team:

- **Original developer / handoff contact:** _________________________ (e.g. name, email)
- **GitHub repository:** `https://github.com/syl8707/hr-system` — code and history.
- **Vercel project:** _________________________ (project name / URL; hosting + prod env vars)
- **Neon (database) account/project:** _________________________ (where `DATABASE_URL` comes from)
- **Microsoft Entra app registration:** _________________________ (tenant + app/client ID; where login is configured)
- **Where secrets are kept:** _________________________ (password manager / vault — for the values Vercel won't show back)

To fully own this project you need access to all five: the **GitHub repo**, the
**Vercel project**, the **Neon database**, and the **Entra app registration**.
