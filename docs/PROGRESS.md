# Progress

Living status log for the phased roadmap in [`brief.md`](brief.md). Updated
at the end of each phase (or meaningful chunk of work) so context survives
across sessions. Newest entry at the top of each phase's notes.

## Client requests round 2 (20.10.2026) ✅

All 11 tasks from [`CLIENT-REQUESTS-2.md`](CLIENT-REQUESTS-2.md), one commit each, each tested in Chrome
as manager and employee:

1. **"Sonstiges…" with free text** — managers type their own label (max 40), stored in the block's
   `note`; shown in the plan, week view and Mein Plan; "Sonstiges" entry in "Alle Tätigkeiten".
2. **Holidays Basel-Stadt** — same nine dates as BL, official BS names (Neujahrstag, Nationalfeiertag,
   Weihnachtstag), source bs.ch in `src/lib/holidays.ts`.
3. **HO / BO pills** next to each name. HO = new `HomeOfficeDay` table; BO = the existing whole-day
   `backoffice` block, so phone capacity stays right. Action `setWorkMode` in `shifts.ts`.
4. **Employee sets own HO / BO** in Mein Plan (and on their own Einsatzplan row), today or later only;
   past dates and other people are refused on the server.
5. **Cancel a wrong absence** — red box in the name popup ("Nur diesen Tag" / "Ganzer Zeitraum", asks
   once more). Blocks removed by the absence are kept in `AbsenceEntry.clearedBlocks` and put back.
6. **Absences filter Tag / Woche / Monat** — `?view=day|week|month&d=YYYY-MM-DD` + date field
   (`absences/period.ts`); old `?y=&m=` links still work.
7. **"Abgelehnte Ferien" table** under the absences grid. There is no leave-request flow any more, so
   managers record a refusal (person, dates, reason); stored as a rejected `LeaveRequest`. Employees
   see only their own; filtered by the period from task 6.
8. **"Zeitverlauf (heute)" removed** from the forecast card.
9. **First names only** — `src/lib/names.ts` (`withDisplayNames`, "Anna M." when first names clash),
   applied where names are loaded; no last names in any page or page payload. Revert in one place.
10. **Coffee cup** on every break block (day plan, legend, Mein Plan); the week view keeps colour only.
11. **Break swaps removed** — nav item, page (now redirects to Mein Plan) and `actions/swaps.ts`;
    the `SwapRequest` table and its data are kept.

Migrations: `20261019120000_home_office_day`, `20261020090000_absence_cleared_blocks`.

## Client requests (13.10.2026) ✅

All 12 tasks from [`CLIENT-REQUESTS-PLAN.md`](CLIENT-REQUESTS-PLAN.md), one commit each:

1. **Language colours** — `SKILL_COLORS` + shared `LanguageBadges` (Einsatzplan, Team, coverage).
2. **Birthday** — `Employee.birthDay/birthMonth` (day + month only), set on the Team page, 31.02 rejected.
3. **Holidays Basel-Landschaft** — built-in list with Easter maths (`src/lib/holidays.ts`, check with
   `npx tsx scripts/check-holidays.ts 2027`). Holiday = blocked in the plan (also server-side), capacity
   and forecast 0, "FT" on the Absences and Forecast pages.
4. **Ereignisse** — new `Event` model; panel with manual events, birthdays, holidays and fixed
   appointments for the day + 7 days ahead; managers add/edit/delete, 🎂 in the timeline.
5. **Absence for a date range** — "Nur heute" / "Zeitraum" in the name popup (`reportAbsenceRange`),
   weekends and holidays skipped, optional half first/last day.
6. **Backoffice** — whole-day `backoffice` duty type (works, no calls): own colour, own count in coverage,
   left out of phone capacity (`onPhone` in `staffing.ts`).
7. **BILA** — "Manuelle Änderung ▾" menu (BILA, Fixtermin, Abwesenheit, Backoffice); BILA books the
   employee + the manager, refused on absence, appointment or break; "BILA planen" in the name popup.
8. **Click a time** — every quarter hour in the ruler shows "n aktiv von m" (+ breaks, appointments …).
9. **Week view + activity filter** — `?view=week`, Mo–Fr mini timelines with staffing/forecast rows;
   "Alle Tätigkeiten ▾" (`?a=`) dims everything else in both views.
