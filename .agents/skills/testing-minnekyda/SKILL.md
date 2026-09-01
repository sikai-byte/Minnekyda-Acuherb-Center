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
- **Draft re-save crashes the client.** Clicking "Save draft" while already on `/notes/[id]`
  triggers `TypeError: Cannot read properties of undefined (reading 'error')` at
  `src/components/NoteEditor.tsx` (`state.error`). Cause: the server action ends in
  `redirect()` back to the same route, so `useFormState` hands back `undefined`. The write
  itself succeeds — reload to confirm persistence. Likely fix is `state?.error`. If you see a
  blank page after saving a note, this (or a similar same-route-redirect + useFormState
  pattern) is probably why; reload before declaring data loss.
- Signing from `/notes/[id]` does NOT crash, because the page switches to the read-only view
  and the editor unmounts.
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
