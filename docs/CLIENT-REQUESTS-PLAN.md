# Client requests — implementation plan for Claude Code

Twelve client requests, turned into tasks to do **in order, one after another, without stopping**.
For each task: build it → test it (checklist below) → commit → start the next one. Only stop if
something is truly blocked (e.g. a migration cannot run). In that case write the problem down
under "Blocked" at the end of this file and continue with the next task that doesn't depend on it.

Design references (open them, they are the visual target):
- **Target:** the client's v2 mockup (`design-v2-target.webp`, kept outside the repo)
- Older idea, use only for details: the client's v1 mockup (`design-v1.webp`, kept outside the repo)

---

## 0. Read first (rules for every task)

1. **Next.js 16 is different from what you know.** Before writing routing, data-fetching,
   `searchParams`, server action or caching code, read the matching guide in
   `node_modules/next/dist/docs/` (see `AGENTS.md`). Middleware is `src/proxy.ts`.
2. **Prisma 7, Postgres.** Schema: `prisma/schema.prisma`. Enum-like fields are `String` and are
   validated with zod in the app (follow the comments in the schema). For a schema change, add a new
   migration folder under `prisma/migrations/` (timestamp name like `20261013120000_<name>`),
   and run it with `npm run db:local:setup`. Restart the dev server after a migration (the
   database client is loaded once).
3. **Server actions** live in `src/lib/actions/*.ts`: zod-validate the input, check rights with
   `requireRole(SCHEDULER_ROLES)` (manager) or `verifySession()`, then `revalidatePath(...)`.
   Never trust the UI alone for permissions.
4. **Roles:** only `manager` and `employee` (`src/lib/constants.ts`). Managers edit; employees
   mostly read. Managers are not counted as call-takers.
5. **Language of the UI:** German is the source text. Wrap every new string in `t("…")` and add
   the English translation to `src/lib/i18n/en.ts`.
6. **Dates:** use the helpers in `src/lib/dates.ts` (`toDateKey`, `parseDateKey`, `weekOf`,
   `zurichDateKey`, …). Date columns are stored as UTC midnight. Business time zone is
   `Europe/Zurich`.
7. **Capacity/coverage logic** is in `src/lib/capacity.ts` (`statusAt`, `slotSummary`,
   `hourRows`) and `src/lib/forecast.ts` / `src/lib/staffing.ts`. Reuse it; don't write a second
   way to count "available" people.
8. **Style:** Tailwind 4 + the shared classes in `src/app/globals.css` (`card`, `btn-*`, `input`,
   `badge`, `page-title`…). Icons: `lucide-react`. No new UI libraries. A chart library is
   allowed only if a plain SVG/CSS chart is clearly not enough — prefer plain SVG.
9. **Match the surrounding code**: same naming, comment density and file structure.

### How to test every task (do all of this before committing)

- `npx tsc --noEmit` → no errors
- `npm run lint` → no errors
- Start the app with the preview tool (`.claude/launch.json`, name `lonicrm`), log in as
  `manager` / `password123`, and click through the feature in the browser. Then log in as an
  employee (see `README.md` for usernames, password `password123`) and check what they can and
  can't see/do.
- Check the browser console and server logs for errors.
- Try the edge cases listed in the task.
- Remove any test data you created that isn't part of the seed.
- Commit with a short message, e.g. `Add date range for absences from schedule`.

At the end of **all** tasks: run `npm run build` once (stop the dev server first) and add a
short entry at the top of `docs/PROGRESS.md` describing what was built.

---

## Task 1 — Colors per language

**Client:** "divide languages with colors"
**Decision:** color the language **badges only** (no regrouping of employees).

What to build:
- In `src/lib/constants.ts` add one color per language in `SKILL_CODES`, e.g.
  `SKILL_COLORS: Record<SkillCode, string>` with Tailwind classes:
  - DE → blue (`bg-blue-100 text-blue-800`)
  - FR → violet (`bg-violet-100 text-violet-800`)
  - IT → green (`bg-emerald-100 text-emerald-800`)
  - EN → amber (`bg-amber-100 text-amber-800`)
