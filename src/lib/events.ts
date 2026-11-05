/**
 * The Einsatzplan's "Ereignisse": everything special about a day and the week after it, from
 * four sources — manual events (Event table), birthdays (Employee.birthDay/birthMonth),
 * public holidays (holidays.ts) and fixed appointments (BILA, team meeting … as shift blocks).
 * Pure function (no database) — the page loads the rows, this puts them in order.
 */
import { isFixed, type DutyType, type EventType } from "./constants";
import { nextBirthday } from "./birthday";
import { holidaysBetween } from "./holidays";
import { addDays, parseDateKey, toDateKey } from "./dates";

/** How far ahead "Demnächst" looks, in days after the selected day. */
export const AGENDA_DAYS_AHEAD = 7;

type Base = { key: string; dateKey: string; daysAway: number; startMinute: number | null; endMinute: number | null };

export type AgendaItem =
  | (Base & { kind: "event"; event: { id: string; type: EventType; title: string; note: string | null } })
  | (Base & { kind: "birthday"; name: string })
  | (Base & { kind: "holiday"; name: string })
  | (Base & { kind: "appointment"; dutyType: DutyType; people: string[]; note: string | null });

export type AgendaFilter = "all" | "events" | "info" | "birthdays" | "holidays" | "appointments";

export function matchesFilter(item: AgendaItem, filter: AgendaFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "events":
      return item.kind === "event" && item.event.type !== "info";
    case "info":
      return item.kind === "event" && item.event.type === "info";
    case "birthdays":
      return item.kind === "birthday";
    case "holidays":
      return item.kind === "holiday";
    case "appointments":
      return item.kind === "appointment";
  }
}

export function buildAgenda({
  dateKey,
  events,
  people,
  blocks,
}: {
  dateKey: string;
  events: { id: string; date: Date; startMinute: number | null; endMinute: number | null; title: string; type: string; note: string | null }[];
  people: { id: string; name: string; birthDay: number | null; birthMonth: number | null }[];
  /** the selected day's (published) shift blocks — only fixed appointments are used */
  blocks: { employeeId: string; startMinute: number; endMinute: number; dutyType: string; note: string | null }[];
}): AgendaItem[] {
  const from = parseDateKey(dateKey);
  const toKey = toDateKey(addDays(from, AGENDA_DAYS_AHEAD));
  const daysAway = (key: string) => Math.round((parseDateKey(key).getTime() - from.getTime()) / 86_400_000);
  const items: AgendaItem[] = [];

  for (const e of events) {
    const k = toDateKey(e.date);
    if (k < dateKey || k > toKey) continue;
    items.push({
      kind: "event",
      key: `event-${e.id}`,
      dateKey: k,
      daysAway: daysAway(k),
      startMinute: e.startMinute,
      endMinute: e.endMinute,
      event: { id: e.id, type: e.type as EventType, title: e.title, note: e.note },
    });
  }

  for (const p of people) {
    if (p.birthDay == null || p.birthMonth == null) continue;
    const k = toDateKey(nextBirthday(p.birthDay, p.birthMonth, from));
    if (k > toKey) continue;
    items.push({ kind: "birthday", key: `birthday-${p.id}`, dateKey: k, daysAway: daysAway(k), startMinute: null, endMinute: null, name: p.name });
  }

  for (const h of holidaysBetween(dateKey, toKey)) {
    items.push({ kind: "holiday", key: `holiday-${h.dateKey}`, dateKey: h.dateKey, daysAway: daysAway(h.dateKey), startMinute: null, endMinute: null, name: h.name });
  }

  // One entry per appointment: same type, time and note = the same meeting with several people.
  const groups = new Map<string, { dutyType: DutyType; startMinute: number; endMinute: number; note: string | null; ids: string[] }>();
  for (const b of blocks) {
    if (!isFixed(b.dutyType)) continue;
    const g = `${b.dutyType}|${b.startMinute}|${b.endMinute}|${b.note ?? ""}`;
    const group = groups.get(g) ?? { dutyType: b.dutyType as DutyType, startMinute: b.startMinute, endMinute: b.endMinute, note: b.note, ids: [] };
    group.ids.push(b.employeeId);
    groups.set(g, group);
  }
  for (const [g, a] of groups) {
    items.push({
      kind: "appointment",
      key: `appointment-${g}`,
      dateKey,
      daysAway: 0,
      startMinute: a.startMinute,
      endMinute: a.endMinute,
      dutyType: a.dutyType,
      note: a.note,
      people: a.ids.map((id) => people.find((p) => p.id === id)?.name ?? "?"),
    });
  }

  const order = { holiday: 0, birthday: 1, event: 2, appointment: 3 } as const;
  return items.sort(
    (a, b) => a.dateKey.localeCompare(b.dateKey) || (a.startMinute ?? -1) - (b.startMinute ?? -1) || order[a.kind] - order[b.kind]
  );
}

/** True when this person has their birthday on the given day. */
export function isBirthdayOn(p: { birthDay: number | null; birthMonth: number | null }, dateKey: string): boolean {
  if (p.birthDay == null || p.birthMonth == null) return false;
  return toDateKey(nextBirthday(p.birthDay, p.birthMonth, parseDateKey(dateKey))) === dateKey;
}
