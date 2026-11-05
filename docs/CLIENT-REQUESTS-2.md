# Client requests (round 2): task list

Eleven client requests, turned into tasks. Work through them **in order**. For each task:
build it, test it in the browser (checklist below), commit, then start the next one. If a task is
truly blocked, write the problem under "Blocked" at the end of this file and continue with the next
task that doesn't depend on it.

The general rules from [`CLIENT-REQUESTS-PLAN.md`](CLIENT-REQUESTS-PLAN.md) section 0 still apply:
Next.js 16 docs in `node_modules/next/dist/docs/`, Prisma migrations in `prisma/migrations/`,
server actions with zod and role checks, German UI text wrapped in `t("…")` with English in
`src/lib/i18n/en.ts`, date helpers from `src/lib/dates.ts`, and Tailwind with `lucide-react` icons.

### How to test every task

- `npx tsc --noEmit` and `npm run lint` must pass with no errors.
- Start the app with the preview tool (`.claude/launch.json`, name `lonicrm`) and open it in the
  browser. Log in as **manager** (`manager` / `password123`) and click through the feature.
- Log in as an **employee** (usernames in `README.md`, password `password123`). Check what they
  can and can't see or do.
- Check the browser console and the server logs for errors.
- Try the edge cases listed in the task.
- Remove any test data that isn't part of the seed.
- Commit with a short message.

At the end of **all** tasks: stop the dev server, run `npm run build` once, and add a short entry
at the top of `docs/PROGRESS.md`.

---

## Task 1: Free-text activity ("Sonstiges") for managers ✅

**Client:** "When I log in as manager, at schedule > at all activities, to be able to [have] an
empty input where the manager can write something else."

**Where:** Einsatzplan (`/dashboard/schedule`). The activity picker when a manager creates or
edits a block (`schedule/timeline.tsx`, block popup around the `createShiftBlock` call and the
edit popup), and the "Alle Tätigkeiten" filter (`schedule/activity-filter.tsx`).

**What to build:**
- In the block picker add an option **"Sonstiges…"** that shows an empty text input. The manager
  types any label (e.g. "Schulung Produkt X") and saves.
- Store it as `dutyType: "other"` with the typed text in `note` (no schema change needed). Validate
  in `src/lib/actions/shifts.ts`: text required for "other", trimmed, max ~40 characters.
- The block on the timeline shows the typed text instead of "Sonstiges". The tooltip shows it too.
- In "Alle Tätigkeiten" add a "Sonstiges" entry so these blocks can be highlighted.
- Employees can't create these blocks (server-side check), but they see the label in the plan.

**Test in the browser:**
- As manager, create a "Sonstiges" block with text, reload, and check that the text is still shown.
- Edit the text and delete the block.
- Try saving with an empty input and check that you get an error message and nothing is saved.
- Use the "Alle Tätigkeiten" filter set to "Sonstiges" and check that the block is highlighted.
- As an employee, check that the label is visible and that no picker is offered.

> **Open question for the client:** this reads the request as "a custom activity with free
> text". If they meant something else (e.g. a free-text search in the filter), adjust it.

---

## Task 2: Public holidays of Basel-Stadt ✅

**Client:** "Use the calendar of Basel-Stadt; you can get it at bs.ch."

**Where:** `src/lib/holidays.ts` (currently Basel-Landschaft), plus `scripts/check-holidays.ts`.

**What to build:**
- Look up the official Basel-Stadt public holidays on **bs.ch** (Ruhetagsgesetz / Feiertage
  Kanton Basel-Stadt) and switch the built-in list to Basel-Stadt. Check the differences from BL
  carefully (e.g. 1. Mai, Stephanstag, and whether Fasnacht counts or not) and write the source
  URL in the file comment.
- Keep it as a built-in list derived from Easter (no external API, works offline).
- Update all comments and UI text that mention "Basel-Landschaft" / "BL".

**Test in the browser:**
- Run `npx tsx scripts/check-holidays.ts` (or the existing check) for 2026 and 2027 and compare
  the output with bs.ch.
- In the Einsatzplan, open one holiday (e.g. Karfreitag 2027). The day must be blocked and the
  holiday name shown.
- Open a normal day next to it and check that it isn't blocked.

---

## Task 3: HO / BO marker on each employee ✅

**Client:** "Add a button at employee to show that [they are] work-from-home or backoffice, small
buttons with the first letters of each."

**Where:** Einsatzplan employee rows (`schedule/timeline.tsx`, name column) and the employee
popup (`schedule/employee-popup.tsx`).

**What to build:**
- Next to each employee's name show a small pill: **HO** (Home Office) or **BO** (Backoffice), or
  nothing if neither applies for that day. Use distinct colors and a tooltip with the full word.
