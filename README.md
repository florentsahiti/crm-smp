# LoniCRM — Team Scheduling

Replaces the Ferien-/Weiterbildungsplan and Vorlage_Einsatzplan spreadsheets
with a shared web app.

**Phases 1–5 done**: login/roles, the year absence calendar, the day-view
shift planner (`/dashboard/schedule` — drag to create duty blocks, live
coverage tallies, lunch-break check), employee self-service
(`/dashboard/my-schedule` for your own week + breaks, `/dashboard/requests`
to submit/approve leave), and in-app notifications + shift swapping
(`/dashboard/notifications`, `/dashboard/swaps`). Loading the *real* 2026
roster/absence data is deliberately deferred until every phase is built —
see [`data/README.md`](data/README.md) for that whenever you're ready.
Forecasting and auto-scheduling are the last phase — its nav link exists
and shows a "coming in Phase N" placeholder.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **Prisma 7** ORM, **SQLite** locally via `@prisma/adapter-better-sqlite3`.
  Moving to Postgres/Neon later only touches `prisma/schema.prisma`
  (`provider`) and `src/lib/prisma.ts` (swap the adapter) — the rest of the
  app is unaffected.
- **Auth**: hand-rolled, following Next.js's own recommended pattern —
  bcrypt-hashed passwords, a signed JWT session cookie (httpOnly, `jose`),
  and a Data Access Layer (`src/lib/dal.ts`) that every protected
  page/action checks independently. `src/proxy.ts` also redirects
  logged-out users away from `/dashboard` as a fast first pass, but it is
  not the only guard — see the Next.js docs' own guidance on this.

## Getting started

```bash
npm install              # also generates the Prisma client
npm run db:local:setup   # first time only: local Postgres (PGlite, in ./.pglite) + tables + demo data
npm run dev              # starts the local database and the app together
```

`npm run dev` needs nothing installed: it runs PostgreSQL in-process (PGlite)
on port 55432, with its data in `./.pglite`. To copy an old local SQLite `dev.db` into a Postgres database
(real roster, absences, call statistics), run
`npx tsx scripts/copy-sqlite-to-postgres.ts` — it empties the Postgres tables first.

Then open http://localhost:3000.

## Test accounts

Seeded by `prisma/seed.ts` — **placeholder people, not the real roster.**
Password for all of them: `password123`.

| Username   | Name     | Role     |
|------------|----------|----------|
| `manager`  | Monika   | Manager  |
| `leadone`  | Thomas   | Manager  |
| `leadtwo`  | Sandra   | Manager  |
| `arlette`  | Arlette  | Employee |
| `estelle`  | Estelle  | Employee |
| `leonie`   | Leonie   | Employee |
| `cristina` | Cristina | Employee |
| `tamara`   | Tamara   | Employee |
| `flavio`   | Flavio   | Employee |
| `samanta`  | Samanta  | Employee |

Replace this list with the real team (and real roles) — see
[`data/README.md`](data/README.md) for exactly how.

## Project layout

```
prisma/schema.prisma       Employee, AbsenceEntry, ShiftBlock, LeaveRequest, Notification, SwapRequest
prisma/seed.ts             placeholder test-account seed script
src/lib/constants.ts       shared vocab (roles, absence types, duty types, skills, swap/notification types)
src/lib/dates.ts           month/weekday helpers for the absence calendar
src/lib/session.ts         cookie session encrypt/decrypt/create/delete
src/lib/dal.ts             verifySession() / requireRole() — the real auth gate
src/lib/actions/auth.ts    login/logout server actions
src/lib/actions/absences.ts  setAbsence() server action (team-lead-gated)
src/lib/actions/shifts.ts  createShiftBlock() / updateShiftBlock() / deleteShiftBlock()
src/lib/actions/requests.ts  submit/cancel/approve/reject leave requests
src/lib/actions/swaps.ts   offer/claim/approve/reject shift swaps
src/lib/actions/notifications.ts  notify() helper + markAllNotificationsRead()
src/lib/actions/autoschedule.ts  suggest / publish / discard an auto-generated day plan
src/lib/forecast.ts        demand forecast, capacity and back-test (pure functions)
src/lib/scheduler.ts       ticket-duty + lunch suggestion logic (pure functions)
src/proxy.ts               optimistic redirect (Next 16's renamed middleware)
src/app/login/             login page
src/app/dashboard/         protected app shell + role-gated pages
  absences/                month-view absence calendar (Phase 2)
  schedule/                day-view shift planner, drag-to-create (Phase 3)
  my-schedule/             personal week view + self-service breaks (Phase 4)
  requests/                submit/approve leave requests (Phase 4)
  swaps/                   offer/claim/approve shift swaps (Phase 5)
  notifications/           in-app notification list (Phase 5)
  forecast/                weekly forecast, capacity, reachability (Phase 6)
data/roster.csv            real employee names, local only (gitignored) — see data/README.md
data/source/                copy of your source Excel (gitignored, real HR data)
scripts/apply-roster.ts    loads data/roster.csv into the Employee table
scripts/import-absences.ts one-time import of the real 2026 absence data
scripts/import-call-stats.ts daily calls/CRM numbers from the Ferien-plan (feeds the forecast)
```

## Notes on the stack version

This was scaffolded against Next.js 16 and Prisma 7, both fairly recent
major versions with real breaking changes from older tutorials/training
data you might see elsewhere (e.g. Next renamed `middleware.ts` to
`proxy.ts`; Prisma's client now requires an explicit driver adapter rather
than reading the datasource URL implicitly). If you see a code example
online that doesn't match what's in this repo, trust the local
`node_modules/next/dist/docs/` and `node_modules/@prisma/config` over
outside sources — that's what this codebase was built against.
