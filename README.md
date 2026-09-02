# Minnekyda Acuherb Center

Clinic platform for Minnekyda Acuherb Center. This first release covers the two workflows that
are still on paper today:

- **iPad patient intake** — the clinic's paper new-patient packet, digitized field-for-field,
  including clinic policies, the acupuncture informed consent, and the arbitration agreement,
  with on-screen signature capture.
- **Practitioner visit notes** — tap-first TCM notes: pain and improvement sliders, chip pickers for
  the ten questions, tongue/pulse, patterns, points and techniques, and plan, with optional free text
  per section. Selections are stored in `ClinicalNote.fieldsJson` and rendered into the note's text
  columns by `composeNoteText` (`src/lib/notes/structure.ts`), so charts and print output are
  unchanged. Notes lock on signature and are corrected through amendments rather than edits.

Scheduling, payments, and reporting are deliberately out of scope for now.

## Stack

Next.js 14 (App Router, server actions) · TypeScript · Tailwind · Prisma · PostgreSQL ·
iron-session.

## Local development

```bash
cp .env.example .env          # set SESSION_SECRET to 32+ random characters
docker compose up -d          # Postgres on localhost:55433
npm install
npx prisma migrate deploy       # committed migrations; production uses the same command
npm run db:seed
npm run dev
```

Seeded logins (development only, password `Minnekyda-dev-1`). Every one of them is created with
`mustChangePassword` set and no second factor, so the first sign-in walks through authenticator
enrolment and a password change before anything else is reachable:

| Email | Role | Sees |
| --- | --- | --- |
| `admin@minnekyda.test` | ADMIN | everything, including the audit log |
| `practitioner@minnekyda.test` | PRACTITIONER | charts, intakes, clinical notes |
| `frontdesk@minnekyda.test` | FRONT_DESK | demographics and intake paperwork only |

Patient portal logins are not seeded: create a patient, add an email, then use the "Patient
portal" card on their chart to issue one.

## Access control

- **Deny by default.** `src/middleware.ts` authenticates every route except the sign-in screens;
  pages narrow further with `requireUser` / `requireRole`. `src/lib/authz.test.ts` fails the build
  if a new page or server action is added without a guard, because hidden navigation is not a
  control.
- **The kiosk iPad has no staff session.** Starting an intake destroys the staff session on that
  device and issues a token scoped to that one submission (45-minute lifetime); the middleware
  refuses every other path for it, so the address bar leads nowhere. Staff sign in again afterwards.
- **Staff MFA is mandatory.** Password entry produces only a pending session with no authority;
  a TOTP code or a single-use recovery code is what mints a real session.
- **Brute force.** Failures are counted per account (5) and per source address (20) over 15
  minutes and recorded in `LoginAttempt` with a reason code. The log is evidence and is never
  pruned by the application.
- Security headers (CSP with per-request nonce, HSTS, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Cache-Control: no-store`) are set in the middleware.

### Patient portal

- A `PATIENT` account is bound to exactly one chart through `User.patientId`, and that column is
  the portal's only source of patient identity: no portal query takes an id from the URL, so a
  patient cannot ask for someone else's record. Another patient's submission id simply 404s.
- `requirePatient` guards the portal; `requireUser` — which every staff page and staff action
  uses — bounces a `PATIENT` session back to `/portal`, and the middleware refuses any path
  outside `/portal` and `/account/password` for it before the request reaches a page.
- Patients see their submitted intake paperwork, their visit dates and who they saw, and can
  correct their own contact and emergency details. **Clinical note content is never shown**; the
  portal queries select no note text at all, and `authz.test.ts` fails the build if a note text
  field is even referenced under `src/app/portal`.
- Staff issue access from the chart ("Patient portal" card): the patient's email becomes the
  username and a one-time password is displayed once, on screen, with `mustChangePassword` set.
  Turning access off deactivates the login and keeps its audit history.
- Patient logins are password-only — staff MFA is mandatory, but requiring an authenticator app
  of every patient would push them back to phoning the front desk. Revisit if the portal ever
  carries note content.

Known gap: patient search passes the query in the URL (`/kiosk?q=…`), so a patient name can reach
an upstream access log. Move search to POST before hosting real PHI.

## Handling PHI

- Clinical notes are readable only by `ADMIN` and `PRACTITIONER`; front desk staff can register
  patients and start intakes but cannot open notes.
- Every chart view, intake submission, and note write is written to `AuditLog` with user, IP, and
  user agent.
- Signed notes are immutable. `amendNote` creates a linked draft (`amendsId`) so the original
  stays in the chart.
- Intake submissions store the exact schema version they were captured against, so a form
  revision never rewrites history.
- Error screens, the audit-write failure path, and the login-attempt failure path log codes and
  messages only — never patient data, note text, or intake answers.
- Do not run production with real patient data until the hosting BAA is in place. Railway is for
  a synthetic-data pilot only; Google Cloud (Cloud Run + Cloud SQL) is the production target.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` / `npm start` | production build and serve |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Vitest unit tests, including the authorization audit |
| `npm run db:push` | sync the Prisma schema to the database (development only) |
| `npm run db:migrate` | create a migration |
| `npm run db:drift` | fail if the committed migrations no longer match `schema.prisma` |
| `npm run db:seed` | staff users, intake form v1, note templates |
