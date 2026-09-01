# Minnekyda Acuherb Center

Clinic platform for Minnekyda Acuherb Center. This first release covers the two workflows that
are still on paper today:

- **iPad patient intake** — the clinic's paper new-patient packet, digitized field-for-field,
  including clinic policies, the acupuncture informed consent, and the arbitration agreement,
  with on-screen signature capture.
- **Practitioner visit notes** — template-driven TCM notes (subjective, objective, tongue/pulse,
  pattern diagnosis, points, herbal formula) that lock on signature and are corrected through
  amendments rather than edits.

Scheduling, payments, and reporting are deliberately out of scope for now.

## Stack

Next.js 14 (App Router, server actions) · TypeScript · Tailwind · Prisma · PostgreSQL ·
iron-session.

## Local development

```bash
cp .env.example .env          # set SESSION_SECRET to 32+ random characters
docker compose up -d          # Postgres on localhost:55433
npm install
npm run db:push
npm run db:seed
npm run dev
```

Seeded logins (development only, password `minnekyda-dev`):

| Email | Role | Sees |
| --- | --- | --- |
| `admin@minnekyda.test` | ADMIN | everything, including the audit log |
| `practitioner@minnekyda.test` | PRACTITIONER | charts, intakes, clinical notes |
| `frontdesk@minnekyda.test` | FRONT_DESK | demographics and intake paperwork only |

## Handling PHI

- Clinical notes are readable only by `ADMIN` and `PRACTITIONER`; front desk staff can register
  patients and start intakes but cannot open notes.
- Every chart view, intake submission, and note write is written to `AuditLog` with user, IP, and
  user agent.
- Signed notes are immutable. `amendNote` creates a linked draft (`amendsId`) so the original
  stays in the chart.
- Intake submissions store the exact schema version they were captured against, so a form
  revision never rewrites history.
- Do not run production with real patient data until the hosting BAA is in place. Railway is for
  a synthetic-data pilot only; Google Cloud (Cloud Run + Cloud SQL) is the production target.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` / `npm start` | production build and serve |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm run db:push` | sync the Prisma schema to the database |
| `npm run db:migrate` | create a migration |
| `npm run db:seed` | staff users, intake form v1, note templates |