- Make a small shared component (e.g. `src/components/language-badge.tsx`) that renders one
  badge per language. An employee with `DE,FR` shows two small colored badges.
- Use it everywhere languages appear: Einsatzplan "Sprache" column (`schedule/timeline.tsx`),
  Team page (`team/employee-row.tsx`), the per-language coverage bars (now panel / capacity
  panel), the Fixtermin dialog if it shows languages.
- Make sure the colors don't clash with the activity colors in the timeline (Telefonie blue
  block vs DE blue badge is fine because the badge is small; if it looks confusing, use a darker
  shade).

Test: each language has its own color on all pages; colors are readable; nothing else changed.

---

## Task 2 — Birthday on the employee (Team page)

**Client:** "at team add an entry for employee birthday, e.g. 13/10 is shown at Ereignisse"

What to build:
- Schema: add to `Employee` two nullable ints `birthDay Int?` and `birthMonth Int?`.
  **Store only day + month, never the year** (privacy — we don't need the age).
  Migration needed.
- Team page: in "Add employee" (`team/add-employee-form.tsx`) and edit row
  (`team/employee-row.tsx`) add a "Geburtstag" field: day (1–31) and month (1–12) selects, or one
  input `TT.MM`. Optional field.
- Server action `src/lib/actions/employees.ts`: validate with zod (valid day for that month;
  allow 29.02). Only managers can set it.
- Show the birthday in the employee row (e.g. `🎂 13.10.` or a cake icon from lucide).

Test: set, change and clear a birthday; invalid dates (31.02) are rejected with a clear message;
employee login can't edit it.

---

## Task 3 — Official holidays Basel-Landschaft (2027 and later)

**Client:** "connect calendar with the official calendar of Basel 2027 so we know which dates are
holidays"
**Decision:** canton **Basel-Landschaft**. **Built-in list, no external API** (works offline,
no dependency on another website). On a holiday the day is **blocked**.

What to build:
- New file `src/lib/holidays.ts` with `holidaysFor(year): { dateKey: string; name: string }[]`
  and `holidayOn(dateKey): string | null`.
- Compute Easter with a standard algorithm (e.g. anonymous Gregorian / Meeus) so it works for
  every year, then derive the movable days. Official public holidays of Basel-Landschaft:
  - Neujahr (01.01)
  - Karfreitag (Easter − 2)
  - Ostermontag (Easter + 1)
  - Tag der Arbeit (01.05)
  - Auffahrt (Easter + 39)
  - Pfingstmontag (Easter + 50)
  - Bundesfeiertag (01.08)
  - Weihnachten (25.12)
  - Stephanstag (26.12)
- **Before you finish, check this list against the official page of Kanton Basel-Landschaft
  (baselland.ch, "Feiertage")** and correct it if something differs. Write the source URL in a
  comment at the top of `holidays.ts`.
- Expected weekdays in 2027 (Easter = 28.03.2027): Fr 01.01, Fr 26.03, Mo 29.03, Do 06.05,
  Mo 17.05. (01.05, 01.08, 25.12, 26.12 fall on a weekend in 2027.) Write a tiny check script or
  test that prints `holidaysFor(2027)` and compare.
- Behavior on a holiday:
  - Einsatzplan: show a banner "Feiertag: Auffahrt" for the day; the timeline is greyed out and
    blocks can't be created (check it in the server action too, in `src/lib/actions/shifts.ts`).
  - Capacity / coverage: nobody available, forecast for that day = 0.
  - Absences calendar (`/dashboard/absences`): the column is shaded and labelled (e.g. "FT").
  - Forecast page: the day shows "Feiertag" instead of numbers.
  - Holidays also appear in Ereignisse (Task 4).

Test: open 06.05.2027 → holiday banner, no blocks possible, coverage 0; Absences May 2027 shows
the marked columns; a normal day still works.

---

## Task 4 — "Ereignisse" (events) on the schedule

**Client:** "add at schedule Ereignisse for special dates, for birthdays for example"
**Decision:** everyone (employees too) sees birthdays — day + month only.

What to build (look at the "Ereignisse & Mitteilungen" panel in the target design):
- Schema: new model `Event` — `id`, `date DateTime`, optional `startMinute Int?` /
  `endMinute Int?`, `title String`, `type String` (`"event" | "meeting" | "info"`),
  `note String?`, `createdById`, timestamps. Migration needed. This is for manual special dates
  (e.g. "Teammeeting", "Neue Mitteilung: Einsatzplan für nächste Woche updaten").
- Panel on the Einsatzplan page: **"Ereignisse"** card with filter tabs
  **Alle / Ereignisse / Geburtstage / Feiertage / Termine**. It lists for the selected day (and the
  next 7 days, in a "Demnächst" part):
  - manual `Event`s,
  - birthdays from `Employee.birthDay/birthMonth` ("Geburtstag – Thomas", and
    "Geburtstag in 3 Tagen – Tamy, 12. Oktober"),
  - holidays from Task 3,
  - BILAs / team meetings / Schulungen from the shift blocks (fixed appointments) of that day
    ("BILA (2 Mitarbeitende) 12:30–13:30").
- Each item has an icon + colored type label on the right (like the design: Ereignis, Geburtstag,
  Abgelehnt, Mitteilung). A count badge "3 Neu" in the header for items of today.
- Managers: button "+ Ereignis" to add / edit / delete a manual event (dialog with date, optional
  time, title, type, note). Server actions in a new `src/lib/actions/events.ts`, manager only.
- Employees: read only.
- Also show a small 🎂 icon next to the employee's name in the timeline on their birthday.

Test: set an employee's birthday to today → shows in Ereignisse and as icon; birthday in 3 days
shows in "Demnächst"; add/edit/delete a manual event as manager; employee sees but can't edit;
a holiday date shows the holiday.

---

## Task 5 — Sick / absence for a date range (from the Einsatzplan)

**Client:** "when I click an employee to add e.g. sick, be able to select from what date to what
date — not only daily, have both options"

Today: clicking an employee name opens `AbsencePopup` in `schedule/timeline.tsx`, which calls
`reportShortNoticeAbsence` (`src/lib/actions/shifts.ts`) for **one day** (VM / NM / Ganzer Tag).

What to build:
- In the popup, a switch with two options: **"Nur heute"** (current behavior, VM/NM/Ganzer Tag)
  and **"Zeitraum"** (from date — to date, default from = the shown day).
- For "Zeitraum": create `AbsenceEntry` rows for every **weekday** in the range (use
  `weekdaysInRange` from `src/lib/dates.ts`), FULL day (as AM + PM rows, same as today), skipping
  public holidays from Task 3. The first and last day may optionally be a half day
  (keep it simple: an optional "erster Tag nur NM" / "letzter Tag nur VM" checkbox).
- Extend the zod schema of `reportShortNoticeAbsence` (or add `reportAbsenceRange`) — max range
  e.g. 60 days, `to >= from`. One `prisma.$transaction`. Keep the "remove blocks in that time"
  option and apply it to every day in the range.
- Works for every absence type (Krank, Ferien, Unfall …), not only sick.
- After saving, the Absences calendar shows the whole range.

Test: set Krank from today to next Wednesday → every weekday in between is absent in the
Einsatzplan and the Absences page; weekend and holidays skipped; to < from is rejected;
"Nur heute" still works as before; employee can't do it.

---

## Task 6 — Backoffice (no calls, email only) for a day or a range

**Client:** "when I click an employee, make them e.g. Backoffice (doesn't accept calls that day,
only email, because can't talk)"
**Decision:** from the **employee name click**, for **one day or a date range** (same UI as
Task 5). The person **works**, but is **not counted as phone capacity**.

What to build:
- It is **not** an absence (they are working). Store it as a day-status, e.g. new model
  `DayAssignment { employeeId, date, kind: "backoffice", note?, createdById }` with
  `@@unique([employeeId, date])` — or reuse `ShiftBlock` with a new duty type `backoffice`
  covering 08:00–17:00. Pick the one that fits `capacity.ts` best; a whole-day block is the
  simplest because `statusAt` already handles blocks (`activityKind` → "work" = not available for
  calls). Explain your choice in a comment.
- Add the label "Backoffice (nur E-Mail)" to `DUTY_TYPE_LABELS` if you use a duty type, with its
  own color in the timeline (e.g. slate/teal) and in the legend.
- In the name-click popup: a second section/tab "Backoffice" with "Nur heute" / "Zeitraum" and
  an optional note (reason). A way to remove it again.
- Capacity: backoffice people are **not** in "Verfügbar" for Telefonie, but should be shown as
  their own count ("Backoffice: 1") in the coverage tiles.
- Employees can't set it.

Test: mark someone Backoffice today → row shows the Backoffice block, available count drops by 1,
coverage tile shows "Backoffice 1"; range over 3 days works; remove it again.

---

## Task 7 — Manager adds a BILA (meeting) with an employee

**Client:** "as a manager be able in Einsatzplan to add a meeting (BILA) with an employee"

Today there is already a "Fixtermin erfassen" dialog (`schedule/fixed-appointment-dialog.tsx`)
with type `bila`. Make BILA a quick, obvious action:
- Header button like in the design: **"Manuelle Änderung ▾"** dropdown with entries
  "BILA erfassen", "Fixtermin erfassen" (existing dialog), "Abwesenheit erfassen" (Task 5),
  "Backoffice" (Task 6).
- "BILA erfassen" dialog: pick **one employee**, date, start/end (15-min steps, default 30 or 60
  min), optional note. The **manager who creates it is automatically included** (block on both
  rows), with a checkbox to turn that off.
- Check that the time is free for the employee (no absence, no other fixed appointment) — reuse
  the existing checks in `src/lib/actions/shifts.ts` (`assertNotAbsent`, overlap check).
- BILA shows as pink block "BILA" in the timeline (as in the design) and in Ereignisse (Task 4).
- The employee sees their BILA in "Mein Plan".
- Also: clicking an employee name → popup has a shortcut "BILA planen" that opens the dialog with
  that employee preselected.

Test: create a BILA 13:00–13:30 for an employee → pink block on both rows, in Ereignisse,
employee sees it in Mein Plan; overlapping with an absence is rejected with a clear message.

---

## Task 8 — Click an hour → how many employees are active

**Client:** "when you press the time 10:00, show how many people will be / are active at that hour"
**Decision:** show **how many employees are active** at that time.

What to build:
- The hour labels in the timeline ruler (`schedule/timeline.tsx`, "Ruler") become clickable
  buttons (cursor pointer, hover style).
- Click → a small popover under the label: big number **"9 aktiv"** + "von 15" for that time
  (use `slotSummary` from `src/lib/capacity.ts` at the clicked minute — e.g. 10:00 = slot 600).
  Below, small and secondary: in Pause / Termin / Abwesend / Backoffice counts. Optionally an
  expandable list of the names that are active.
- Also highlight that column lightly in the timeline while the popover is open.
- Works for past, current and future times and on any day (including week view in Task 9 — there
  it can be per day).

Test: click 10:00 and 12:30 on a day with lunch breaks → numbers differ correctly and match the
coverage table; close with click outside / Esc.

---

## Task 9 — Weekly view filter in the Einsatzplan

**Client:** "at schedule be able to have a filter so you can see it weekly"

What to build:
- Toggle **Tag | Woche** in the header (as in the design). Store it in the URL
  (`?view=week&d=2026-10-12`), so links and refresh keep it. Default = Tag.
- Week view = Monday–Friday of the week of `d`:
  - one row per employee, five day columns;
  - each cell shows a compact summary of that day: absent (type color + label, e.g. "Krank"),
    Backoffice, or small colored bars for the day's activities (Telefonie / Ticketdienst / CRM /
    Pause / BILA) — a mini timeline, not text-heavy;
  - holidays (Task 3) shade the whole column;
  - under the grid: per day the available count and forecast vs. capacity (red/green).
