/**
 * Official public holidays of the canton of Basel-Stadt — a built-in list (no external API,
 * works offline). Movable days are derived from Easter, so it works for every year.
 *
 * Source: the canton's holiday page https://www.bs.ch/themen/arbeit-und-steuern/feiertage-im-kanton-basel-stadt
 * ("neun gesetzliche Feiertage", dates listed for 2026–2031), based on the Gesetz über öffentliche
 * Ruhetage und Ladenöffnung (RLG), SG 811.100 — https://www.gesetzessammlung.bs.ch/app/de/texts_of_law/811.100.
 * Fasnacht and the Friday after Auffahrt are only (half) days off for cantonal staff, not public
 * holidays, so they are not included.
 *
 * On a holiday the Einsatzplan is blocked: no blocks can be planned, nobody is available, forecast = 0.
 * Pure functions (no database) — used on the server and in the browser.
 */

export type Holiday = { dateKey: string; name: string };

const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Easter Sunday (anonymous Gregorian / Meeus–Jones–Butcher algorithm), as a UTC date. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function fromEaster(easter: Date, offset: number): string {
  const d = new Date(easter);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const cache = new Map<number, Holiday[]>();

/** All public holidays of the year, in date order (including those on a weekend). */
export function holidaysFor(year: number): Holiday[] {
  const cached = cache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const list: Holiday[] = [
    { dateKey: key(year, 1, 1), name: "Neujahrstag" },
    { dateKey: fromEaster(easter, -2), name: "Karfreitag" },
    { dateKey: fromEaster(easter, 1), name: "Ostermontag" },
    { dateKey: key(year, 5, 1), name: "Tag der Arbeit" },
    { dateKey: fromEaster(easter, 39), name: "Auffahrt" },
    { dateKey: fromEaster(easter, 50), name: "Pfingstmontag" },
    { dateKey: key(year, 8, 1), name: "Nationalfeiertag" },
    { dateKey: key(year, 12, 25), name: "Weihnachtstag" },
    { dateKey: key(year, 12, 26), name: "Stephanstag" },
  ].sort((x, y) => x.dateKey.localeCompare(y.dateKey));
  cache.set(year, list);
  return list;
}

/** The holiday's (German) name on "YYYY-MM-DD", or null on a normal day. */
export function holidayOn(dateKey: string): string | null {
  const year = Number(dateKey.slice(0, 4));
  return holidaysFor(year).find((h) => h.dateKey === dateKey)?.name ?? null;
}

/** Holidays between two date keys, inclusive. */
export function holidaysBetween(fromKey: string, toKey: string): Holiday[] {
  const out: Holiday[] = [];
  for (let y = Number(fromKey.slice(0, 4)); y <= Number(toKey.slice(0, 4)); y++) {
    out.push(...holidaysFor(y).filter((h) => h.dateKey >= fromKey && h.dateKey <= toKey));
  }
  return out;
}
