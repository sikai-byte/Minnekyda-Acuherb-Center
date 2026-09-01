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
npm run db:push && npm run db:seed   # seeds are idempotent upserts
npm run dev                   # http://localhost:3000
```
`.env` needs `SESSION_SECRET` (blueprint's `initialize` generates it) and `DATABASE_URL`
pointing at port 55433.

## Logins (seeded, password `minnekyda-dev`)
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

## Devin Secrets Needed
None — all local, `SESSION_SECRET` is generated locally.