10. **Forecast per weekday** — week editor (calls + CRM) and Wochenmuster (`ForecastWeekdayDefault`,
    `ForecastDay.crmTotal`); order manual → Wochenmuster → automatic, in one place (`src/lib/day-forecasts.ts`).
11. **Staffing on the Absences page** — Forecast / Anwesend VM-NM / Kapazität / Differenz per day.
12. **Redesign** — Einsatzplan laid out like `design-v2-target.webp`: one-line header with date picker,
    restyled timeline (initials, Telefonie band for unassigned time, legend), cards "Forecast &
    Tagesleistung" (Heute/Woche/Monat), "Abdeckung & verfügbare Mitarbeitende", "Ereignisse &
    Mitteilungen"; the per-hour table is under "Details anzeigen". `TaskCount.crmDone` added for CRM done.

Notes: the Ereignisse tabs are Alle / Ereignisse / Geburtstage / Feiertage / Termine / Mitteilungen
(no "Ferien" tab — leave requests are not part of the app any more). The forecast tiles show
Forecast / Erledigt / Rest as rows, because the cards are narrower than in the design.

## Roadmap status

| # | Phase | Status |
|---|---|---|
| 1 | Foundation | ✅ Done |
| 2 | Year absence calendar + 2026 data import | ✅ Built (real data load deliberately deferred — see note) |
| 3 | Weekly intraday shift planner | ✅ Done |
| 4 | Employee self-service (my-schedule, leave requests, breaks) | ✅ Done |
| 5 | Notifications + shift-swap exchange | ✅ Done |
| 6 | Forecasting + auto-scheduling | ✅ Built (v1, with defaults — see notes) |
| 7 | Deployment (Vercel + Neon) | ⬜ Not started |

---

## Phase 1 — Foundation ✅

**Done.** Next.js 16 + Prisma 7 app scaffolded, running locally on SQLite.

What's in place:
- Data model: `Employee`, `AbsenceEntry`, `ShiftBlock`, `LeaveRequest` — [`prisma/schema.prisma`](../prisma/schema.prisma)
- Auth: bcrypt-hashed passwords, signed JWT session cookie, DAL-based
  server-side gating (`src/lib/dal.ts`) backed up by an optimistic redirect
  in `src/proxy.ts` — not a third-party auth library, to avoid dependency
  risk on a very new Next.js version
- Three roles (employee / team lead / manager), each with a role-aware nav
  and real server-side route gating — verified for all three roles,
  including that a blocked page redirects away even via direct URL, not
  just a hidden nav link
- A live "Team" page reading real data from the database (proof the DB →
  Prisma → page path works end to end)
- Placeholder stub pages for every later phase (Absences, Shift Planner,
  My Schedule, Requests, Reports) so the full nav structure already exists
- Seed script with 10 placeholder test accounts (see [`README.md`](../README.md) for logins)
- Verified: clean `npm run build`, clean `tsc --noEmit`, clean `eslint`,
  manual click-through of login/logout/role-gating in the browser

Notable decisions/deviations made while building:
- **SQLite now, Postgres later** — no local Postgres/Docker available, so
  Phase 1 runs on SQLite via `@prisma/adapter-better-sqlite3`. Schema
  avoids Postgres-only features (no Prisma `enum`, uses validated `String`
  fields instead) so the Phase 7 switch is just the datasource provider +
  swapping the adapter in `src/lib/prisma.ts`.
- **Next.js 16 / Prisma 7** are both recent major versions with real
  breaking changes from older tutorials (middleware renamed to `proxy`,
  Prisma client now needs an explicit driver adapter). Built against the
  actual bundled docs in `node_modules`, not assumed prior knowledge.

Not done yet (deliberately out of scope for Phase 1):
- No real employee roster — the seeded accounts are placeholders
- No absence entry, no shift planner, no self-service — those are Phases 2–4

---

## Phase 2 — Year absence calendar + data import ✅

**Built and verified end-to-end.** Per your call, loading the *real* 2026
data is deliberately deferred until all phases are built — every phase
from here on is built and tested against the Phase 1 placeholder accounts.
Nothing about later phases depends on the real data being loaded now.
When you're ready (any time — no rush), the roster/import steps below are
waiting.

