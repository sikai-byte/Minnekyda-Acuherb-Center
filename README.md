# Minnekyda Acuherb Center

Clinic platform for a single-site Traditional Chinese Medicine practice. It replaces the paper
new-patient packet in the filing cabinet, the typed visit note and Acuity's booking, and it is on
its way to reporting on the clinic's Stripe payments.

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
| Scheduling: capacity domain, staff schedule, portal booking, public website booking | **Built** | `src/app/schedule`, `src/app/book`, `src/lib/scheduling`, `src/lib/actions/appointments.ts` |
| Operational telemetry and the operations report | **Built** | `src/lib/telemetry.ts`, `src/lib/metrics`, `src/app/admin/metrics` |
| Payments and Stripe reconciliation | **Not built** | — |
| Reporting (visits, weekly capacity) | **Built** | `src/app/admin/metrics`, `src/app/schedule/capacity`, `src/lib/scheduling/capacity.ts` |
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
- **The calendar carries no health information.** No appointment column, booking form or
  confirmation screen holds a symptom, a reason for the visit or a comment — the health history is
  taken privately on the iPad at the visit. `src/lib/scheduling/privacy.test.ts` fails the build if
  a clinical column or a free-text box appears in the booking path.

## What the operations report measures, and what it only estimates

Admin-only, at `/admin/metrics`. Every clinical action writes a `ClinicEvent` row — event type,
timestamps, and ids, never an answer or a word of a note, asserted by
`src/lib/metrics/privacy.test.ts`. Timings therefore start the day the feature shipped and cannot
be backfilled, which is why the capture landed before the dashboard.

Measured: intake time on the iPad, time to write a note, visit → signed note, practitioner and
room utilisation, no-show rate, share of visits patients booked themselves.

Estimated, and labelled as such wherever shown: transcription time avoided and front-desk time
returned. Both multiply a count by the clinic's own stated minutes for the paper process — 10
minutes preparing a form plus 50 re-typing it, and 15 minutes per visit at the desk for check-in,
rebooking and payment. The figures live in `src/lib/metrics/baselines.ts`; change them there and
every report follows.

## Clinic rules the software encodes

- Five treatment rooms.
- Standard treatment 60 minutes; first consultation + treatment 75 minutes.
- Appointments are staggered 15 minutes apart (so up to five concurrent treatments with offset
  starts — not five patients per hour).

Rooms and visit types are seeded rows, not constants, so adding a sixth room or a new visit length
is a seed edit. Working hours belong to a practitioner (`PractitionerAvailability`), seeded as
Mon–Fri 9–5 and Sat 9–1. Instants are stored in UTC and every calendar question is asked in the
clinic's own timezone — see [Scheduling](#scheduling-and-public-booking).

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
- **`AppointmentType`** — a bookable visit type and the *only* place a duration comes from:
  `minutes`, `publiclyBookable`, and `firstVisit` (the only kind a stranger may book on the
  website). No client ever submits a length.
- **`TreatmentRoom`** — a treatment table. The count of active rooms is the ceiling on
  concurrent visits.
