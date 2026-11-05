# Roster — what you need to do

`roster.csv` in this folder is pre-filled with the **29 real employee
names**, pulled directly from your Ferien-plan and Einsatzplan files.
It is real HR data, so it is **kept locally only and never committed**
(it is listed in `.gitignore`). I
also filled in `groupNumber` and `shortCode` for the 21 people who appear
in the Einsatzplan template, and left the other 8 blank (they only showed
up in the year-plan, not the week template).

**The one thing only you can decide is the `role` column** — I have no way
to know who is a manager and who is a regular employee from the
spreadsheets alone. Everything else is optional to fix.

## How to edit it

1. Open `data/roster.csv` — Excel works fine (it'll open as a spreadsheet),
   or any plain text editor (Notepad, VS Code, etc.).
2. Fill in the `role` column for every row. Only these three exact values
   are accepted: `employee`, `manager` (managers plan the schedule, approve requests and add employees; they are not counted as call-takers).
3. Optional, while you're in there:
   - Fix `shortCode` for the 8 blank rows if you know their real Kürzel — otherwise the
     apply script will auto-generate a placeholder for you.
   - Fill in `skills` (comma-separated, only `FR`, `EN`, `IT` accepted) if
     you know who speaks what — I couldn't reliably tell this apart from
     the source files, so I left it blank for everyone.
   - Fill in `groupNumber` for the 8 people missing it, if they belong to
     one of groups 1/2/3.
4. If you're using Excel: save as **CSV UTF-8 (Comma delimited)**, not the
   regular `.xlsx` format, and keep the filename `roster.csv`.

## Then apply it

```bash
npx tsx scripts/apply-roster.ts
```

This validates every row first — if `role` is missing or misspelled
anywhere, it lists exactly which rows and stops without touching the
database. Fix and re-run. It's safe to run more than once (it updates
existing accounts by username rather than duplicating them).

Once applied, everyone's login is their `username` with the password
`password123` (same placeholder-password approach as Phase 1 — this needs
to change before this ever goes to real users, see the TODO in
`scripts/apply-roster.ts`).

## After that: importing the real 2026 absence data

Once the roster is applied, run:

```bash
npx tsx scripts/import-absences.ts --dry-run   # preview first, writes nothing
npx tsx scripts/import-absences.ts             # then actually import
```

It reads `data/source/Ferien- und Weiterbildungsplan 2026.xlsx` (a copy of
your file, already placed there — not tracked in git since it's real HR
data) and matches every name in it against the `Employee` table by exact
name match. If any names don't match, the script tells you which ones —
usually just a typo or a name spelled slightly differently between the two
original spreadsheets.

One thing I couldn't resolve myself: the source file has a code **"KOM"**
in two cells (I didn't recognize it from the legend, so the import skips
those two cells rather than guessing). If you know what it means, tell me
and I'll add it to the mapping in `scripts/import-absences.ts`.