What's in place:
- Month-view absence calendar at `/dashboard/absences` — team leads edit
  (click any AM/PM cell to set/clear vacation, sick, training, holiday,
  accident, military, or reduced-workload); managers get the same view
  read-only. Every mutation goes through `setAbsence()` in
  [`src/lib/actions/absences.ts`](../src/lib/actions/absences.ts), which
  re-checks the team-lead role itself (not just the page) — same
  defense-in-depth pattern as Phase 1.
- Added a `@@unique([employeeId, date, halfDay])` DB constraint on
  `AbsenceEntry` so a given half-day can only ever hold one value —
  migration `20260904135500_absence_unique_employee_date_halfday`.
- `data/roster.csv` (local only, gitignored — real HR data) — pre-filled with the **29 real
  employee names** extracted directly from your two source files (plus
  group numbers and short codes for the 21 who appear in the Einsatzplan
  template). See [`data/README.md`](../data/README.md) for exactly what to
  do with it — short version: **fill in the `role` column**, that's the
  one thing I can't infer from the spreadsheets.
- `scripts/apply-roster.ts` — validates and loads the CSV into the
  `Employee` table. Safe to re-run.
- `scripts/import-absences.ts` — one-time import of the real 2026 absence
  data from `data/source/Ferien- und Weiterbildungsplan 2026.xlsx` (a copy
  of your file, gitignored since it's real HR data). Matches employees by
  exact name, maps the sheet's codes to our absence types, and skips `T`
  (Ticketdienst) on purpose since that's a duty assignment, not an
  absence — it belongs to Phase 3.

How this was verified (dry-run against a temporary all-"employee" test
roster, then reverted — the real roster/DB were left untouched):
- Parsed all 53 week sheets; found and fixed a real bug where the header
  row's merged day-label cells (e.g. "Mo." spanning the AM+PM columns)
  read back duplicated across *both* columns via the Excel-parsing
  library, which silently doubled the day count per week. Cross-checked
  the fix against the original spreadsheet by hand (one employee's
  Jan 7–9 vacation) and it now lines up exactly.
- Clicked through the UI logged in as team lead: edited a cell, reloaded,
  confirmed it persisted; cleared it, reloaded, confirmed that persisted
  too. Logged in as manager: confirmed the same page is read-only.
- One loose end: the source file has an unrecognized code **"KOM"** in two
  cells — not in the legend I found, so the import skips those two rather
  than guessing. Flagged in `data/README.md`; tell me what it means and
  I'll map it.

Whenever you're ready to load the real data (no rush — not blocking anything else):
- Open `data/roster.csv` and fill in `role` for all 29 people (`employee`
  / `team_lead` / `manager`) — see `data/README.md` for the full
  instructions. Everything else in that file is optional.
- Then: `npx tsx scripts/apply-roster.ts` followed by
  `npx tsx scripts/import-absences.ts --dry-run` (preview) and
  `npx tsx scripts/import-absences.ts` (for real).

---

## Phase 3 — Weekly intraday shift planner ✅

**Done.** Day-view shift planner at `/dashboard/schedule` (team lead only —
matches the brief; managers get coverage reporting instead, not this
editing view).

What's in place:
- **Drag-to-create duty blocks**: click-drag across an employee's row on an
  08:00–17:00 timeline (15-minute snap) to open a duty-type picker
  (ticket duty, meeting, coaching, case review, tech issue, break,
  training-lock, other). Click an existing block to change its type/
  location or remove it. All in
  [`src/app/dashboard/schedule/timeline.tsx`](../src/app/dashboard/schedule/timeline.tsx),
  no drag-and-drop library — plain pointer events.
- **Absences block those slots automatically**: a team lead can't drag a
  duty block over a half-day that's already marked absent in Phase 2's
  calendar — rejected both visually (grey overlay) and server-side
  (`assertNotAbsent` in
  [`src/lib/actions/shifts.ts`](../src/lib/actions/shifts.ts)).
- **Live coverage tallies** at 15-minute resolution — total "free"
  headcount plus a per-language-skill breakdown (French/English/Italian),
  computed the same way the original spreadsheet's `COUNTIF` did: free =
  not absent *and* not already in any duty block for that slot (so a break
  or a meeting reduces headcount too, matching the source data's own
  definition of "Anwesend").
- **Lunch-break spread check** ported over from the original `IF(MAX-MIN>2, ...)`
  formula, shown as an OK/uneven badge above the coverage table.
- Day navigation (prev/next), defaulting to the nearest weekday.

How this was verified (against the placeholder Phase 1 accounts, cleaned
up afterward — no lingering test data):
- Dragged a block, confirmed it persisted in the database with the exact
  snapped start/end time, and confirmed it renders back correctly on
  reload.
- **Found and fixed a real bug** during this: the schedule page's default
  "today" wasn't normalized to UTC midnight before being used in a Prisma
  date-equality query, so anything relying on the default date (no `?d=`
  in the URL) would silently match nothing. Added `todayUTC()` to
  [`src/lib/dates.ts`](../src/lib/dates.ts) as the one correct way to get
  "today" for date-column queries, and fixed the schedule page to use it.
  (Phase 2's absence calendar wasn't affected — it only uses `new Date()`
  to read the year/month numbers, not for an exact-match query.)
- Clicked an existing block to edit it, removed it, confirmed it's gone on
  reload.
- Created a test absence, confirmed dragging over it is rejected with a
  clear message, and confirmed the coverage numbers drop correctly during
  that window.
- Clean `npm run build`, `tsc --noEmit`, `eslint`.

Simplifications made for this pass (fine for now, worth knowing about):
- One day at a time, not a full week view side-by-side — the brief said
  "weekly," but a single scrollable day is more usable at this timeline
  resolution; prev/next-day navigation makes moving through a week fast.
  Can revisit if a week-at-a-glance view turns out to matter.
- No overlap prevention between two duty blocks on the same employee (you
  *can* double-book a meeting over a ticket-duty block right now) — only
  absence-vs-duty conflicts are blocked. Flagging in case that matters
  before real use.

---

## Phase 4 — Employee self-service ✅

**Done.** Two new pages, both built against the Phase 1 placeholder accounts.

What's in place:
- **My Schedule** (`/dashboard/my-schedule`, all roles) — a personal
  week view (prev/next week nav) showing your own absences and shift
  blocks per day, no more hunting through a shared grid. Employees can
  add or remove their own **breaks** directly from here (a simple
  start/end time form, not the full team-lead drag timeline).
- **Requests** (`/dashboard/requests`, all roles) — submit a leave
  request (date range or single half-day, type, optional note); see your
  own requests with status (pending/approved/rejected) and cancel a
  pending one. Team leads additionally see a **pending-approvals queue**
  for everyone, with Approve/Reject buttons.
- Approving a request auto-generates the matching `AbsenceEntry` row(s)
  (one half-day, or every weekday in the range for a multi-day request) —
  same absence data Phase 2's calendar and Phase 3's shift planner
  already read, so nothing new to wire up there.
- Self-service breaks reuse Phase 3's `createShiftBlock`/`deleteShiftBlock`
  actions rather than new code paths — widened in
  [`src/lib/actions/shifts.ts`](../src/lib/actions/shifts.ts) so *anyone*
  can create/delete a `break` block for themselves, while every other
  duty type stays team-lead-only. Same defense-in-depth pattern as every
  other phase: the server action re-checks this itself, not just the UI.
- Small shared-code cleanup while in here: the shift planner's day-bound
  constants (`DAY_START_MINUTE` etc.) moved from the `schedule/` route
  folder into `src/lib/constants.ts` so `src/lib/actions/shifts.ts`
  doesn't reach into an app-route folder for shared values.

How this was verified (against placeholder accounts, cleaned up after):
- Submitted a leave request as `arlette` (employee), approved it as
  `leadone` (team lead), confirmed via a direct database check that the
  approval created exactly the right `AbsenceEntry` row, and confirmed it
  then shows up correctly on Arlette's own My Schedule week view.
- Added a break on My Schedule as a team lead, confirmed it rendered,
  then removed it and confirmed it's gone.
- Clean `npm run build`, `tsc --noEmit`, `eslint`.

Simplification made for this pass: a team lead approving their *own*
submitted request isn't specially blocked (no self-approval guard) — an
edge case, not a real gap for a small team, but worth knowing about.

---

## Phase 5 — Notifications + shift-swap exchange ✅

**Done.** In-app only for now — the open question about a specific IM tool
(Teams/Slack) is still unanswered, so this phase built the in-app half
only, per the brief's "in-app notifications first" default. Easy to add a
push/IM integration later without changing anything already built — it
would just add a second delivery channel off the same `notify()` calls.

What's in place:
- New data model: `Notification` (recipient, type, message, link, read
  flag) and `SwapRequest` (shift block, from/to employee, status: open →
  claimed → approved/rejected/cancelled) —
  [`prisma/schema.prisma`](../prisma/schema.prisma), migration
  `20260904190000_notifications_and_swaps`.
- **Notifications** (`/dashboard/notifications`, all roles) — a list with
  an unread-count badge on the sidebar nav item, and a "Mark all as read"
  button. A shared `notify()` helper in
  [`src/lib/actions/notifications.ts`](../src/lib/actions/notifications.ts)
  is called from the other action files at the moments that matter:
  a leave request being approved/rejected (→ the requester), a new leave
  request being submitted (→ all team leads), a team lead adding or
  removing a duty block on someone's schedule (→ that employee, but not
  for their own self-service breaks), and every step of a shift swap (see
  below).