- Clicking a day header or a cell opens that day in the Tag view.
- Prev/next arrows jump by week in week view, by day in day view.
- Add the activity filter dropdown from the design ("Alle Tätigkeiten ▾": Telefonie, CRM,
  Ticketdienst, Pause, BILA, Backoffice, Abwesend) — it dims everything except the chosen
  activity, in both views.
- Week view is read-only (editing happens in Tag view) — keeps it simple.

Test: switch views, URL updates, refresh keeps view; week navigation; a range absence from
Task 5 shows on all its days; filter works; employee login can use week view too.

---

## Task 10 — Forecast per weekday (Monday … Friday)

**Client:** "time to make it daily, Monday, Tuesday, Wednesday, Thursday, Friday"
**Decision:** the forecast is entered and shown **for each weekday separately**.

Today `ForecastDay` holds one total (+ optional hourly values) per date, edited one day at a time
in the capacity panel.

What to build:
- On the Forecast page (`/dashboard/forecast`) and in the forecast card of the Einsatzplan:
  a **week editor** with five columns **Mo Di Mi Do Fr** for the selected week. For each day the
  manager can enter the expected calls (Telefonie) and expected CRM tasks, and see next to it:
  automatic forecast, people planned, capacity, difference (red/green). One "Speichern" for the
  whole week.
