import { INTL_LOCALE, type Locale } from "./i18n";

/** "YYYY-MM-DD" -> "DD.MM.YYYY" (Swiss) or "DD/MM/YYYY" (English) for display. */
export function formatDateKey(key: string, locale: Locale = "de"): string {
  const [y, m, d] = key.split("-");
  return locale === "en" ? `${d}/${m}/${y}` : `${d}.${m}.${y}`;
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Weekday (Mon-Fri) dates in the given UTC month, as Date objects at UTC midnight. */
export function weekdaysInMonth(year: number, month1to12: number): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(year, month1to12 - 1, 1));
  while (cursor.getUTCMonth() === month1to12 - 1) {
    const day = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (day >= 1 && day <= 5) {
      dates.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function monthLabel(year: number, month1to12: number, locale: Locale = "de"): string {
  return new Date(Date.UTC(year, month1to12 - 1, 1)).toLocaleDateString(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" });
}

export function dayLabel(date: Date, locale: Locale = "de"): string {
  return date.toLocaleDateString(INTL_LOCALE[locale], {
    weekday: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

/** Parses "YYYY-MM-DD" as a UTC-midnight Date. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "Now", normalized to UTC midnight — every stored `date` column is UTC midnight, so any date used to query them must be too. */
export function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Nearest weekday (Mon-Fri) to today, in UTC — used as the default day for the shift planner. */
export function nearestWeekday(date: Date): Date {
  const day = date.getUTCDay();
  if (day === 0) return addDays(date, 1); // Sunday -> Monday
  if (day === 6) return addDays(date, -1); // Saturday -> Friday
  return date;
}

export function fullDayLabel(date: Date, locale: Locale = "de"): string {
  return date.toLocaleDateString(INTL_LOCALE[locale], {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Weekday (Mon-Fri) dates from start to end, inclusive, both UTC midnight. */
export function weekdaysInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.getUTCDay();
    if (day >= 1 && day <= 5) dates.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** Mon-Fri dates for the week containing `date` (UTC midnight). */
export function weekOf(date: Date): Date[] {
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = addDays(date, -daysSinceMonday);
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

/** Clamps to [1, 12], wrapping the year — used for prev/next month navigation. */
export function normalizeYearMonth(year: number, month: number): { year: number; month: number } {
  let y = year;
  let m = month;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { year: y, month: m };
}

const ZURICH_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });
const ZURICH_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Today's date in Switzerland as "YYYY-MM-DD" (the server itself runs in UTC). */
export function zurichDateKey(now = new Date()): string {
  return ZURICH_DATE.format(now);
}

/** Minutes since midnight, Swiss local time. */
export function zurichMinute(now = new Date()): number {
  const [h, m] = ZURICH_TIME.format(now).split(":").map(Number);
  return h * 60 + m;
}
