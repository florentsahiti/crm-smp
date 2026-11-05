import { addDays, nearestWeekday, normalizeYearMonth, parseDateKey, toDateKey, weekOf, weekdaysInMonth, zurichDateKey } from "@/lib/dates";

export const PERIOD_VIEWS = ["day", "week", "month"] as const;
export type PeriodView = (typeof PERIOD_VIEWS)[number];

const isDateKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parseDateKey(v).getTime());

/**
 * The period the absences page shows, from the URL: `view=day|week|month` and `d=YYYY-MM-DD`.
 * Old links with `y` + `m` still open that month. Days are always weekdays (Mon–Fri).
 */
export function periodFromParams(params: Record<string, string | string[] | undefined>) {
  const view: PeriodView = (PERIOD_VIEWS as readonly string[]).includes(params.view as string) ? (params.view as PeriodView) : "month";
  let date: Date;
  if (isDateKey(params.d)) date = parseDateKey(params.d);
  else if (params.y && params.m) {
    const { year, month } = normalizeYearMonth(Number(params.y) || 2026, Number(params.m) || 1);
    date = new Date(Date.UTC(year, month - 1, 1));
  } else date = parseDateKey(zurichDateKey());

  if (view === "day") {
    const day = nearestWeekday(date);
    // Friday → next Monday, Monday → previous Friday
    const step = (d: Date, dir: 1 | -1) => {
      let next = addDays(d, dir);
      while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next = addDays(next, dir);
      return next;
    };
    return { view, anchor: toDateKey(day), days: [day], prev: toDateKey(step(day, -1)), next: toDateKey(step(day, 1)) };
  }
  if (view === "week") {
    const days = weekOf(date);
    return { view, anchor: toDateKey(date), days, prev: toDateKey(addDays(days[0], -7)), next: toDateKey(addDays(days[0], 7)) };
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const first = (y: number, m: number) => {
    const n = normalizeYearMonth(y, m);
    return toDateKey(new Date(Date.UTC(n.year, n.month - 1, 1)));
  };
  return { view, anchor: toDateKey(date), days: weekdaysInMonth(year, month), year, month, prev: first(year, month - 1), next: first(year, month + 1) };
}

export function periodHref(view: PeriodView, dateKey: string) {
  return `/dashboard/absences?view=${view}&d=${dateKey}`;
}