- Managers can click to toggle it: none → HO → BO → none. It applies to the shown day.
- Data: add a per-day work mode. Recommended: a new small table `WorkMode` (`employeeId`, `date`,
  `mode: "HO" | "BO"`, unique on employee+date) with a migration. Reuse `LOCATIONS` from
  `constants.ts` if it fits.
- Employees see the pills read-only (they set their own in Task 4).

**Test in the browser:**
- As manager, toggle HO/BO for an employee, reload, and check that it persists. Check that it
  only affects that day.
- Check the week view still renders correctly.
- As an employee, check that the pills are visible but don't toggle when clicked (and the server
  action rejects a direct call).

---

## Task 4: Employee sets tomorrow as Home Office or Backoffice ✅

**Client:** "An employee [should be able] to make for himself that tomorrow will be home office
or backoffice."

**Where:** "Mein Plan" (`/dashboard/my-schedule`, `my-schedule/day-card.tsx`) and the
employee's own row in the Einsatzplan.

**What to build:**
- On the employee's own day cards (at least **tomorrow**, preferably any upcoming day) add two
  small buttons, **HO** and **BO**. Clicking one sets the work mode from Task 3 and clicking it
  again clears it.
- Server action: an employee may only change **their own** entries, and only for today or later
  (not the past). Managers can change anyone's.
- The manager sees the result immediately as the HO/BO pill in the Einsatzplan.

**Test in the browser:**
- As an employee, set tomorrow to HO. Then log in as manager and check that the Einsatzplan for
  tomorrow shows the HO pill.
- Switch to BO, then clear it.
- Try a past date and another employee's id (by calling the action directly) and check that both
  are rejected.

---

## Task 5: Undo a wrong "Krank" (sick) entry ✅

**Client:** "To be able to cancel if you [mark] someone wrong[ly as] krank."

**Where:** Einsatzplan employee popup (`schedule/employee-popup.tsx`, sick/absence section) and
the actions in `src/lib/actions/shifts.ts` (short-notice absence, around the "called in sick"
code). Check the absences page cells (`absences/absence-cell.tsx`) too.

**What to build:**
- When an employee is marked sick for the shown day, the popup shows **"Krankmeldung aufheben"**
  (cancel sick entry).
- Cancelling removes the absence entries that were created for it **and restores the shift
  blocks** that the sick entry removed or changed (check what the sick action does to blocks; if
  it deletes them, store enough to restore them, or regenerate the default day). Ask for
  confirmation before cancelling.
- Also offer it for a date range: either cancel the whole sick period or just one day.
- Manager only.

**Test in the browser:**
- Mark an employee sick for today. Check that they appear as "Krank" and that coverage drops.
- Cancel it. Check that the employee is back with their blocks and the coverage numbers are back
  to normal.
- Do the same for a 3-day range, cancel only the middle day, and check the rest stays.
- As an employee, check that there is no cancel button.

---

## Task 6: Filter absences by date, week or month ✅

**Client:** "At absences, to be able to choose even the date, week or month to filter."

**Where:** `/dashboard/absences` (`absences/page.tsx`). It currently filters by month (`y`, `m`
in the URL).

**What to build:**
- Add a small view switch: **Tag / Woche / Monat** (day / week / month), plus a date picker and
  prev/next arrows. Keep the state in the URL (e.g. `view=day|week|month&d=YYYY-MM-DD`) so
  links and reloads keep the filter.
- Day = one column for that date; Week = Mon–Fri (or Mon–Sun, matching the Einsatzplan) of the
  chosen week; Month = current behaviour.
- Use `weekOf` and the other helpers in `src/lib/dates.ts`.

**Test in the browser:**
- Switch between all three views and use the arrows on each. Check that the dates are correct
  across a month or year boundary (e.g. week of 29.12.2026).
- Reload the page and check that the filter stays.
- Check it as an employee too (read-only view must still work).

---

## Task 7: Table of refused (rejected) vacation requests ✅

**Client:** "At absences, create a table. Sometimes the manager can't approve each vacation day,
so they refuse. Those persons who are refused [should] be shown there, with the dates that are
refused."

**Where:** `/dashboard/absences`, new section below the calendar. Data comes from `LeaveRequest`
with `status = "rejected"` (and `AbsenceEntry` with `status = "rejected"` if those exist).

**What to build:**
- A table **"Abgelehnte Anträge"** with columns: employee, type (Ferien …), dates (from–to,
  half day), decided by, decided on, note.
- Respect the filter from Task 6 (show rejections that overlap the chosen period).
- Managers see all rejections. Employees see **only their own**.
- Empty state: "Keine abgelehnten Anträge in diesem Zeitraum."