- Schema: add `crmTotal Int?` to `ForecastDay` (migration) so CRM gets its own forecast, as in
  the design (Telefonie / CRM / Total Tasks cards).
- **Standard pattern per weekday:** a small "Wochenmuster" section where the manager saves default
  values per weekday (e.g. Mo 450, Di 400, … Fr 350). Store in a new tiny model
  `ForecastWeekdayDefault { weekday Int @unique (1–5), calls Int, crm Int? }`. Order of use for a
  date: manual `ForecastDay` → weekday default → automatic forecast from history. Update
  `forecastInfo` in `schedule/page.tsx` accordingly and show the source ("manuell",
  "Wochenmuster", "automatisch").
- Holidays (Task 3) = 0 and not editable.
- Keep the existing per-hour editing working.

Test: save values for a whole week → each day in the Einsatzplan uses its own number; set a
Wochenmuster → a future week without manual values uses it; clear a day → falls back correctly.

---

## Task 11 — Forecast / staffing on the Absences page

**Client:** "at absences add a forecast to connect it with schedule forecast"
**Decision:** a **staffing row per day** under the absence grid.

What to build (`/dashboard/absences`, `absences/page.tsx`):
- Below the employee grid, extra summary rows for every day/half-day column of the month:
  - **Forecast** (calls, from the same source order as Task 10),
  - **Anwesend** (people present VM / NM — call-takers only, managers excluded, Backoffice
    excluded),
  - **Kapazität** (present × `CALLS_PER_PERSON_HALF_DAY`, see `src/lib/forecast.ts`),
  - **Differenz** colored red (too few) / green (ok) / blue (too many), same colors as
    `capacity-panel.tsx`.
