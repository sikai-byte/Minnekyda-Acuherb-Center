# Minnekyda Acuherb Center

Clinic platform for a single-site Traditional Chinese Medicine practice. It replaces the paper
new-patient packet in the filing cabinet and the typed visit note, and it is on its way to
replacing Acuity for scheduling and to reporting on the clinic's Stripe payments.

Everything in here is treated as PHI. Nothing is deployed, and no real patient data may be
entered anywhere hosted until the hosting BAA is signed (see [Before real patients](#before-real-patients)).

## Scope at a glance

| Area | State | Where |
| --- | --- | --- |
| iPad patient intake (paper packet, field-for-field, signatures) | **Built** | `src/app/kiosk`, `src/app/intake`, `src/lib/intake` |
| Practitioner visit notes (tap-first TCM note, sign + amend) | **Built** | `src/app/notes`, `src/components/NoteEditor.tsx`, `src/lib/notes` |
| Patient charts and demographics | **Built** | `src/app/patients` |
| Staff accounts, roles, MFA, audit log | **Built** | `src/app/admin`, `src/lib/actions/staff.ts`, `src/lib/audit.ts` |
| Patient portal (own paperwork and visit dates only) | **Built** | `src/app/portal`, `src/lib/portalScope.ts` |
| Scheduling / booking (replaces Acuity) | **Not built** | — |
| Payments and Stripe reconciliation | **Not built** | — |
| Reporting (visits, weekly occupancy) | **Not built** | — |
| Insurance billing | **Out of scope** for now, planned later | — |
| Scanning historical paper charts | **Out of scope** for now, planned later | — |
| Deployment / hosting | **Not done** — runs locally only | — |

Deliberate product decisions, so nobody re-litigates them by accident:

- **Patients never see clinical notes.** Not a toggle, not a permission — the portal's queries
  select no note text and a test fails the build if portal code so much as references a note text
  column. There is no note-release feature and none is planned.
- **No clinical detail ever reaches Stripe or any email/SMS provider.** Charges read like
  "Office visit — 60 min". Stripe will not sign a BAA, so this is a hard design rule.
- **Hidden navigation is not access control.** Every route and every server action is guarded
  server-side, and `src/lib/authz.test.ts` fails the build when a new one appears unguarded.

## Clinic rules the software encodes

- Five treatment rooms.
- Standard treatment 60 minutes; first consultation + treatment 75 minutes.
- Appointments are staggered 15 minutes apart (so up to five concurrent treatments with offset
  starts — not five patients per hour).

These are recorded here because they drive the scheduling engine and the occupancy report; the
scheduling module that consumes them does not exist yet.

## Stack

Next.js 14 (App Router, server actions — there is no separate API service) · TypeScript ·
Tailwind · Prisma · PostgreSQL · iron-session cookies · Vitest · Docker Compose for local
Postgres. Production target is Google Cloud (Cloud Run + Cloud SQL + KMS), which offers a
click-accept BAA.

## Data model

`prisma/schema.prisma` is the source of truth. The shape of it:

- **`User`** — one row per login, for staff *and* patients. `role` is `ADMIN` / `PRACTITIONER` /
  `FRONT_DESK` / `PATIENT`. A `PATIENT` row carries `patientId`, the unique link to the one chart
  it may ever read. Holds the TOTP secret (encrypted), recovery-code hashes, and
  `mustChangePassword`.
- **`Patient`** — the chart: demographics, contact, emergency contact, `archivedAt`.
- **`IntakeForm`** — a *versioned* questionnaire (`slug` + `version`). Editing a live form creates
  a new version so old submissions always render against what was actually signed.
- **`IntakeSubmission`** — one patient's answers plus signature images, bound to a form version.
  `startedById` is the staff member who handed over the iPad, which is how a patient-typed
  submission gets attributed in the audit log.
- **`NoteTemplate`** — pre-loaded note skeletons (`fieldsJson`).
- **`ClinicalNote`** — the visit note. Tap-first selections live in `fieldsJson` and are composed
  into the text columns; signing sets `signedAt` and freezes the row. Corrections are a new row
  pointing back through `amendsId`, never an edit.
- **`AuditLog`** — every chart view, intake submission, and note write, with user, IP, and user
  agent. Append-only; the app never prunes it.
- **`LoginAttempt`** — every authentication attempt, used for throttling and as login-monitoring
  evidence.

Migrations are committed under `prisma/migrations` and production runs `prisma migrate deploy`.
`npm run db:drift` fails if the schema and migrations disagree.

## Who can see what

| | ADMIN | PRACTITIONER | FRONT_DESK | PATIENT |
| --- | --- | --- | --- | --- |
| Patient list, demographics, chart header | yes | yes | yes | own chart only |
| Intake paperwork | yes | yes | yes | own, read-only |
| Clinical note content | yes | yes | **no** | **never** |
| Start a kiosk intake | yes | yes | yes | no |
| Staff accounts (`/admin/staff`) | yes | no | no | no |
| Audit log (`/admin/audit`) | yes | no | no | no |

## Security model

- **Deny by default.** `src/middleware.ts` authenticates every route except the sign-in screens;
  pages narrow further with `requireUser` / `requireRole`.
- **The kiosk iPad holds no staff session.** Starting an intake destroys the staff session on that
  device and issues a token scoped to that one submission (45-minute life). Every other path is
  refused for that token, so the address bar leads nowhere. Staff sign in again afterwards.
- **Staff MFA is mandatory.** A password produces only a pending session with no authority; a TOTP
  code or a single-use recovery code is what mints a real session. Patient logins are
  password-only — requiring an authenticator app of every patient would push them back to phoning
  the front desk. Revisit if the portal ever carries anything clinical.
- **Brute force.** Failures are counted per account (5) and per source address (20) over 15
  minutes, with a reason code in `LoginAttempt`.
- **Sessions die twice over.** 8-hour absolute lifetime, plus the middleware ends a session after
  30 minutes without a request and sends the browser to `/login?reason=idle`, because the front
  desk machine is a shared surface.
- **Patient names never travel in a URL.** Search posts the term to the `searchPatients` server
  action and renders results in place, so no name reaches an upstream access log. A test fails the
  build if a page starts reading a `q` query parameter again.
- **TOTP secrets are encrypted at rest** (AES-256-GCM, `src/lib/secretBox.ts`), so a database dump
  is not a working second factor. The data key comes from `MFA_ENCRYPTION_KEY`; in production that
  is a key decrypted from Cloud KMS at boot. The stored format is versioned for rotation.
- **PHI stays out of logs.** Error screens, the audit-write failure path, and the login-attempt
  failure path record codes and messages only — never patient data, note text, or intake answers.
- Security headers (CSP with a per-request nonce, HSTS, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Cache-Control: no-store`) are set in the middleware.

### Staff accounts

`/admin/staff` (ADMIN only) manages staff without touching the database: add an account with a
one-time password, reset a password, reset an authenticator after a lost phone, change a role,
deactivate a leaver. Deactivation keeps the account, its notes, and its audit history. An admin
cannot deactivate or demote themselves, and the last active admin cannot be removed. Patient
portal accounts are not listed here.

### Patient portal

A `PATIENT` account is bound to exactly one chart through `User.patientId`, and that column is the
portal's only source of patient identity — no portal query takes an id from the request, so
another patient's submission id simply 404s. Patients see their submitted paperwork, their visit
dates and who they saw, and can correct their own contact and emergency details. Staff issue
access from the "Patient portal" card on the chart; the one-time password is shown once on screen.

## Local development

```bash
cp .env.example .env          # SESSION_SECRET needs 32+ random characters
docker compose up -d          # Postgres on localhost:55433 (docker start minnekyda-db if it exists)
npm install
npx prisma migrate deploy     # same command production runs
npm run db:seed
npm run dev
```

Seeded logins (development only, password `Minnekyda-dev-1`): `admin@minnekyda.test`,
`practitioner@minnekyda.test`, `frontdesk@minnekyda.test`. All three are created with
`mustChangePassword` and no second factor, so the first sign-in walks through authenticator
enrolment and a password change before anything else is reachable. Patient portal logins are not
seeded — create a patient, give them an email, then issue one from their chart.

Use synthetic data only. `.agents/skills/testing-minnekyda/SKILL.md` documents how to bring the
app up and exercise it end to end.

| Script | Purpose |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` / `npm start` | production build and serve |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Vitest, including the authorization audit |
| `npm run db:migrate` | create a migration |
| `npm run db:drift` | fail if committed migrations no longer match `schema.prisma` |
| `npm run db:seed` | staff users, intake form v1, note templates |
| `npm run db:push` | sync schema without a migration (development only) |

## Before real patients

Launch gates, not nice-to-haves:

1. Accept the Google Cloud BAA and deploy only BAA-covered services (Cloud Run, Cloud SQL, Cloud
   Storage, KMS, Logging).
2. Serve `MFA_ENCRYPTION_KEY` and `SESSION_SECRET` from Secret Manager / KMS, not env files.
3. Tested database backup *and restore*, not just backups.
4. Upgrade Next.js 14 → 16 (the only fix for 8 high advisories in the 14.2 tree) and re-run the
   full regression pass.
5. Counsel review of the consent, arbitration, privacy, and retention wording transcribed from the
   paper packet.
6. Access review, PHI-in-logs re-audit, and an independent penetration test.
7. Load / soak / cold-start testing against Cloud Run + Cloud SQL connection limits.

## Build history

Stacked branches, each reviewed as its own PR: intake + notes MVP (#1) → security hardening (#2) →
patient portal (#3) → operational hardening: staff management, idle timeout, posted search,
encrypted TOTP secrets (#4). Scheduling is next.
