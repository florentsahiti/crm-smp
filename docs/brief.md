# Automating the Ferien-/Weiterbildungsplan + Einsatzplan workflow

**Status: proposal only — nothing has been built. This document is the brief.**

## Context

Two Excel files currently run this team's scheduling:

1. **Ferien- und Weiterbildungsplan 2026.xlsx** — the year plan. 52 weekly tabs, ~30 employees, half-day (VM/NM) resolution. A team lead hand-types a code into every employee/half-day cell: `F` vacation, `KR` sick, `P` reduced workload, `W` training, `T` ticket duty, `FT` holiday, `UN` accident, `M` military/civil service. Below the grid, call-volume/reachability KPIs are typed in by hand (staying manual for now).
2. **Vorlage_Einsatzplan KSL.xlsx** — the weekly intraday plan. One sheet, 5 stacked day-blocks, ~27 employees × 36 **15-minute slots** (8:00–16:45). For every employee/every 15 min someone hand-types a duty code (`A` absent, `K` sick, `F` vacation, `T` ticket duty, `M` meeting, `S` training, `C` coaching, `FB` case review, `IT` tech issue, `x` break) plus a Home-Office/Office tag. `COUNTIF` formulas already auto-tally headcount per slot, per sub-group, and per language skill (FR/EN/IT).

**The core waste**: the same absence fact gets typed twice — once at half-day resolution in file 1, then re-typed at 15-minute resolution in file 2 — and employees have no way to see their own schedule except by hunting through a 27×200 cell grid.

A stakeholder has since sent a broader requirements list (below), which extends this from "replace two spreadsheets" into a small workforce-management system: forecasting, auto-generated schedules, an employee-facing app with notifications and self-service shift swapping.

## Full requirements (as received) and where each lands

| Requirement | Status |
|---|---|
| Manual corrections at short notice (sick leave, appointments) | Covered — absence entry, Phase 2 |
| Blocks/locks for training sessions, team meetings | Covered — `ShiftBlock` duty type, Phase 3 |
| Pre-configured settings (skills, prioritization) | Covered — skill/group fields already in data model, Phase 1 |
| Shift schedule as an employee app | Covered — self-service view, Phase 4 |
| Absence submission by employees via the app | Covered — leave request flow, Phase 4 |
| Approve/reject requests via the app | Covered — team lead approval, Phase 4 |
| Proactive entry of breaks by employees | New, straightforward — same drag-block UI, self-service, Phase 4 |
| Push notifications for schedule changes / to-dos | New, straightforward — in-app now; IM/Teams/Slack integration is a separate later step if wanted, Phase 5 |
| Digital shift-swap exchange (self-service, rule-checked) | New, straightforward on top of the existing data model, Phase 5 |
| Automated demand forecasting ("precise forecast") | New, hard — needs historical call-volume data and a forecasting method; Phase 6, open questions below |
| Forecasting SLA development with existing staff | New, hard — depends directly on the forecast above; Phase 6 |
| Automated creation of a fair staffing/shift schedule | New, hard — an auto-scheduler; needs "fair" defined concretely; Phase 6 |

## Decisions already made

- **Full web app**, not a spreadsheet macro or bridging script.
- **Two user roles**: team leads/schedulers (full edit) and employees (self-service + requests). A separate read-only "manager" role was dropped for now — see the note under Phase 5 in `PROGRESS.md`; easy to reintroduce later if reporting needs its own audience.
- **Cloud-hosted** — target Vercel (app hosting) + Neon (managed Postgres). *You create these accounts yourself when we reach deployment* — account creation/payment isn't something I can do on your behalf. Runs locally the same way until then.
- **Import the existing 2026 absence data** from the Ferien-plan as seed data. The Einsatzplan's intraday duty assignments are not imported — those start fresh going forward.
- **Intraday schedule entry via drag-to-create blocks** on a per-employee timeline, not a 36-column click-grid. Coverage counts still compute live at 15-minute resolution, same as the `COUNTIF` rows today.
- **Simple seeded login**: username + password per person, role-gated, no external identity provider.
- **KPI numbers (call volume, reachability) stay manual for the core build** — automated forecasting is its own later phase, not assumed to ship with the rest.

## Proposed system

