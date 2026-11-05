/**
 * Birthdays are stored as day + month only (no year — we don't need anyone's age).
 * Shared by the Team page forms, the employee actions and the Ereignisse panel.
 */

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 29.02 allowed

export function isValidBirthday(day: number, month: number): boolean {
  return Number.isInteger(day) && Number.isInteger(month) && month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1];
}

/** "13.10." */
export function formatBirthday(day: number, month: number): string {
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.`;
}

/** "13.10", "13.10." or "3.1" -> { day, month }; "" -> null; anything else -> "invalid". */
export function parseBirthday(text: string): { day: number; month: number } | null | "invalid" {
  const value = text.trim();
  if (value === "") return null;
  const m = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(value);
  if (!m) return "invalid";
  return { day: Number(m[1]), month: Number(m[2]) };
}

/**
 * Next occurrence of a birthday on or after `from` (UTC midnight). 29.02 is celebrated on 28.02
 * in non-leap years so it still shows up.
 */
export function nextBirthday(day: number, month: number, from: Date): Date {
  for (const year of [from.getUTCFullYear(), from.getUTCFullYear() + 1]) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const d = month === 2 && day === 29 && !leap ? 28 : day;
    const date = new Date(Date.UTC(year, month - 1, d));
    if (date.getTime() >= from.getTime()) return date;
  }
  throw new Error("unreachable");
}
