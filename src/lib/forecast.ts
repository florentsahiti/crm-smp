/**
 * Demand forecast + capacity maths. Pure functions (no database) so they can be back-tested.
 *
 * Method, kept deliberately simple and explainable:
 *   baseline = average of the same weekday last year (that week, and ±1 week)
 *   trend    = recent actual calls ÷ the same days last year  (clamped 0.5–1.5)
 *   forecast = baseline × trend
 * Capacity uses the team's own rule from the Ferien-plan: people present × 15 calls per half-day.
 */

export const CALLS_PER_PERSON_HALF_DAY = 15;
/** Assumed target — the Ferien-plan tracks reachability but no formal target was given. Change here. */
export const REACHABILITY_TARGET = 0.9;
export const YEAR_OFFSET_DAYS = 364; // same weekday, same week-of-year, one year earlier
const TREND_WINDOW_DAYS = 40; // ≈ 8 working weeks of actuals
const MIN_TREND_DAYS = 10;

const DAY_MS = 86_400_000;
export const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const shift = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

/** date key -> calls received that day */
export type CallHistory = Map<string, number>;

export type CallForecast = {
  expected: number | null;
  lastYear: number | null;
  trend: number;
  basis: "last-year" | "recent-weekdays" | "none";
};

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function trendFactor(date: Date, history: CallHistory): number {
  const cutoff = keyOf(date);
  const recent = [...history.keys()].filter((k) => k < cutoff).sort().reverse().slice(0, TREND_WINDOW_DAYS);
  let actual = 0;
  let previous = 0;
  let used = 0;
  for (const k of recent) {
    const last = history.get(keyOf(shift(new Date(`${k}T00:00:00Z`), -YEAR_OFFSET_DAYS)));
    if (last === undefined) continue;
    actual += history.get(k)!;
    previous += last;
    used += 1;
  }
  if (used < MIN_TREND_DAYS || previous === 0) return 1;
  return Math.min(1.5, Math.max(0.5, actual / previous));
}

export function forecastCalls(date: Date, history: CallHistory): CallForecast {
  const anchor = shift(date, -YEAR_OFFSET_DAYS);
  const lastYear = history.get(keyOf(anchor)) ?? null;
  const neighbours = [-7, 0, 7].map((o) => history.get(keyOf(shift(anchor, o)))).filter((v): v is number => v !== undefined);
  const baseline = mean(neighbours);
  const trend = trendFactor(date, history);

  if (baseline !== null) {
    return { expected: Math.round(baseline * trend), lastYear, trend, basis: "last-year" };
  }

  // No prior-year data: fall back to the latest same weekdays we have actuals for.
  const weekday = date.getUTCDay();
  const recentSame = [...history.keys()]
    .filter((k) => k < keyOf(date) && new Date(`${k}T00:00:00Z`).getUTCDay() === weekday)
    .sort()
    .reverse()
    .slice(0, 8)
    .map((k) => history.get(k)!);
  const fallback = mean(recentSame);
  return fallback === null
    ? { expected: null, lastYear, trend: 1, basis: "none" }
    : { expected: Math.round(fallback), lastYear, trend: 1, basis: "recent-weekdays" };
}

export function phoneCapacity(presentAM: number, presentPM: number): number {
  return (presentAM + presentPM) * CALLS_PER_PERSON_HALF_DAY;
}

/** Share of expected calls the team can pick up with this capacity (capped at 100%). */
export function expectedReachability(capacity: number, expectedCalls: number | null): number | null {
  if (expectedCalls === null || expectedCalls <= 0) return null;
  return Math.min(1, capacity / expectedCalls);
}

/** People needed per half-day to hit the target for this many expected calls. */
export function requiredPerHalfDay(expectedCalls: number | null, target = REACHABILITY_TARGET): number | null {
  if (expectedCalls === null) return null;
  return Math.ceil((expectedCalls * target) / (2 * CALLS_PER_PERSON_HALF_DAY));
}

export type Backtest = {
  days: number;
  /** mean absolute % error of the forecast */
  mape: number;
  /** average signed error, % (positive = forecast too high) */
  bias: number;
  /** same measure for "just copy last year", to show what the trend adjustment buys */
  naiveMape: number;
};

/** Forecast each recent day using only data from before that day, and compare with what happened. */
export function backtest(history: CallHistory, lastDays = 40): Backtest | null {
  const days = [...history.keys()]
    .filter((k) => history.has(keyOf(shift(new Date(`${k}T00:00:00Z`), -YEAR_OFFSET_DAYS))))
    .sort()
    .slice(-lastDays);
  let abs = 0;
  let signed = 0;
  let naiveAbs = 0;
  let n = 0;
  for (const k of days) {
    const date = new Date(`${k}T00:00:00Z`);
    const actual = history.get(k)!;
    // only data from before day k — no peeking (last year's days are all earlier, so they stay)
    const past: CallHistory = new Map([...history].filter(([hk]) => hk < k));
    const f = forecastCalls(date, past).expected;
    const naive = history.get(keyOf(shift(date, -YEAR_OFFSET_DAYS)));
    if (f === null || naive === undefined || actual === 0) continue;
    abs += Math.abs(f - actual) / actual;
    signed += (f - actual) / actual;
    naiveAbs += Math.abs(naive - actual) / actual;
    n += 1;
  }
  if (n === 0) return null;
  return { days: n, mape: (abs / n) * 100, bias: (signed / n) * 100, naiveMape: (naiveAbs / n) * 100 };
}