### Data model (core entities)
- **Employee** — name, short code (e.g. `ARZ`), languages/skills (FR/EN/IT), group (1/2/3), role (employee/team lead), login credentials.
- **AbsenceEntry** — employee, date, half-day (AM/PM) or full-day, type (vacation/sick/training/holiday/accident/military/reduced-workload), status (approved/pending/rejected) — replaces the Ferien-plan grid.
- **ShiftBlock** — employee, date, start time, end time, duty type (ticket duty/meeting/coaching/case review/tech issue/break/training-lock/other), location (Home Office/Office) — replaces the Einsatzplan grid.
- **LeaveRequest** — employee-submitted request (date range, type, note), approved/rejected by a team lead; on approval becomes an `AbsenceEntry`.
- **SwapRequest** (Phase 5) — employee A offers a shift block to employee B (or to anyone qualified); system checks skill/coverage rules before allowing; team lead notified or auto-approves per rule.
- **Notification** (Phase 5) — event log (schedule changed, request approved, swap proposed, to-do assigned) feeding in-app alerts and, later, external push/IM.

Coverage/headcount and language-coverage numbers are **computed on read**, not stored — same result as today's `COUNTIF` rows, but derived instead of typed twice.

### Features by role
- **Team lead**: year-view absence calendar; week-view intraday planner with drag-to-create blocks (absences already block those slots automatically); approve/reject leave and swap requests; lunch-break-spread check ported over; (Phase 6) review/adjust the auto-generated schedule rather than build it from scratch.
- **Employee**: "my schedule" view; submit leave requests and breaks; propose/accept shift swaps; receive notifications.

(A read-only "Manager" role — coverage dashboard, absence-type breakdown — was in the original plan but dropped for now; see the Phase 5 note in `PROGRESS.md`.)

### Tech stack
- **Next.js** (React) — single app serving UI and API routes.
- **PostgreSQL via Prisma** — local now, Neon later via connection-string change only.
- **Auth**: credential-based sessions with a `role` field gating routes/UI.

### Data import
A one-time script (Python/openpyxl or Node) walking all 52 week-tabs of the Ferien-plan, mapping each employee name + half-day code to an `AbsenceEntry` row. Employee names matched to a seeded `Employee` table (cross-checked against the 3-letter codes in the Einsatzplan template).

## Phased roadmap

1. **Foundation** — Next.js + Prisma + Postgres scaffold, data model, seeded login/roles, skill/group settings.
2. **Year absence calendar** (team lead) + import script for 2026 data.
3. **Weekly intraday planner** (drag-to-create blocks, including training/meeting locks) + live coverage/language tallies + lunch-break check.
4. **Employee self-service** — my-schedule view, leave requests + approvals, proactive break entry.
5. **Notifications + shift-swap exchange** — in-app notifications first; digital swap flow with automatic skill/coverage rule-checking.
6. **Forecasting + auto-scheduling** — demand forecast from historical call data, SLA projection, rule-based automatic schedule generation with team-lead review/override. Largest, most open-ended phase — see below.
7. **Deployment** — you create Vercel/Neon accounts, I wire up the deploy.

## Open questions for Phase 6 (forecasting / auto-scheduling) specifically

These need real answers before that phase can be scoped, let alone built:
- **What historical data exists** for call volume/workload, and how far back does it go? (The Excel today has hand-typed weekly totals — is there a richer source, e.g. the phone system or CRM, that could be exported?)
- **What counts as "fair"** in the auto-generated schedule — equal total shifts? Equal weekend/late shifts? Seniority-weighted? Employee preferences taken into account?
- **What SLA target** are we forecasting against (e.g. "X% of calls answered within Y seconds")?
- **How much autonomy** should the auto-scheduler have — fully automatic with team-lead override, or a "suggested schedule" the team lead assembles from?
- **What accuracy is realistic** to promise for "precise forecast" — this depends entirely on how much clean historical data exists; worth setting expectations early rather than after the fact.

## Open items for the near-term phases (1–5)

- Full employee roster with roles (team lead vs. employee) — the Excel only shows names, not org role.
- Confirm the duty-type list is complete (ticket duty, meeting, coaching, case review, tech issue, break, training-lock, other).
- Leave/swap approval: single team-lead approval, or multi-level?
- Notifications: in-app only for Phase 5, or does "via IM" mean a specific tool (Teams/Slack) to integrate now?

## Verification (once implementation starts)

- Run the import script against the real Ferien-plan file and spot-check several employee/week combinations against the source Excel.
- Confirm live coverage/language-count numbers match what `COUNTIF` would produce for the same inputs.
- Click through all role views to confirm role-gating.
- For Phase 6: back-test any forecasting method against real historical weeks before trusting it for planning.
