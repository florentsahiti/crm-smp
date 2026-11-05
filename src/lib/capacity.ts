/**
 * Capacity maths for one day, at the Einsatzplan's 15-minute resolution. Pure functions (no
 * database, no server-only imports) so the Schedule page and the live "Aktuelle Zeit" view in
 * the browser count exactly the same way.
 *
 * Who counts: everyone passed in as an agent (call-takers — managers are left out by the caller).
 * At any 15-minute slot an agent is absent, on a break, in a fixed appointment (meeting, BILA,
 * training …), on a backoffice day (e-mail only), busy with other work (ticket duty, tech issue …)
 * or available for calls.
 */
import { activityKind, DAY_END_MINUTE, DAY_START_MINUTE, SKILL_CODES, SLOT_MINUTES, type SkillCode } from "./constants";
import { CALLS_PER_PERSON_HALF_DAY, REACHABILITY_TARGET } from "./forecast";

export type Agent = { id: string; name: string; skills: string[] };
export type DayBlock = { employeeId: string; startMinute: number; endMinute: number; dutyType: string };
/** employeeId -> half-days they are absent */
export type DayAbsences = Record<string, ("AM" | "PM")[]>;

export type SlotStatus = "available" | "absent" | "break" | "fixed" | "backoffice" | "work";

/** One call-taker handles 15 calls per 4-hour half-day (the team's own rule). */
export const CALLS_PER_PERSON_HOUR = CALLS_PER_PERSON_HALF_DAY / 4;
const CALLS_PER_PERSON_SLOT = CALLS_PER_PERSON_HOUR * (SLOT_MINUTES / 60);

/** Working hours 08–16 (the 16:00 hour ends at 17:00). */
export const HOURS = Array.from({ length: (DAY_END_MINUTE - DAY_START_MINUTE) / 60 }, (_, i) => DAY_START_MINUTE / 60 + i);

/**
 * Usual share of a day's calls per hour 08–16, used to split a daily forecast. Busiest mid-morning
 * and early afternoon, quiet over lunch. Adjust once real hourly call data is available.
 */
export const HOURLY_PROFILE = [0.1, 0.14, 0.14, 0.13, 0.08, 0.09, 0.12, 0.11, 0.09];

export const SLOTS = Array.from({ length: (DAY_END_MINUTE - DAY_START_MINUTE) / SLOT_MINUTES }, (_, i) => DAY_START_MINUTE + i * SLOT_MINUTES);

/** Splits a daily total over the hours by the profile, rounding so the hours add up to the total. */
export function splitDaily(total: number): number[] {
  const raw = HOURLY_PROFILE.map((p) => total * p);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const byRemainder = raw.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r);
  for (let k = 0; rest > 0; k = (k + 1) % out.length, rest--) out[byRemainder[k].i] += 1;
  return out;
}

/** The hourly forecast to plan against: entered hours if complete, else the total split by the profile. */
export function hourlyForecast(day: { total: number; hourly: number[] } | null): number[] | null {
  if (!day) return null;
  return day.hourly.length === HOURS.length ? day.hourly : splitDaily(day.total);
}

// A break or appointment on a backoffice day counts as break/appointment; backoffice beats other work.
const PRIORITY: Record<SlotStatus, number> = { absent: 5, fixed: 4, break: 3, backoffice: 2, work: 1, available: 0 };

/** What one agent is doing in the slot starting at `minute`. */
export function statusAt(agentId: string, minute: number, absences: DayAbsences, blocks: DayBlock[]): { status: SlotStatus; dutyType?: string } {
  const half = minute < 12 * 60 ? "AM" : "PM";
  if (absences[agentId]?.includes(half)) return { status: "absent" };
  let best: { status: SlotStatus; dutyType?: string } = { status: "available" };
  for (const b of blocks) {
    if (b.employeeId !== agentId || minute < b.startMinute || minute >= b.endMinute) continue;
    const status = activityKind(b.dutyType);
    if (PRIORITY[status] > PRIORITY[best.status]) best = { status, dutyType: b.dutyType };
  }
  return best;
}

export type SlotSummary = {
  minute: number;
  available: number;
  absent: number;
  /** on any break (lunch included) */
  onBreak: number;
  /** of those, on the lunch break */
  onLunch: number;
  fixed: number;
  /** on a backoffice day (e-mail only) */
  backoffice: number;
  work: number;
  /** available agents per language */
  bySkill: Record<SkillCode, number>;
};