- Reuse `staffingFor`, `dayCapacity`, `forecastCalls` from `src/lib/staffing.ts` /
  `src/lib/forecast.ts`, loaded once for the whole month (no query per cell).
- When the manager sets an absence in the grid, the row updates right away (it's server-rendered
  — `revalidatePath` is already there).
- Holidays show "FT", no numbers.
- Employees see the rows too but only the totals (no reasons for absences — keep the existing
  privacy rule in that page).

Test: add vacation for 3 people on one day → "Anwesend" drops by 3 and the difference turns red
if the forecast needs more; numbers match the Einsatzplan for the same day.

---

## Task 12 — Visual redesign: coverage, forecast and capacity as graphics

**Client:** "Coverage, forecast and capacity to do with the graphic visually" (two images attached)
**Decision:** build the Einsatzplan page to match **`design-v2-target.webp`**.

Do this last — it brings together the parts from Tasks 1–11. Open the image and match layout,
spacing, colors and wording as closely as possible. Keep the brand colors from
`globals.css` (raspberry `brand-*`, `tone-*` accents).

Layout of the page (top to bottom, see image):
1. **Header row:** title "Einsatzplan", ‹ date picker (dropdown calendar) ›, "Heute", segmented
   **Tag | Woche** (Task 9), **"Aktuelle Zeit"** button (blue, jumps to today and scrolls to the
   now line), "Alle Tätigkeiten ▾" filter (Task 9), "Manuelle Änderung ▾" (Task 7), "…" menu.
