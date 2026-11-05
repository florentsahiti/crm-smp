import "server-only";
import { prisma } from "@/lib/prisma";
import { CALLS_PER_PERSON_HALF_DAY, forecastCalls, keyOf, type CallForecast } from "@/lib/forecast";
import { dayCapacity, loadCallHistory, onPhone, type DayStaffing } from "@/lib/staffing";
import { holidayOn } from "@/lib/holidays";

/** manual = entered for that date · pattern = the weekday's standard value (Wochenmuster) · auto = from the call history */
export type ForecastSource = "manual" | "pattern" | "auto" | "none" | "holiday";

export type DayForecastValue = {
  /** expected calls for the day (null = no forecast possible) */
  total: number | null;
  /** expected CRM tasks (null = none entered) */
  crm: number | null;
  source: ForecastSource;
  /** the automatic forecast from the call history, for reference */
  auto: CallForecast;
  /** the manager's entry for this date, if any (with its hourly values) */
  manual: { total: number; crm: number | null; hourly: number[] } | null;
  /** the weekday's standard values, if set */
  pattern: { calls: number; crm: number | null } | null;
};

/** One day column of the forecast week editor (plain data, passed to the client). */
export type EditorDay = {
  dateKey: string;
  holiday: string | null;
  /** the manager's values for this date (empty = falls back) */
  calls: number | null;
  crm: number | null;
  /** what the day uses without a manual value, and where that comes from */
  fallback: number | null;
  fallbackCrm: number | null;
  fallbackSource: "pattern" | "auto" | "none";
  auto: number | null;
  onPhoneAM: number;
  onPhonePM: number;
  capacity: number;
};

export function editorDays(dates: Date[], forecasts: Map<string, DayForecastValue>, staffing: Map<string, DayStaffing>): EditorDay[] {
  return dates.map((date) => {
    const k = keyOf(date);
    const f = forecasts.get(k)!;
    const s = staffing.get(k)!;
    const phone = onPhone(s);
    return {
      dateKey: k,
      holiday: holidayOn(k),
      calls: f.manual?.total ?? null,
      crm: f.manual?.crm ?? null,
      fallback: f.pattern?.calls ?? f.auto.expected,
      fallbackCrm: f.pattern?.crm ?? null,
      fallbackSource: f.pattern ? "pattern" : f.auto.expected !== null ? "auto" : "none",
      auto: f.auto.expected,
      onPhoneAM: phone.am,
      onPhonePM: phone.pm,
      capacity: dayCapacity(s, CALLS_PER_PERSON_HALF_DAY),
    };
  });
}

/** The Wochenmuster as five rows Mo–Fr (calls null = not set). */
export async function loadWeekdayPattern(): Promise<{ weekday: number; calls: number | null; crm: number | null }[]> {
  const rows = await prisma.forecastWeekdayDefault.findMany();
  return [1, 2, 3, 4, 5].map((weekday) => {
    const r = rows.find((x) => x.weekday === weekday);
    return { weekday, calls: r?.calls ?? null, crm: r?.crm ?? null };
  });
}

/** 1 = Monday … 5 = Friday (0/6 = weekend) */
export const weekdayOf = (date: Date) => date.getUTCDay();

/**
 * The expected calls (and CRM tasks) for each date, in one place so the Einsatzplan (day and week),
 * the Forecast page and the Absences page agree. Order: public holiday = 0 → a manager's entry for
 * that date → the weekday's standard value (Wochenmuster) → the automatic forecast from the call history.
 */
export async function loadDayForecasts(dates: Date[]): Promise<Map<string, DayForecastValue>> {
  const [history, manual, defaults] = await Promise.all([
    loadCallHistory(),
    prisma.forecastDay.findMany({ where: { date: { in: dates } } }),
    prisma.forecastWeekdayDefault.findMany(),
  ]);
  const result = new Map<string, DayForecastValue>();
  for (const date of dates) {
    const k = keyOf(date);
    const auto = forecastCalls(date, history);
    const entered = manual.find((m) => keyOf(m.date) === k);
    const m = entered ? { total: entered.total, crm: entered.crmTotal, hourly: entered.hourly } : null;
    const d = defaults.find((x) => x.weekday === weekdayOf(date));
    const pattern = d ? { calls: d.calls, crm: d.crm } : null;
    const base = { auto, manual: m, pattern };
    if (holidayOn(k)) result.set(k, { ...base, total: 0, crm: 0, source: "holiday", manual: null });
    else if (m) result.set(k, { ...base, total: m.total, crm: m.crm ?? pattern?.crm ?? null, source: "manual" });
    else if (pattern) result.set(k, { ...base, total: pattern.calls, crm: pattern.crm, source: "pattern" });
    else if (auto.expected !== null) result.set(k, { ...base, total: auto.expected, crm: null, source: "auto" });
    else result.set(k, { ...base, total: null, crm: null, source: "none" });
  }
  return result;
}