- **Shift Swaps** (`/dashboard/swaps`, all roles) — an employee offers one
  of their own upcoming duty blocks (breaks aren't swappable); any other
  employee can claim it; a team lead gives final approval, which is the
  point the shift block's ownership actually changes hands. Three
  sections: your own open duty blocks you can offer, an approval queue
  (team leads only), open offers anyone can claim, and your own
  offers/claims with status. All server-side in
  [`src/lib/actions/swaps.ts`](../src/lib/actions/swaps.ts).
- Claiming a swap checks the claimant isn't absent at that time and
  doesn't already have a conflicting block — reuses the same
  `assertNotAbsent` helper Phase 3's shift planner uses (exported from
  `src/lib/actions/shifts.ts` for this purpose), plus a new overlap check
  against the claimant's existing blocks.

How this was verified (against placeholder accounts, cleaned up after):
- Seeded a real ticket-duty block, offered it as `arlette`, claimed it as
  `estelle`, and approved it as `leadone` — then confirmed directly in the
  database that the shift block's `employeeId` actually changed to
  Estelle (not just that the request said "approved").
- Confirmed the unread badge appeared on the team lead's nav after the
  claim, cleared after "Mark all as read", and that every notification
  in the chain went to the right person (checked directly against the
  database, not just the UI): Arlette got claimed-notice then
  approved-notice, both team leads got a needs-approval notice, Estelle
  got the final approved notice.