**Test in the browser:**
- As an employee, submit a vacation request. As manager, reject it. Check that it appears in the
  table with the correct dates.
- Change the filter to a period without rejections and check the empty state.
- Log in as a different employee and check they don't see the first employee's rejection.

---

## Task 8: Remove "Zeitverlauf (heute)" from the schedule ✅

**Client:** "At schedule we can remove the 'Over the day (today)'."

**Where:** `schedule/forecast-card.tsx`, the "Zeitverlauf" section (around line 163–170, title
`Zeitverlauf (heute)` / `Zeitverlauf`).

**What to build:**
- Remove that section from the forecast card (on today and on other days). Delete the
  component/helpers only it used, and the now-unused translations in `en.ts`.
- Keep the rest of the card (tabs Heute/Woche/Monat and tiles) as is.

**Test in the browser:**
- Open the Einsatzplan for today and for another day and check that "Zeitverlauf" is gone and the
  card layout has no empty gap.
- Switch to English and check the same.

---

## Task 9: Hide last names everywhere ✅

**Client:** "At absences remove lastname; remove lastname of employees anywhere they can be seen
for right now."

**Where:** Everywhere an employee name is shown: absences, Einsatzplan (timeline, popups,
events, fixed appointment dialog, capacity/coverage panels), Mein Plan, Pausentausch, Team, start
page, notifications and the sidebar user box (`dashboard/layout.tsx`).

**What to build:**
- Add one helper, e.g. `displayName(name)` in `src/lib/` that returns the first name only.
- If two active employees share the same first name, add the last name's first letter
  ("Anna M.") so they stay distinguishable.
- Use it in **every** place a name is rendered (grep for `.name` in `src/app` and
  `src/lib/actions` messages). Don't change the stored data; "for right now" means it should be
  easy to switch back (one helper).
- The Team edit form still shows and edits the full name (managers need it there). Display in
  lists uses the first name.

**Test in the browser:**
- Click through every page as manager and as employee and check that no last name is visible
  anywhere.
- Check notifications text (e.g. reject a leave request and read the employee's notification).
- Check the duplicate first name case (temporarily rename a test employee, then revert).

---

## Task 10: Break blocks with a coffee icon ✅

**Client:** "When an employee makes his break, not to show right now [only] the yellow color but
to show that color with a coffee icon or a cup of coffee icon."

**Where:** Break blocks in the Einsatzplan (`schedule/timeline.tsx`, `schedule/duty-colors.ts`:
`break_am`, `break_pm`, `break`), the legend, the week view, and Mein Plan day cards.

**What to build:**
- Keep the yellow color and add a `Coffee` icon from `lucide-react` inside every break block.
  On narrow blocks show only the icon; on wider ones show icon + "Pause".
- Add the icon to the legend entry for Pause as well.

**Test in the browser:**
- Check the day view, the week view and Mein Plan. Every break shows the cup.
- Zoom/resize to a narrow window and check that the icon doesn't overflow the block.
- Check that clicking a break block (manager edit, employee own break) still works.

---

## Task 11: Remove break swaps (Pausentausch) for employees ✅

**Client:** "At employee, remove break swaps."

**Where:** Sidebar nav item "Pausentausch" (`dashboard/layout.tsx`), the page
`dashboard/swaps/*`, swap actions in `src/lib/actions/swaps.ts`, and any "offer swap" buttons
(e.g. in Mein Plan or the break block popup in `timeline.tsx`). Also check the start page and
notifications for swap links.

**What to build:**
- Remove the nav item and every button or link that starts a swap.
- Make `/dashboard/swaps` redirect to `/dashboard/my-schedule` (or remove the route).
- Keep the `SwapRequest` table and data (no destructive migration). Just stop using it in the UI.
  Remove unused code that tsc/lint flag.

**Test in the browser:**
- As an employee, check that there is no "Pausentausch" in the sidebar and no swap button
  anywhere, and that opening `/dashboard/swaps` directly redirects.
- As manager, check that nothing swap-related is left in approvals or notifications.
- `npx tsc --noEmit` and `npm run lint` pass.

---

## Notes from the implementation

- **Task 3/4:** BO reuses the existing whole-day backoffice block (so it lowers phone capacity);
  HO is a new `HomeOfficeDay` table. HO and BO can both be set on the same day.
- **Task 7:** the app has no leave-request flow any more (removed in an earlier round), so
  managers record refusals themselves in the "Abgelehnte Ferien" table.
- **Task 10:** the week view's break bars are only a few pixels wide, so they keep the colour only.

## Blocked

_(nothing)_