export function slotSummary(minute: number, agents: Agent[], absences: DayAbsences, blocks: DayBlock[]): SlotSummary {
  const s: SlotSummary = {
    minute,
    available: 0,
    absent: 0,
    onBreak: 0,
    onLunch: 0,
    fixed: 0,
    backoffice: 0,
    work: 0,
    bySkill: Object.fromEntries(SKILL_CODES.map((k) => [k, 0])) as Record<SkillCode, number>,
  };
  for (const a of agents) {
    const { status, dutyType } = statusAt(a.id, minute, absences, blocks);
    if (status === "available") {
      s.available += 1;
      for (const k of a.skills) if (k in s.bySkill) s.bySkill[k as SkillCode] += 1;
    } else if (status === "absent") s.absent += 1;
    else if (status === "break") {
      s.onBreak += 1;
      if (dutyType === "break") s.onLunch += 1;
    }
    else if (status === "fixed") s.fixed += 1;
    else if (status === "backoffice") s.backoffice += 1;
    else s.work += 1;
  }
  return s;
}

/** Language groups in the coverage card: single languages and the usual combinations. */
export const SKILL_GROUPS: SkillCode[][] = [["DE"], ["FR"], ["IT"], ["DE", "FR"], ["DE", "IT"]];

/**
 * Per language group at one slot: how many agents with all those languages are available, out of
 * how many are planned (working, i.e. not absent).
 */
export function skillCoverage(minute: number, agents: Agent[], absences: DayAbsences, blocks: DayBlock[], groups = SKILL_GROUPS) {
  return groups.map((skills) => {
    const withSkills = agents.filter((a) => skills.every((k) => a.skills.includes(k)));
    let planned = 0;
    let available = 0;
    for (const a of withSkills) {
      const { status } = statusAt(a.id, minute, absences, blocks);
      if (status !== "absent") planned += 1;
      if (status === "available") available += 1;
    }
    return { skills, planned, available };
  });
}

export type Staffing = "under" | "ok" | "over" | "unknown";

export type HourRow = {
  hour: number;
  forecast: number | null;
  done: number | null;
  /** fewest agents available in any 15-minute slot of the hour */
  minAvailable: number;
  /** average agents available over the hour */
  avgAvailable: number;
  /** calls the available agents can take in this hour */
  capacity: number;
  /** agents needed to reach the reachability target, from the forecast */
  required: number | null;
  /** minAvailable − required: below 0 = short-staffed */
  diff: number | null;
  staffing: Staffing;
  /** fewest available per language in the hour */
  bySkill: Record<SkillCode, number>;
};

/** Agents needed for this many calls in one hour at the reachability target. */
export function requiredAgents(calls: number, target = REACHABILITY_TARGET): number {
  return Math.ceil((calls * target) / CALLS_PER_PERSON_HOUR);
}

/** An hour is over-staffed when at least this many more agents are free than needed. */
const OVER_MARGIN = 2;

export function staffingOf(diff: number | null): Staffing {
  if (diff === null) return "unknown";
  if (diff < 0) return "under";
  return diff >= OVER_MARGIN ? "over" : "ok";
}

export function hourRows(
  slots: SlotSummary[],
  forecast: number[] | null,
  tasks: Record<number, number | null>
): HourRow[] {
  return HOURS.map((hour, i) => {
    const inHour = slots.filter((s) => Math.floor(s.minute / 60) === hour);
    const minAvailable = Math.min(...inHour.map((s) => s.available));
    const avgAvailable = inHour.reduce((a, s) => a + s.available, 0) / inHour.length;
    const capacity = Math.round(inHour.reduce((a, s) => a + s.available * CALLS_PER_PERSON_SLOT, 0));
    const f = forecast ? forecast[i] : null;
    const required = f === null ? null : requiredAgents(f);
    const diff = required === null ? null : minAvailable - required;
    return {
      hour,
      forecast: f,
      done: tasks[hour] ?? null,
      minAvailable,
      avgAvailable,
      capacity,
      required,
      diff,
      staffing: staffingOf(diff),
      bySkill: Object.fromEntries(SKILL_CODES.map((k) => [k, Math.min(...inHour.map((s) => s.bySkill[k]))])) as Record<SkillCode, number>,
    };
  });
}