- Clean `npm run build`, `tsc --noEmit`, `eslint`.

Simplifications made for this pass (fine for now, worth knowing about):
- No skill-based eligibility check on claiming — the brief mentions
  "complying with defined requirements (language skills, etc.)" but duty
  blocks aren't tagged with a required skill in the data model, so I
  didn't invent a mapping. If specific duties should require specific
  skills (e.g. only French speakers can claim a French ticket-duty slot),
  that needs a real decision from you before it can be built correctly.
- A swap can only be offered to *anyone* (first to claim it gets it), not
  targeted at one specific colleague — simpler to build and reason about
  for v1; targeted offers could be added later if open-only turns out to
  be too loose.
- Notification delivery is polling-based (you see it next time you load a
  page) — no real-time push/websocket. Fine for an internal tool people
  check during the day; would need actual infrastructure work to change.

**Post-Phase-5 correction:** the "Manager" role (read-only Team/Absences/
Reports access) was removed after this phase shipped, per your instruction
— the app is now just employee + team lead. Concretely: `ROLES` in
[`src/lib/constants.ts`](../src/lib/constants.ts) dropped `"manager"`,
every `requireRole([...])` gate and `NAV_ITEMS` entry that included it now
just says `["team_lead"]`, the Absences page's now-dead read-only mode was
deleted rather than left unreachable, the placeholder `manager` seed
account is gone from `prisma/seed.ts`, and `scripts/import-absences.ts`'s
manager-or-team-lead fallback is just team-lead now. Every phase's history
above still describes what was actually built *at the time*, manager
mentions included — this note is the record of what changed after.
Bringing a reporting-only role back later (if that need resurfaces) is a
small, additive change: re-add the role, widen a handful of `requireRole`
calls back to include it, done.

