---
name: testing-minnekyda
description: How to bring up and end-to-end test the Minnekyda Acuherb clinic app (Next.js 14 App Router + Prisma/Postgres + iron-session), including intake wizard, clinical notes, role gating, and audit log.
---

# Testing the Minnekyda clinic app

## Bring-up
```bash
docker compose up -d          # Postgres on localhost:55433 (container: minnekyda-db)
# If compose errors with 'container name "/minnekyda-db" is already in use':
docker start minnekyda-db
npm install                   # if node_modules missing
npx prisma migrate deploy && npm run db:seed   # baseline migration prisma/migrations/0_init
npm run dev                   # http://localhost:3000
```
Use `npx prisma migrate deploy`, **not** `npm run db:push`, on branches that ship
`prisma/migrations/0_init` — `db:push` can leave the schema out of step with the migration
history. Seeds are idempotent upserts.

`.env` needs `SESSION_SECRET` (blueprint's `initialize` generates it) and `DATABASE_URL`
pointing at port 55433.

## Logins (seeded, password `Minnekyda-dev-1`)
Sign-in is three steps now: password → authenticator enrolment (`/login/mfa/setup`, scan or take
the printed secret) → forced password change (`/account/password`). Generate TOTP codes in the
test script with `otpauth` (already a dependency) from the secret shown on the setup page, or from
`User.mfaSecret` in the database. Recovery codes are shown once after enrolment.

Starting an intake signs staff out on that device by design: the kiosk holds a token scoped to one
submission, so after finishing an intake you must sign in again to reach any chart.

- `admin@minnekyda.test` (ADMIN) — only role that can open `/admin/audit`
- `practitioner@minnekyda.test` (PRACTITIONER) — clinical notes
- `frontdesk@minnekyda.test` (FRONT_DESK) — no notes access

No patients are seeded; create them via `/patients/new` with synthetic data only.

## Route map for a full E2E pass
- `/patients/new` → chart at `/patients/[id]` (logs `view_chart`)
- Chart "Start intake" → `/intake/[id]` wizard (16 steps in intake schema v1 — don't hardcode
  a step count in a plan, read it from "Step X of Y")
- `/intake/[id]/view` read-only view; submitted intakes redirect `/intake/[id]` → the view
- `/patients/[id]/notes/new` → `/notes/[id]`
- `/admin/audit` (ADMIN only; other roles redirect to `/`)

## Security / access-control testing (kiosk, MFA, throttling)

**Pre-enrol one account from a script to save recorded-run time.** Every seeded user starts with
`mustChangePassword=true` and no MFA, so each one costs a password → TOTP enrolment → forced
password change cycle. For roles you only need to *view* something with (e.g. admin for
`/admin/audit`), set `mfaSecret`, `mfaEnabledAt=now()` and `mustChangePassword=false` directly in
the DB and keep the base32 secret; spend the recording on the role whose real flow you care about.

**A stale browser session hides direct DB changes.** `requireUser()` reads the session snapshot,
so flipping `mustChangePassword` in Postgres will not take effect until you sign out. Always sign
out and confirm an unauthenticated `/patients` redirects to `/login` before starting a clean run.

**Kiosk containment.** `startIntake` destroys the staff session on that device and sets a
`minnekyda_kiosk` cookie scoped to one submission for 45 min. `kioskAllowsPath` permits **only**
the exact `/intake/<own id>` — everything else (`/`, `/patients`, another chart, `/admin/audit`,
`/notes/<id>`, `/kiosk`, a foreign `/intake/<id>`, and even its own `/intake/<id>/view`) redirects
back to the kiosk route. Good visual proof that staff are really signed out: the header nav
(`Patients` / `Audit log` / `Sign out`) disappears entirely on the kiosk page. After `exitKiosk`
("Done"), re-entering the intake URL *and* pressing browser Back must both land on `/login`.

**Driving server actions directly (to bypass the UI).** Action IDs live in the
`__next_internal_action_entry_do_not_use__` map inside the compiled client chunks; grep the
`.next` build output for the export name. Then `fetch` from the kiosk page's own JS context with
the `Next-Action: <id>` header and a JSON body array of the action's arguments.
- Always run a **positive control** with the same harness (e.g. `saveIntake` on the kiosk's own
  submission should return `{"ok":true}` and persist), otherwise a "refused" result may just be a
  broken request rather than real authorization.
- Async results get lost in the console bridge; stash them on `window.__res` and read that global
  in a second call.
- A malformed request can surface `TypeError: __webpack_modules__[moduleId] is not a function`
  (HTTP 500). That is an inconclusive harness error, **not** proof of an authorization check —
  fall back to asserting on database state (e.g. `select count(*) from "ClinicalNote"`).

**Throttling** is 5 failures per email / 20 per IP over 15 min (`src/lib/loginGuard.ts`). The 6th
attempt swaps the generic `Email or password is incorrect` for the lockout message, and a correct
password while locked still fails. Verify with
`select reason, count(*) from "LoginAttempt" where email='…' group by reason;` (expect
`bad_password=5`, `locked_out>=2`). **Run throttling last** — it locks the account for 15 minutes
and will block any later test that needs to sign in as that user.

**Audit attribution.** After a kiosk submit there is no session, so `submit_intake` is attributed
via `submission.startedById` (shows the staff member who started it) while `exit_kiosk` correctly
shows `—`. Check both in `/admin/audit`.

## Patient portal / patient-boundary testing (PATIENT role)

**Issuing a login.** Staff open the patient chart → "Patient portal" card. The chart email is the
username; the card's create button is `disabled` when the chart has no email, and a staff address
is refused with `That email address already has a login here. Use a different address.` The
one-time password (`Word-word-NN`) is shown **once** — copy it before reloading. Revoke sets
`User.active=false`; re-grant issues a *different* password, re-sets `mustChangePassword` and
clears MFA material, so the previously chosen patient password stops working.

**Patient sign-in is password-only by design** — it must go straight from `/login` to
`/account/password` (no `/login/mfa*`), then land on `/portal` (not `/`).

**Boundary surface.** `patientAllowsPath` allows only `/portal…` and `/account/password`, so every
staff route (`/`, `/patients`, another chart, `/notes/<id>` *including the patient's own note*,
`/admin/audit`, `/kiosk`, `/intake/<id>`, `/intake/<id>/view`) **redirects** to `/portal`, while
`/portal/intake/<someone else's id>` is a **404** (`notFound()` from a session-scoped `findFirst`).
Redirect-vs-404 is the expected difference; record which you get.

**Proving no clinical-note text leaks (the clinic owner's hard requirement).** Seed notes with
unique marker strings in every text column, confirm staff pages render them (positive control),
then from the portal page's own JS context `fetch` `/portal`, `/portal/profile` and the patient's
own `/portal/intake/<id>` and grep each body plus `self.__next_f` and
`document.documentElement.outerHTML` for the markers and for field names like `chiefComplaint` /
`tcmDiagnosis`. Always include a control substring that *is* expected (e.g. the visit date and
`Dr. …`) so a zero-hit result cannot be an empty payload.

**Server-action abuse from a patient session.** Action IDs → names are easiest to read from
`.next/server`: `grep -rho '"[0-9a-f]\{40\}":"[a-zA-Z]*"' .next/server | sort -u`. Notes:
- `useFormState` actions (`updateMyContactDetails`, `createNote`, `updatePatient`) take
  `(prevState, formData)` (plus bound args), so a raw multipart `fetch` usually dies with
  `Connection closed.` A JSON body `[null, {}]` *does* reach the action body — you will see
  `formData.get is not a function`, which is a useful proof that dispatch works.
- POSTing a staff action id from a patient session is refused by **middleware** (302 → the request
  ends at `/portal` with 200 and the portal HTML), so the action-level `requireRole` check is not
  itself exercised that way — say so, and back it with DB state.
- The cleanest hostile test for "id from form data" is to inject extra hidden inputs
  (`patientId`, `id`) into the real portal form via JS and `form.requestSubmit()`; the edit must
  land on the signed-in patient only.

## Gotchas found while testing
- **`useFormState` + same-route `redirect()` returns `undefined` state.** Server actions here
  end in `redirect('/notes/'+id)` — redirecting back to the *same* route makes `useFormState`
  hand back `undefined`, so any `state.error` read crashes with
  `TypeError: Cannot read properties of undefined (reading 'error')` and blanks the page.
  Always read it as `state?.error`. This bit `NoteEditor.tsx` once (fixed in 437bd50); if you
  see a blank page or that TypeError right after a save, suspect this pattern anywhere a
  form's action redirects to its own route. The DB write still succeeds — reload before
  declaring data loss.
- Signing from `/notes/[id]` does NOT hit that path, because the page switches to the
  read-only view and the editor unmounts. So a happy-path "create → sign" test will NOT catch
  a draft→draft re-save regression. Always click "Save draft" **twice on an existing**
  `/notes/[id]` draft when regression-testing the note editor.
- **Forcing the server-side note validation error is not possible via the date field.** The
  visit date input is `required` (`NoteEditor.tsx` ~line 100) and is `type="date"`, so an
  empty or partially-cleared date is blocked by the browser and the action never runs. The
  reliable way to make `updateNote` return `{ error }` and prove the error banner renders:
  open the same draft in two tabs, click "Sign and lock" in tab B, then click "Save draft" in
  the stale tab A — you get the inline red banner
  "Signed notes cannot be edited. Create an amendment instead."
- Clearing a `type="date"` input needs each segment cleared: click it, then
  `Delete`/`Right`/`Delete`/`Right`/`Delete`. To retype, click the field, press `Left` twice
  to reach the month segment, then type `MMDDYYYY`.
- Scrolling a long note form: put the cursor in the page margin (e.g. x≈80), not over a
  textarea, or the scroll goes to the textarea instead of the page.
- Dev-only noise: a React warning "Cannot update a component (`HotReload`) while rendering a
  different component (`NoteEditor`)" appears only after Fast Refresh rebuilds. Hard-reload
  (ctrl+shift+r) before judging console cleanliness.
- Signature canvas: drive it with `mouse_move` → `left_mouse_down` (no coordinate arg) →
  several `mouse_move` → `left_mouse_up`. Passing a coordinate to `left_mouse_down` is
  rejected by the computer tool.
- Intake submit validation returns a single string `Please complete: <items>`; the missing
  consent entry reads `<Section title> — agreement`.
- The dev box clock may be far in the future (e.g. 2026), so ages/dates in the UI look odd.
  Verify relative correctness, not absolute values.
- Typing into a freshly clicked textarea can drop the first character; re-read the field
  value (or the DOM) after typing test data.

## Tap-first (chip/slider) note editor
The visit note editor is structured (`src/lib/notes/structure.ts` + `src/components/NoteEditor.tsx`):
collapsible groups of chip pickers + sliders + one optional "Add detail" textarea per group.
Selections live in `ClinicalNote.fieldsJson.structured`; the server ALWAYS recomposes the 8
text columns from that structure on every save (`composeNoteText`).
- Consequences to test for: **any prose in a text column that has no matching structured/bare
  control risks being silently destroyed on the first save.** Historically `tcmDiagnosis` had
  no bare control and legacy prose in it was blanked; since dc3ab39 a bare `diagnosisOther`
  control ("Add diagnosis detail") exists and `composeNoteText` only returns
  `COMPOSED_TEXT_FIELDS` (fields that actually have a bare control), so an uncovered column is
  omitted from the Prisma update rather than blanked. If a new text column is ever added
  without a bare control, re-run this check. When testing migrations of this
  editor, always seed a DRAFT with distinct strings in *all* text columns (and
  `fieldsJson='{}'`), open it, confirm each string appears in an "Add detail" box AND that the
  "Note preview" renders a section for every column, then check the DB after one "Save draft"
  (and a second one, since the re-save path differs):
  ```bash
  docker exec minnekyda-db psql -U postgres -d minnekyda -tAc \
    "select \"tcmDiagnosis\", \"fieldsJson\"::text from \"ClinicalNote\" where id='<id>';"
  ```
- Sliders default to "not recorded" (readout `—`, grey track, caption "Not recorded — drag the
  slider to set a value."). Since dc3ab39 there is no "Record <label>" button: a single
  press-drag-release on the track records the value. `left_click_drag` sometimes does not
  register on range inputs — prefer an explicit held gesture: `mouse_move` to the thumb,
  `left_mouse_down` (NO coordinate argument — it is rejected), several `mouse_move`s along the
  track, then `left_mouse_up`. The "Not recorded" link clears it back to `—`.
- Do NOT use `ctrl+Home`/`Home` to scroll while a range input has focus: the key goes to the
  slider and silently sets it to its minimum. Scroll with mouse `scroll` actions only.
- The sticky "Save draft / Sign and lock" bar overlays ~90px at the bottom of the viewport, so
  content can be visually covered mid-scroll; since dc3ab39 the form has `pb-24` and open
  groups `pb-20`, so everything can be scrolled clear of it. Still scroll 1-2 extra clicks
  before clicking near the bottom of the viewport.
- Groups open independently (multiple at once) and expanding one smooth-scrolls its header to
  the top of the viewport — after tapping a group header, re-screenshot before computing click
  coordinates, because the page will have jumped.
- Templates are chips; `applyTemplate` only fills controls whose value is `undefined`, so to
  test the merge, set a value that differs from the preset first and confirm it survives.
- "Note preview" (collapsible, near the bottom) shows exactly what will be stored — the
  cheapest way to diff editor state against the signed read-only view.

## Operational hardening testing (admin staff management, idle timeout, posted search, encrypted TOTP)
- `/admin/staff` is ADMIN-only and the `Staff` nav link only renders for ADMIN. Front desk and
  practitioner typing the URL are bounced to `/`. PATIENT portal users never appear in the list
  (`role: { not: 'PATIENT' }`) and `PATIENT` is not an assignable role.
- Staff-management server actions take plain args (`resetStaffPassword(id)`,
  `setStaffActive(id, bool)`, `changeStaffRole(id, role)`), so a raw `fetch` with a `Next-Action`
  header can be used — but in practice these dispatches came back as bare 303s with no readable
  action result, and the *admin* positive control produced no usable payload either. Treat raw
  staff-action dispatch as unreliable in this app: prove authorization through the UI (disabled
  self controls, redirects) and DB state, and mark action-level probes inconclusive if the
  positive control does not return a payload.
- The last-active-admin guard (`lastActiveAdmin` counts *other* active admins) can only be
  triggered from a session whose DB role no longer matches its cookie. Recipe: promote a second
  staff member to Admin, sign them in, demote them from the seeded admin window, then act from
  that now-stale ADMIN session.
- Idle timeout: `IDLE_TTL_MS` (30 min) and `IDLE_REFRESH_MS` (60 s) both live in `src/lib/idle.ts`.
  When lowering the TTL for a test you MUST lower `IDLE_REFRESH_MS` proportionally (e.g. TTL 15 s /
  refresh 1 s); otherwise the cookie is never rewritten inside the shortened window and even an
  actively used session dies, which looks like a bug but is a test artifact.
- Proving "active use is not logged out" is much more reliable with a console fetch loop
  (`for … await fetch('/patients'); await sleep(3000)` recording status+final URL) than with UI
  clicks, because a click that lands during a page load silently does nothing and creates a real
  idle gap. Use the loop as evidence and a short burst of nav clicks for the video.
- To simulate a cookie minted before this PR (no `lastSeenAt`), comment out
  `session.lastSeenAt = Date.now();` in `completeLogin` (`src/lib/actions/auth.ts`) *and* the
  `shouldRefreshIdle` block in `src/middleware.ts`, sign in, idle past the TTL and navigate —
  `idleExpired(undefined, …)` must be false. Back the two files up to /tmp first and restore
  with `cp`, then assert `git diff -- src/lib/idle.ts src/lib/actions/auth.ts src/middleware.ts`
  is empty.
- Posted patient search: `/patients` and `/kiosk` both render `<PatientSearch>`; the term is sent
  via a server action with `preventDefault()`, so the address bar must stay exactly `/patients`
  or `/kiosk` and `/kiosk?q=Name` must be inert. A no-match query renders
  `No patients match “…”.` — use it to prove the term really reached the server.
- TOTP secrets: `User.mfaSecret` is `v1:iv:tag:ciphertext` (AES-256-GCM, key from
  `MFA_ENCRYPTION_KEY` or scrypt of `SESSION_SECRET`). Legacy plaintext base32 secrets still
  verify and are rewritten encrypted on the next successful login, so to test the upgrade write a
  plaintext base32 secret directly into the DB, log in with a code generated from it, then
  re-check `left("mfaSecret",3)`.
- Generate TOTP codes with a helper *inside the repo* (e.g. `totp.ts` + `npx tsx totp.ts <base32>`);
  a script in `/tmp` cannot resolve `otpauth`.

## Scheduling testing (Scheduling v2 and later)

- Clinic time is `America/Chicago` (`src/lib/scheduling/time.ts`) while the dev box runs UTC, so
  every rendered time must be checked against the clinic clock, not the container clock. Times on
  `/schedule` and the booking pickers use clinic-time formatters; other surfaces (patient chart
  appointment list, `/schedule/<id>` history rows, signed-note badges, `/admin/staff` last sign-in)
  render with `formatDateTime` from `src/lib/format.ts`, which now pins `CLINIC_TIME_ZONE` — it
  once did not, and a 3:30 PM visit read as 8:30 PM on the chart. Regression check worth repeating:
  book a time on `/schedule`, then open the same appointment on the chart and compare.
- Seed gives 5 rooms, `first-consultation` 75 min (public, first visit) and
  `acupuncture-treatment` 60 min (returning), `SchedulingPolicy` with 15-min slot step,
  120-min self-booking notice, 24-h self-cancel notice, 48-h self-reschedule notice, 60-day
  horizon, `publicRequestsAutoConfirm = true` and `maxConcurrentPerPractitioner = 1`. The visit
  types carry the practitioner-active phases (30/15 on the consultation, 15/15 on the treatment),
  so one practitioner *can* hold staggered quarter-hour starts: 9:00 and 9:15 treatments together
  is correct, 9:45 against a 9:00 is correctly refused. Only `practitioner@minnekyda.test` has
  `PractitionerAvailability` (Mon–Fri 09:00–17:00, Sat 09:00–13:00), so it is the only bookable
  practitioner and Saturday's last 75-min start is 11:45 AM — a short Saturday slot list is
  correct behaviour, not a truncated picker.
- Availability arithmetic is easy to sanity-check by hand: occupying statuses are
  `REQUESTED/SCHEDULED/CHECKED_IN/COMPLETED`; `CANCELLED`/`NO_SHOW` release the time. A day with
  10:00–12:15 and 13:00–15:15 taken should offer 9:00 then 15:15, 15:30, 15:45, 16:00 only.
- To exercise the portal "taken slot" race without any harness: open `/portal/appointments`, pick
  a time but do not submit, book that same time for another patient from a staff window, then
  submit. Expect exactly `That time is no longer available. Pick another.` Portal booking also
  enforces one upcoming visit at a time, so cancel/complete the patient's other visits first or
  you will hit `You already have a visit booked.` instead of the conflict path.
- Capacity report (`/schedule/capacity`): the `N first visits · M returning` split counts every
  appointment, so it sums to `Booked`, while fill rate and utilisation count occupying visits only.
  It read inconsistently once; check against `select status, "firstVisit" …` before calling it a bug.
- Portal self-reschedule: `/portal/appointments` shows `Reschedule` only outside 48 hours; inside
  it the card says to call the clinic instead. To test both, one appointment ≥3 days out and one
  tomorrow (write the near one straight to the table — booking rules refuse such short notice).
  A move keeps the same appointment row and adds a `RESCHEDULED` event; nothing is deleted.
- Website `/book` confirms as it books (`SCHEDULED`, not `REQUESTED`) while
  `publicRequestsAutoConfirm` is true, and the screen says the visit is booked, not pending. Flip
  the row to `false` and the same screen must say the time is only held — that copy once lied.
  Restore the row afterwards; everything else keys off it.
- Cross-patient authorization probes on the portal are easiest through the form, not the URL: open
  patient A's reschedule picker, select a time, swap the hidden `appointmentId` input to patient B's
  appointment id, submit. Expect `That appointment is not on your record.` and zero new
  `AppointmentEvent` rows on B's appointment.
- Before any marker/PHI grep of the DOM, hard-reload (`ctrl+shift+r`): a soft-navigated page keeps
  the previous session's flight payloads in the document and produces false leak hits.
- Scheduling runs want a genuinely empty day — `npx prisma migrate reset --force --skip-generate`
  rather than re-seeding over a dirty database, or leftover appointments will move the slot lists
  you are asserting exactly.
- **After any `migrate reset`, sign out and sign in again in every open browser window.** The
  iron-session cookie survives the reset and still carries the *old* user id, so pages render
  normally (header still shows the role) but any write that stamps an actor fails with
  `Something went wrong` / HTTP 500 and `Foreign key constraint violated on
  AppointmentEvent_actorId_fkey` (also `AuditLog_userId_fkey` in the dev log). This is a test
  artifact, not a product bug — check `/tmp/dev.log` before reporting it. There is no `/logout`
  route (404); use the header `Sign out` button.
- If a Chrome window stops responding to `ctrl+l`/typing (screenshot never changes, xdotool
  reports it as the active window), the renderer is wedged: close it with
  `wmctrl -i -c <winid>` and continue in another window rather than retrying keystrokes.
- Typing a URL with the `type` action occasionally drops the `:` and Chrome falls back to a Google
  search (which may hit a reCAPTCHA page). Type the full `http://localhost:3000/...` form and send
  `Return` as a separate action, then verify the reported page URL.
- `/schedule/<appointmentId>` is the append-only `AppointmentEvent` history (staff roles only) and
  is the place to assert who/what/when: each row carries actor name, actor role, source
  (`staff`/`portal`/`public`) and the status transition. Row count must only grow.
- Public `/book` never looks a patient up: submitting an existing patient's exact name/DOB/email
  creates a *second* chart with identical wording, which is the non-disclosure property to assert
  (`select count(*) from "Patient" where email=…` = 2).
- Patient sessions must bounce off `/schedule`, `/schedule/capacity` and `/schedule/<own id>` to
  `/portal` (middleware + `portalScope`). Front desk sees no `Start visit note` button and no note
  text anywhere.
- Practitioner hand-off: `Start visit note` links to
  `/patients/<id>/notes/new?appointmentId=<id>`; confirm in the DB that the saved note has the
  chart's `patientId`, the signed-in practitioner's `authorId` and a non-null `appointmentId`.
- Chrome DevTools/CDP (the console and DOM tools) attach to the **first** browser window only, so
  DOM/RSC greps must be run in that window. Plan role sessions accordingly: do marker-leak greps
  in window 1 (sign out and sign in as the patient there) and use the incognito window purely for
  clicking. A soft-navigated login leaves earlier flight payloads in the document — hard-reload
  (`ctrl+shift+r`) before grepping or you get false "leak" hits from the previous session's pages.
- Kiosk containment has no visible exit control mid-wizard; once a window is in kiosk mode it stays
  there, so run kiosk tests last or in a window you no longer need for staff work.
- For an iPad-like viewport use `wmctrl -i -r <win> -b remove,maximized_vert,maximized_horz` then
  `wmctrl -i -r <win> -e 0,40,40,820,1100`; schedule cards, capacity cards, portal booking and
  `/book` all reflow to one/two columns and status taps work at that size.

## Full 16-step kiosk intake submit (and its traps)
- Front desk starts the intake from the chart, then hands over: the wizard URL is
  `/intake/<intakeSubmissionId>` and works under the kiosk token with no staff nav.
- Only step 1 has required fields (`Full name`, `Phone number`, `Birthday`, `Main concern`). The
  wizard lets you **advance past step 1 with a required field empty** and only blocks at the final
  `Submit intake` with `Please complete: Birthday` — so fill step 1 carefully or you will walk all
  16 steps twice. Values already entered are preserved when you walk back, so only the missing
  field needs re-entry.
- The `Birthday` field is a native `<input type="date">`: click it and type `02/23/1974` (with
  slashes). Typing digits only, or typing after a triple-click without clearing, silently leaves it
  blank — verify via the DOM (`<input type="date" text="1974-02-23"/>`) before continuing.
- Steps 3–13 are body-system symptom chips and are all optional: `Save and continue` at roughly the
  same button coordinate advances them, so a batch of clicks with ~3 s waits walks the middle of
  the wizard quickly.
- Steps 14–16 are policies / acupuncture consent / arbitration: each needs the consent checkbox
  ticked and a signature drawn on the canvas (drag inside the dashed box → `Signature captured`).
  Step 16 has an optional initials field (Article 6 retroactive effect).
- After `Submit intake` the branded `Thank you` screen renders the full logo lockup
  (`/brand/minnekyda-logo.svg`) and `IntakeSubmission.status` becomes `SUBMITTED` with
  `submittedAt` set. Typing another route (e.g. `/patients`) from that screen keeps the browser on
  the intake URL; `Done` drops the kiosk token and lands on `/login`.

## Action-level (not route-level) authorization probes
- Recipe: render the privileged form in window 1, sign in as the lower-privileged user in window 2
  (same cookie jar → the session is downgraded), then submit the *already-rendered* form in window 1.
- Expect: no row written (check the relevant table count in psql), and the open form renders
  `Your sign-in no longer allows this. Sign in again, then try it once more.` in place. Check both:
  the inline message is the fix, the DB is the proof.

## Devin Secrets Needed
None — all local, `SESSION_SECRET` is generated locally.