2. **Timeline grid** (existing `timeline.tsx`, restyled):
   - left columns: avatar initials badge (colored circle with 2 letters), name, language badges
     (Task 1);
   - 15-min ruler with clickable hours (Task 8) and a **red current-time line with a red time
     pill** (e.g. "10:40") on today;
   - colored blocks with centered labels: Telefonie (light blue), CRM (light green), Ticketdienst
     (light violet), Pause (yellow), Mittagspause (grey), BILA/Teammeeting (pink),
     Schulung (light grey), Krank/Abwesend (light red), Backoffice (Task 6 color);
   - horizontal scroll bar when narrow; **color legend** under the grid.
   - Note: today, empty time is shown as nothing. In the design, working time without a special
     block is shown as "Telefonie". Show unassigned working time of present call-takers as a
     light-blue "Telefonie" band (display only — don't create rows in the database), and CRM as
     its own duty type if not already there (add `crm` to `DUTY_TYPES` if needed).
3. **Bottom row, three cards side by side** (stack on small screens):
   - **"Forecast & Tagesleistung"** — tabs Heute / Woche / Monat; three tiles **Telefonie**,
     **CRM**, **Total Tasks**, each with Forecast / Erledigt / Rest numbers and a colored progress
     bar with % (blue / green / violet); under it the **"Zeitverlauf (heute)"** table in 2-hour
     rows: Forecast Anrufe, Anrufe, Forecast CRM, CRM, Total, Differenz (red negatives).
     Button "Forecast bearbeiten" opens the weekday editor (Task 10).
   - **"Abdeckung & verfügbare Mitarbeitende"** with the current time pill and a refresh icon:
     five colored tiles **Verfügbar / In Pause / Mittagspause / Meeting/BILA / Krank/Abwesend**
     (plus Backoffice if > 0), then **"Verfügbare Mitarbeitende nach Sprachskill"**: horizontal
     bars Deutsch, Französisch, Italienisch, DE/FR, DE/IT with "7 / 8" (available / planned).
     This replaces the current `now-panel.tsx`; reuse its logic (`slotSummary`).
   - **"Ereignisse & Mitteilungen"** — the panel from Task 4 (tabs Alle / Ereignisse /
     Geburtstage / Ferien / Mitteilungen, "3 Neu" badge, colored labels).
4. Keep the existing detailed per-hour capacity table (`capacity-panel.tsx`) available, but move
   it behind a "Details anzeigen" toggle so the page looks like the design.

Charts: plain SVG/CSS (progress bars, tiles). If you add the forecast-vs-available chart from
`design-v1.webp` (bars = forecast, line = available people), put it in the Woche/Monat tab of
the forecast card — optional.

Test:
- Side-by-side comparison with `design-v2-target.webp` at desktop width (~1440px): take a
  screenshot and fix differences.
- Narrow width (tablet/mobile): cards stack, timeline scrolls horizontally, nothing overlaps.
- Numbers in the tiles match the old capacity table for the same time.
- Employee login: sees everything read-only, no "Manuelle Änderung" / "Forecast bearbeiten".

---

## Order summary

| # | Task | Schema change |
|---|---|---|
| 1 | Language colors | – |
| 2 | Birthday on employee | `Employee.birthDay/birthMonth` |
| 3 | Basel-Landschaft holidays | – (code) |
| 4 | Ereignisse panel | new `Event` |
| 5 | Absence date range | – |
| 6 | Backoffice day/range | duty type or `DayAssignment` |
| 7 | BILA with employee | – |
| 8 | Click hour → active count | – |
| 9 | Week view + activity filter | – |
| 10 | Forecast per weekday | `ForecastDay.crmTotal`, `ForecastWeekdayDefault` |
| 11 | Staffing rows on Absences | – |
| 12 | Redesign to target image | maybe `crm` duty type |

## Blocked

_(Claude Code: write here anything you couldn't finish and why, then continue.)_