---

## Post-Phase-5 update — manager role, employee permissions, redesign ✅

This supersedes the earlier "manager removed" correction above: after that,
you asked for **one manager who can add employees and do everything a
manager can**, so the role is back — now as the single top role.

**Roles (three, with a shared "scheduler" permission set)**
- `manager` — the single admin. Everything a team lead can do, plus
  **adding employees, editing role/languages/group, deactivating people and
  resetting passwords** (Team page, `src/lib/actions/employees.ts`,
  enforced server-side with `requireRole(["manager"])`). A manager can't
  demote or deactivate their own account.
- `team_lead` — plans the schedule, edits absences, approves leave and
  swaps (same as before).
- `employee` — **sees everyone's schedule (read-only) but can only change
  their own**: on the Schedule page they can drag on their own highlighted
  row to add a *break*, and remove their own breaks. Everything else on
  the timeline is read-only for them, and the server actions re-check this
  (`createShiftBlock`/`deleteShiftBlock` in `src/lib/actions/shifts.ts`).
- `SCHEDULER_ROLES` / `isScheduler()` in `src/lib/constants.ts` replaced
  every hard-coded `"team_lead"` check, so manager and team lead always
  stay in sync.
- The Schedule page (formerly "Shift Planner") is now open to everyone;
  it's the same page, with edit rights depending on role.
- Seed has one manager (`manager` / `password123`). Roster CSV and its
  instructions accept `employee`, `team_lead`, `manager`.

**Redesign**
- Neutral wordmark (`src/components/brand-mark.tsx`: icon + "Einsatzplanung")
  on the login page and the sidebar. Page title is "Einsatzplanung".
- Brand palette in `src/app/globals.css` is a raspberry (`#891350`) as
  `brand-*` colours, plus `tone-*` accent colours. Shared `card` / `btn-*` / `input` / `badge` styles
  replace the old one-off classes everywhere.
- New sidebar with icons (lucide-react) and an active-page highlight, a
  role-aware Home with quick-link cards and live counts, redesigned login
  page, pill-style date navigation, modal "Add employee" dialog.

**Security fix found while testing:** sessions were signed cookies that
were never re-checked, so a deleted/deactivated employee (or one the
manager had just demoted) would have kept working — and kept their old
role — for up to 7 days. `verifySession()` in `src/lib/dal.ts` now re-reads
the employee's active flag and current role from the database on every
request; a removed account is sent to `/api/session/expired`, which clears
the cookie and returns to login. Verified with the real deleted test
account.

**Verified:** signed in as the manager, added an employee, signed in as
that employee with the password the manager set, confirmed the trimmed
nav, confirmed a drag on someone else's row does nothing and a drag on
their own row offers only "Break", and that the break appears at once.
`tsc` and `eslint` are clean. I did **not** run a production build this
round because your dev server was running (a build overwrites the folder it
uses) — run `npm run build` once you stop it, if you want that check.

Not done / worth knowing: employees can't view the Absences calendar (only
the Schedule's grey absence blocks); employee passwords are still plain
`password123` for seeded accounts; the manager sets real passwords for new
people only.

---

## Phase 6 — Forecasting + auto-scheduling ✅

**Built as a first version, using the defaults we agreed:** "fair" = equal share of
ticket duty over time, and the system only *suggests* — a team lead or manager
reviews, adjusts and publishes. Everything below is checked against your real numbers.

**1. Call history (real data, imported)**
- `scripts/import-call-stats.ts` reads the daily calls received / answered / CRM
  completed from the Ferien-plan into a new `DailyCallStat` table: **418 days, 2025-01-06
  to 2026-08-31**. Spot-checked against the sheet (e.g. Mon 5 Jan 2026 = 500 received,
  485 answered, 312 CRM — matches). Run with `npx tsx scripts/import-call-stats.ts`.
- Assumption to know: the sheet's "2025" rows sit under 2026 dates, so I store them on the
  date 364 days earlier (same weekday, same week-of-year). The first sheet (1–2 Jan) is
  skipped — both days carry identical numbers, which looks like one figure copied twice.