- **`PractitionerAvailability`** / **`ClinicClosure`** — a practitioner's weekly working minutes,
  and closures (clinic-wide when `practitionerId` is null, otherwise one practitioner's time off).
- **`SchedulingPolicy`** — the single configurable row: start increment, booking horizon, minimum
  notice, and the practitioner concurrency policy.
- **`Appointment`** — patient, practitioner, appointment type, room, start, end, status
  (`REQUESTED` → `SCHEDULED` → `CHECKED_IN` → `COMPLETED`, or `CANCELLED` / `NO_SHOW`), `source`
  (`STAFF` / `PORTAL` / `PUBLIC`) and the lifecycle timestamps. Scheduling logistics only, by
  design. Indexed on `startsAt` and on `startsAt` per practitioner, patient, room and status.
- **`AppointmentEvent`** — append-only scheduling history: what type of change, by which actor in
  which role through which door, and the before/after status, start, room and practitioner. Typed
  columns, never a free-text field, so history cannot become a second clinical record.
- **`BookingAttempt`** — source addresses of public booking submissions, for throttling. Holds no
  identity.
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
| Calendar, book / reschedule / cancel / check-in | yes | yes | yes | own booking only |
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

### Scheduling and public booking

**One availability service.** `getAvailableSlots({ practitionerId, appointmentTypeId, date })` in
`src/lib/scheduling/availability.ts` is the sole source of truth for what can be booked, and staff
booking, the portal, the public site and any future API all go through it. Nothing in a client
component computes availability: a browser that could decide what is free could also decide to
double-book a room. `src/lib/scheduling/slots.ts` under it is pure and takes no database — which
is how the expected start times can be asserted exactly in tests.

**Duration is server-side.** It is read from `AppointmentType`, so a tampered form cannot book a
15-minute treatment or a six-hour one.

**Timezone.** Instants are stored in UTC; every question about a day, a start time or a working
window is asked in `America/Chicago` (`CLINIC_TIME_ZONE`) through `src/lib/scheduling/time.ts`. A
clinic day ends at the next local midnight rather than 24 hours later, the spring-forward hour is
rejected as a start time because it does not exist, and the repeated fall-back hour resolves to
its first occurrence.

**Room occupancy and practitioner capacity are separate.** A slot needs a free room *and* a
practitioner within their concurrency policy. That policy is configurable
(`SchedulingPolicy.maxConcurrentPerPractitioner`, plus an optional practitioner-active window) and
ships deliberately conservative at one visit at a time, because which phases of a 60-minute
treatment actually need the practitioner in the room has not been defined yet — see
[Follow-ups for the clinic](#follow-ups-for-the-clinic). Raising it is a row edit, not a code
change.

**Writes re-check and lock.** Every write in `src/lib/scheduling/booking.ts` re-runs the same
rules inside its transaction under a per-clinic-day advisory lock, because a browser is always
looking at a stale list — two people clicking the same 3pm is normal, and only one may get it. A
reschedule holds both the old and the new day, in date order so opposing moves cannot deadlock,
and updates the row in place only once the new time is secured: a failed move leaves the patient
with the appointment they had. Cancelling and no-showing release the time immediately;
completed visits keep it, because they happened.

**History is append-only.** Booking, confirming, moving, changing room or practitioner, checking
in, completing, cancelling and no-showing each write an `AppointmentEvent` in the same transaction
as the change, so an admin can reconstruct who did what and when at `/schedule/<id>` — staff only,
even for a patient's own visit.

- **Staff** (`/schedule`, and Book on a chart) see the day whole-clinic or by practitioner and
  drive the status in one tap: confirm a website request, check in, complete, cancel, no-show,
  change room, open the chart, or start the visit note with the patient, practitioner, date and
  appointment already attached. Cancelling frees the room; the row stays, because attendance is
  what reporting has to explain. `/schedule/capacity` is the weekly capacity report — booked,
  completed, cancelled, no-shows, first vs returning visits, fill rate, attendance rates,
  practitioner and room utilisation, and where the week is still open.
- **Patients** (`/portal/appointments`) book for themselves with two hours' notice, one future
  visit at a time, and cancel outside 24 hours. The patient id comes from the session, so no id in
  a request can point at anyone else.
- **The public** (`/book`) is the front door for a first-time consultation, and it is the only
  unauthenticated write in the product. It reads no chart — never looking anyone up by name, email
  or date of birth — so it cannot be asked a question whose answer reveals whether somebody is a
  patient here; a returning visitor simply produces a second chart for the front desk to merge. It
  takes identity and contact details only, throttles by source address (5/hour, 20/day), offers
  only first-visit services, and lands as a `REQUESTED` appointment that holds the room until the
  front desk confirms it. The confirmation screen shows a six-character reference, not a row id.

No confirmation email or SMS is sent yet: that needs a BAA'd provider, and even then would carry
the time and the clinic's name only.

**Known limitations.**

- The practitioner concurrency policy is conservative, so the schedule currently offers less than
  the clinic's staggered model can really absorb.
- A practitioner change is available through a reschedule, not as a standalone action.
- The public door creates a second chart for a returning visitor to merge, deliberately: looking
  anyone up by name or date of birth would answer "is this person a patient here" to a stranger.
- Availability is computed per request with no cache; fine at this size, and the query shapes and
  indexes are built for a five-figure appointment history.
- Reporting counts scheduled minutes, not the clock: a visit that overran is still 60 minutes.

**Follow-ups for the clinic.**

1. Which phases of a 60- and 75-minute treatment need the practitioner present? That answer sets
   `maxConcurrentPerPractitioner` and the practitioner-active window, and is the difference
   between today's conservative schedule and the real staggered model.
2. Should a website request auto-confirm, or keep holding the room until the front desk confirms
   it? It holds today.
3. Cancellation window and minimum notice for patients (24 hours and 2 hours today), and whether
   a patient may hold more than one future visit (one today).
4. Whether patients should be able to reschedule themselves, rather than cancel and rebook.

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
| `npm run test:db` | scheduling integration suite against a real Postgres (concurrency, locking, RBAC) |
| `npm run db:migrate` | create a migration |
| `npm run db:drift` | fail if committed migrations no longer match `schema.prisma` |
| `npm run db:seed` | staff users, intake form v1, note templates, rooms, services, working hours |
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
8. Decide who sends booking confirmations (a BAA'd email provider, or the phone), and confirm the
   scheduling follow-ups above with clinic staff before the first real booking.

## Build history

Stacked branches, each reviewed as its own PR: intake + notes MVP (#1) → security hardening (#2) →
patient portal (#3) → operational hardening: staff management, idle timeout, posted search,
encrypted TOTP secrets (#4) → the scope README (#5) → scheduling: staff calendar, portal booking,
public website booking (#6) → telemetry and the operations report (#7) → the scheduling capacity
domain: clinic timezone, appointment types, capacity policy, appointment history, weekly capacity
report (#8). Payments are next.