- Reachability in the data: **86.2% in 2025, 98.5% in 2026** (call volume fell from
  ~515 to ~434 a day), so the forecast has to follow the trend, not just copy last year.

**2. Demand forecast + capacity (`src/lib/forecast.ts`, page `/dashboard/forecast`)**
- Forecast = same weekday last year (that week ±1 week) × recent trend (last ~8 weeks of
  actuals vs the same days last year, clamped 0.5–1.5).
- Capacity = **your own rule**: people present × 15 calls per half-day. People on ticket
  duty don't count; managers aren't counted as call-takers. Reachability = capacity ÷
  expected calls (capped at 100%), compared with an **assumed 90% target** (no formal
  SLA was given — one constant to change).
- **Back-tested honestly** (each day forecast using only earlier data): last 40 days off by
  **~10% per day** on average, bias ≈ 0; just copying last year would be off by ~16%
  (29% over the full 160 days). The page shows these numbers; single days are ±10%,
  weeks are more reliable. Not "precise", and I won't claim it is.
- The Forecast page shows a week at a time: expected vs last year vs actual, people AM/PM,
  capacity, reachability, and people needed per half-day to hit the target.

**3. Auto-scheduler (`src/lib/scheduler.ts`, actions in `src/lib/actions/autoschedule.ts`)**
- On the Schedule page, team leads/managers get a forecast summary for the day and a
  **"Suggest schedule"** button. It proposes **ticket duty** (morning 08–12, afternoon
  14–17; people per half-day adjustable 0–3, default 1) and a **1-hour lunch** for each
  person present all day inside 12:00–14:00.
- Fairness: ticket duty goes to whoever has done the least in the last 28 days; the same
  person isn't given both halves while others are free. Over a 10-day simulation with 9
  people the spread was 1 half-day (max 3, min 2).
- Lunch is spread so the fewest people (and fewest of any one language) are away at once.
  A first greedy version let 7 of 9 be at lunch together; an improvement pass brought it
  to **5 of 9, the mathematical minimum** (9 hours of lunch in a 2-hour window), lunch
  spread 1 (the app's limit is 2).
- Never overwrites: absent people and anything already booked are skipped; clashes are
  reported as warnings.
- **Suggestions are drafts** (`ShiftBlock.draft`): dashed outline, visible only to team
  leads/managers, ignored by employees' views, swaps and notifications. The lead can
  change or remove any block, then **Publish** (re-checks every block against absences and
  bookings made since — anything that no longer fits is dropped, not forced) or
  **Discard**. Publishing notifies each affected person with a one-line plan.

**Verified (browser + database):** forecast page loads with real numbers; generating a
suggestion for Tue 6 Oct created 11 draft blocks (9 lunches + 2 ticket duty); an employee
(Leonie) saw none of it — no blocks, no controls, coverage unchanged; publishing made all
11 live, left 0 drafts and notified the 8 other people; test data removed afterwards.
Production build, `tsc` and `eslint` are clean.

**Limits worth knowing**
- Only **ticket duty and lunch** are auto-scheduled. Meetings, coaching, case review,
  training and home-office/office are still set by hand.
- The Ferien-plan marks ticket duty on only ~15% of half-days (usually one person), so
  "1 per half-day" may be more than you really need; set it to 0 for lunch-only.
- No skill matching on ticket duty (blocks aren't tagged with a required language).
- One day at a time; no week generator and no use of the forecast to decide *how many*
  people to schedule for ticket duty — the forecast is shown beside the suggestion.
- With the 9 placeholder people the forecast looks understaffed (capacity ~270 calls/day
  vs ~400 expected); your real team is ~29, which fixes that once the roster is loaded.
- The forecast beyond 2026-08-31 relies on last year plus the trend; for 2027 dates there
  is no prior-year data for most days (it falls back to recent same weekdays).

**Also changed:** the old "Reports" placeholder is replaced by **Forecast** in the menu.
A Next.js dev server loads the database client once, so after this migration (new table
and a `draft` column) any running `npm run dev` must be restarted to see them.

---

## Phase 7 — Deployment ⬜

Not started. Needs from you: create Vercel + Neon accounts when we get here (I can't do this on your behalf).
