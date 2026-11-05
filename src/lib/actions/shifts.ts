"use server";

import { UserError, guard } from "@/lib/action-result";
import { tr } from "@/lib/i18n/server";
import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, verifySession } from "@/lib/dal";
import {
  ABSENCE_TYPES,
  BACKOFFICE,
  BREAK_RULES,
  BREAK_TYPES,
  MAX_CONCURRENT_BREAKS,
  SLOT_MINUTES,
  DAY_END_MINUTE,
  DAY_START_MINUTE,
  DUTY_TYPE_LABELS,
  DUTY_TYPES,
  FIXED_TYPES,
  LOCATIONS,
  OTHER,
  OTHER_LABEL_MAX,
  SCHEDULER_ROLES,
  isBreak,
  isFixed,
  isScheduler,
  type BreakType,
} from "@/lib/constants";
import { minutesToTime, toDateKey, weekdaysInRange, zurichDateKey } from "@/lib/dates";
import { holidayOn } from "@/lib/holidays";
import { loadDisplayName } from "@/lib/names-server";

const Minute = z.number().int().min(DAY_START_MINUTE).max(DAY_END_MINUTE).multipleOf(15);

const CreateShiftBlockSchema = z.object({
  employeeId: z.string().min(1),
  date: z.iso.date(),
  startMinute: Minute,
  endMinute: Minute,
  dutyType: z.enum(DUTY_TYPES),
  location: z.enum(LOCATIONS).nullable(),
  /** free-text label of a "Sonstiges" block */
  note: z.string().trim().max(OTHER_LABEL_MAX).optional(),
});

export type CreateShiftBlockInput = z.infer<typeof CreateShiftBlockSchema>;

const dayOf = (dateKey: string) => new Date(`${dateKey}T00:00:00.000Z`);

function refresh() {
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/my-schedule");
  revalidatePath("/dashboard/absences");
  revalidatePath("/dashboard/forecast");
}

function halvesOf(startMinute: number, endMinute: number): ("AM" | "PM")[] {
  const halves: ("AM" | "PM")[] = [];
  if (startMinute < 12 * 60) halves.push("AM");
  if (endMinute > 12 * 60) halves.push("PM");
  return halves;
}

/** Public holidays (Basel-Stadt) are blocked: nothing can be planned on them. */
export async function assertNotHoliday(date: Date) {
  const holiday = holidayOn(toDateKey(date));
  if (holiday) {
    throw new UserError(await tr("{date} ist ein Feiertag ({name}) – an diesem Tag kann nichts geplant werden.", { date: toDateKey(date).split("-").reverse().join("."), name: await tr(holiday) }));
  }
}

export async function assertNotAbsent(employeeId: string, date: Date, startMinute: number, endMinute: number) {
  const absences = await prisma.absenceEntry.findMany({
    where: { employeeId, date, halfDay: { in: halvesOf(startMinute, endMinute) } },
  });
  if (absences.length > 0) {
    throw new UserError(await tr("Für einen Teil dieser Zeit ist eine Abwesenheit erfasst – entfernen Sie zuerst die Abwesenheit, falls dies nicht stimmt."));
  }
}

/**
 * Breaks follow the old Einsatzplan: one 15-minute break in the morning, one lunch break of
 * 30–60 minutes between 12 and 14, one 15-minute break in the afternoon. A break may sit inside
 * ordinary work (e.g. ticket duty) but never overlaps a fixed appointment (locked) or another break.
 */
async function assertValidBreak(
  type: BreakType,
  employeeId: string,
  date: Date,
  startMinute: number,
  endMinute: number,
  ignoreId?: string
) {
  const rule = BREAK_RULES[type];
  const label = await tr(DUTY_TYPE_LABELS[type]);
  const length = endMinute - startMinute;
  if (!rule.durations.includes(length)) {
    throw new UserError(await tr("{label}: Dauer {d} Minuten.", { label, d: rule.durations.join(" / ") }));
  }
  if (startMinute < rule.from || endMinute > rule.to) {
    throw new UserError(await tr("{label}: nur zwischen {from} und {to}.", { label, from: minutesToTime(rule.from), to: minutesToTime(rule.to) }));
  }
  const sameDay = await prisma.shiftBlock.findMany({
    where: { employeeId, date, draft: false, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
  });
  if (sameDay.some((b) => b.dutyType === type)) {
    throw new UserError(await tr("{label} ist an diesem Tag bereits eingetragen – verschieben Sie die bestehende.", { label }));
  }
  const clash = sameDay.find((b) => b.startMinute < endMinute && startMinute < b.endMinute && (isFixed(b.dutyType) || isBreak(b.dutyType)));
  if (clash) {
    throw new UserError(
      await tr("Die Pause überschneidet sich mit «{what}» ({from}–{to}).", {
        what: await tr(DUTY_TYPE_LABELS[clash.dutyType as keyof typeof DUTY_TYPE_LABELS] ?? clash.dutyType),
        from: minutesToTime(clash.startMinute),
        to: minutesToTime(clash.endMinute),
      })
    );
  }
}

/** "12:00–12:30, 13:15–13:30" from a list of 15-minute slot starts. */
function slotRanges(slots: number[]): string {
  const ranges: [number, number][] = [];
  for (const m of slots) {
    const last = ranges.at(-1);
    if (last && last[1] === m) last[1] = m + SLOT_MINUTES;
    else ranges.push([m, m + SLOT_MINUTES]);
  }
  return ranges.map(([a, b]) => `${minutesToTime(a)}–${minutesToTime(b)}`).join(", ");
}

/**
 * Team rule: at most MAX_CONCURRENT_BREAKS employees on a break at the same time. Only employees'
 * breaks count (managers are not call-takers). An employee who would be one too many is refused;
 * a manager may still plan it (for exceptions) and gets a warning back.
 */
async function checkBreakLimit(
  actorIsManager: boolean,
  employeeId: string,
  date: Date,
  startMinute: number,
  endMinute: number
): Promise<string | null> {
  const person = await prisma.employee.findUnique({ where: { id: employeeId }, select: { role: true } });
  if (person?.role !== "employee") return null;

  const others = await prisma.shiftBlock.findMany({
    where: {
      date,
      draft: false,
      dutyType: { in: [...BREAK_TYPES] },
      employeeId: { not: employeeId },
      employee: { role: "employee", active: true },
      startMinute: { lt: endMinute },
      endMinute: { gt: startMinute },
    },
  });
  const full: number[] = [];
  for (let m = startMinute; m < endMinute; m += SLOT_MINUTES) {
    const onBreak = new Set(others.filter((b) => b.startMinute <= m && m < b.endMinute).map((b) => b.employeeId)).size;
    if (onBreak >= MAX_CONCURRENT_BREAKS) full.push(m);
  }
  if (full.length === 0) return null;

  const params = { max: MAX_CONCURRENT_BREAKS, times: slotRanges(full) };
  if (!actorIsManager) {
    throw new UserError(
      await tr("Maximal {max} Personen gleichzeitig in Pause – um {times} sind bereits {max} in Pause. Bitte wählen Sie eine andere Zeit.", params)
    );
  }
  return tr("Hinweis: Um {times} sind damit mehr als {max} Personen gleichzeitig in Pause.", params);
}

/** Managers can create any block for anyone; employees can only add their own breaks. */
async function createShiftBlockImpl(input: CreateShiftBlockInput): Promise<{ warning: string | null }> {
  const session = await verifySession();
  const { employeeId, date, startMinute, endMinute, dutyType, location, note } = CreateShiftBlockSchema.parse(input);

  const isSelfBreak = isBreak(dutyType) && employeeId === session.userId;
  if (!isScheduler(session.role) && !isSelfBreak) {
    throw new UserError(await tr("Mitarbeitende können nur ihre eigenen Pausen eintragen. Alle anderen Änderungen machen die Manager."));
  }
  if (endMinute <= startMinute) {
    throw new UserError(await tr("Die Endzeit muss nach der Startzeit liegen."));
  }
  if (dutyType === OTHER && !note) throw new UserError(await tr("Bitte eine Bezeichnung für «Sonstiges» eingeben."));

  const parsedDate = dayOf(date);
  await assertNotHoliday(parsedDate);
  await assertNotAbsent(employeeId, parsedDate, startMinute, endMinute);
  let warning: string | null = null;
  if (isBreak(dutyType)) {
    await assertValidBreak(dutyType, employeeId, parsedDate, startMinute, endMinute);
    warning = await checkBreakLimit(isScheduler(session.role), employeeId, parsedDate, startMinute, endMinute);
  }

  await prisma.shiftBlock.create({
    data: { employeeId, date: parsedDate, startMinute, endMinute, dutyType, location, note: dutyType === OTHER ? note : null, createdById: session.userId },
  });

  refresh();
  return { warning };
}

const UpdateShiftBlockSchema = z.object({
  id: z.string().min(1),
  dutyType: z.enum(DUTY_TYPES).optional(),
  location: z.enum(LOCATIONS).nullable().optional(),
  startMinute: Minute.optional(),
  endMinute: Minute.optional(),
  note: z.string().trim().max(OTHER_LABEL_MAX).optional(),
});

/** Managers change anything; employees can only move their own breaks. */
async function updateShiftBlockImpl(input: z.infer<typeof UpdateShiftBlockSchema>): Promise<{ warning: string | null }> {
  const session = await verifySession();
  const { id, ...changes } = UpdateShiftBlockSchema.parse(input);
  const block = await prisma.shiftBlock.findUnique({ where: { id } });
  if (!block) throw new UserError(await tr("Dieser Eintrag existiert nicht mehr."));

  const ownBreak = block.employeeId === session.userId && isBreak(block.dutyType);
  if (!isScheduler(session.role)) {
    if (!ownBreak || (changes.dutyType && changes.dutyType !== block.dutyType) || changes.location !== undefined || changes.note !== undefined) {
      throw new UserError(await tr("Mitarbeitende können nur ihre eigenen Pausen verschieben."));
    }
  }

  const next = {
    dutyType: changes.dutyType ?? block.dutyType,
    startMinute: changes.startMinute ?? block.startMinute,
    endMinute: changes.endMinute ?? block.endMinute,
  };
  if (next.endMinute <= next.startMinute) throw new UserError(await tr("Die Endzeit muss nach der Startzeit liegen."));
  // the note is the label of a "Sonstiges" block; other blocks keep theirs (e.g. a fixed appointment's note)
  const note = next.dutyType === OTHER ? (changes.note ?? (block.dutyType === OTHER ? block.note : null)) : block.dutyType === OTHER ? null : block.note;
  if (next.dutyType === OTHER && !note) throw new UserError(await tr("Bitte eine Bezeichnung für «Sonstiges» eingeben."));
  await assertNotHoliday(block.date);
  const moved = next.startMinute !== block.startMinute || next.endMinute !== block.endMinute;
  if (moved) await assertNotAbsent(block.employeeId, block.date, next.startMinute, next.endMinute);
  let warning: string | null = null;
  if (isBreak(next.dutyType) && !block.draft && (moved || next.dutyType !== block.dutyType)) {
    await assertValidBreak(next.dutyType, block.employeeId, block.date, next.startMinute, next.endMinute, block.id);
    warning = await checkBreakLimit(isScheduler(session.role), block.employeeId, block.date, next.startMinute, next.endMinute);
  }

  await prisma.shiftBlock.update({
    where: { id },
    data: { ...next, note, ...(changes.location !== undefined ? { location: changes.location } : {}) },
  });

  refresh();
  return { warning };
}

async function deleteShiftBlockImpl(id: string) {
  const session = await verifySession();
  const blockId = z.string().min(1).parse(id);
  const block = await prisma.shiftBlock.findUnique({ where: { id: blockId } });
  if (!block) return;

  const isOwnBreak = isBreak(block.dutyType) && block.employeeId === session.userId;
  if (!isScheduler(session.role) && !isOwnBreak) {
    throw new UserError(await tr("Nur Manager können diesen Eintrag entfernen."));
  }

  await prisma.shiftBlock.delete({ where: { id: blockId } });

  refresh();
}

const FixedAppointmentSchema = z.object({
  /** a fixed appointment, or OTHER = a free-text activity ("Tätigkeit eintragen") */
  dutyType: z.enum([...FIXED_TYPES, OTHER]),
  date: z.iso.date(),
  startMinute: Minute,
  endMinute: Minute,
  employeeIds: z.array(z.string().min(1)).min(1, { error: "Bitte mindestens eine Person auswählen." }),
  note: z.string().trim().max(200).optional(),
});

export type FixedAppointmentResult =
  | { ok: true; created: number; absent: string[]; overlaps: string[] }
  | { ok: false; error: string };

/**
 * Books a fixed appointment (team meeting, BILA, training, internal meeting …) for several people
 * at once. It locks that time: the people count as unavailable and cannot put a break there.
 * People who are absent are skipped; overlaps with existing entries are reported, not removed.
 */
export async function createFixedAppointment(input: z.input<typeof FixedAppointmentSchema>): Promise<FixedAppointmentResult> {
  const session = await requireRole(SCHEDULER_ROLES);
  const parsed = FixedAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: await tr(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.") };
  const { dutyType, date, startMinute, endMinute, employeeIds, note } = parsed.data;
  if (endMinute <= startMinute) return { ok: false, error: await tr("Die Endzeit muss nach der Startzeit liegen.") };
  if (dutyType === OTHER && !note) return { ok: false, error: await tr("Bitte eingeben, was die Mitarbeitenden machen.") };
  if (dutyType === OTHER && note!.length > OTHER_LABEL_MAX) return { ok: false, error: await tr("Höchstens {n} Zeichen.", { n: OTHER_LABEL_MAX }) };

  const day = dayOf(date);
  const holiday = holidayOn(date);
  if (holiday) return { ok: false, error: await tr("{date} ist ein Feiertag ({name}) – an diesem Tag kann nichts geplant werden.", { date: date.split("-").reverse().join("."), name: await tr(holiday) }) };
  const halves = halvesOf(startMinute, endMinute);
  const [people, absences, existing] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: employeeIds } } }),
    prisma.absenceEntry.findMany({ where: { date: day, employeeId: { in: employeeIds }, halfDay: { in: halves } } }),
    prisma.shiftBlock.findMany({
      where: { date: day, draft: false, employeeId: { in: employeeIds }, startMinute: { lt: endMinute }, endMinute: { gt: startMinute } },
    }),
  ]);
  const absentIds = new Set(absences.map((a) => a.employeeId));
  const targets = people.filter((p) => !absentIds.has(p.id));

  await prisma.shiftBlock.createMany({
    data: targets.map((p) => ({
      employeeId: p.id,
      date: day,
      startMinute,
      endMinute,
      dutyType,
      location: null,
      note: note || null,
      createdById: session.userId,
    })),
  });
  refresh();
  const show = await loadDisplayName();
  const nameOf = (id: string) => show(people.find((p) => p.id === id)?.name ?? id);
  return {
    ok: true,
    created: targets.length,
    absent: people.filter((p) => absentIds.has(p.id)).map((p) => show(p.name)),
    overlaps: [...new Set(existing.filter((b) => !absentIds.has(b.employeeId)).map((b) => nameOf(b.employeeId)))],
  };
}

/** A block removed by an absence entered from the schedule, kept on the absence to restore it. */
type ClearedBlock = { startMinute: number; endMinute: number; dutyType: string; location: string | null; note: string | null; createdById: string };

/** The person's (published) blocks in these time windows, grouped by day: what `clearBlocks` is about to remove. */
async function blocksToClear(employeeId: string, windows: { day: Date; from: number; to: number }[]) {
  const blocks = await prisma.shiftBlock.findMany({
    where: { employeeId, draft: false, OR: windows.map((w) => ({ date: w.day, startMinute: { lt: w.to }, endMinute: { gt: w.from } })) },
  });
  const byDay = new Map<string, ClearedBlock[]>();
  for (const b of blocks) {
    const k = toDateKey(b.date);
    byDay.set(k, [...(byDay.get(k) ?? []), { startMinute: b.startMinute, endMinute: b.endMinute, dutyType: b.dutyType, location: b.location, note: b.note, createdById: b.createdById }]);
  }
  return byDay;
}

const ShortNoticeAbsenceSchema = z.object({
  employeeId: z.string().min(1),
  date: z.iso.date(),
  halfDay: z.enum(["AM", "PM", "FULL"]),
  type: z.enum(ABSENCE_TYPES),
  clearBlocks: z.boolean(),
  note: z.string().trim().max(200).optional(),
});

/**
 * Short-notice absence from the schedule (e.g. called in sick): records the absence for the
 * half-day(s) and, if asked, removes that person's entries in that time so the plan and the
 * capacity numbers are right immediately.
 */
export async function reportShortNoticeAbsence(input: z.input<typeof ShortNoticeAbsenceSchema>) {
  const session = await requireRole(SCHEDULER_ROLES);
  const { employeeId, date, halfDay, type, clearBlocks, note } = ShortNoticeAbsenceSchema.parse(input);
  const day = dayOf(date);
  const halves: ("AM" | "PM")[] = halfDay === "FULL" ? ["AM", "PM"] : [halfDay];
  const from = halves.includes("AM") ? DAY_START_MINUTE : 12 * 60;
  const to = halves.includes("PM") ? DAY_END_MINUTE : 12 * 60;
  // the removed blocks are kept on the (first) absence row, so cancelling the absence can restore them
  const cleared = clearBlocks ? ((await blocksToClear(employeeId, [{ day, from, to }])).get(date) ?? []) : [];
  const keep = (h: string) => (h === halves[0] && cleared.length > 0 ? { clearedBlocks: cleared } : {});

  await prisma.$transaction([
    ...halves.map((h) =>
      prisma.absenceEntry.upsert({
        where: { employeeId_date_halfDay: { employeeId, date: day, halfDay: h } },
        update: { type, status: "approved", ...(note ? { note } : {}), ...keep(h) },
        create: { employeeId, date: day, halfDay: h, type, status: "approved", note: note || "Kurzfristig erfasst", createdById: session.userId, ...keep(h) },
      })
    ),
    ...(clearBlocks
      ? [prisma.shiftBlock.deleteMany({ where: { employeeId, date: day, startMinute: { lt: to }, endMinute: { gt: from } } })]
      : []),
  ]);

  refresh();
}

/** Longest range that can be entered at once (a longer absence is entered in parts). */
const MAX_RANGE_DAYS = 60;

const AbsenceRangeSchema = z.object({
  employeeId: z.string().min(1),
  from: z.iso.date(),
  to: z.iso.date(),
  type: z.enum(ABSENCE_TYPES),
  /** first day only in the afternoon (e.g. went home sick at noon) */
  firstDayPmOnly: z.boolean().default(false),
  /** last day only in the morning (back at work in the afternoon) */
  lastDayAmOnly: z.boolean().default(false),
  clearBlocks: z.boolean(),
  note: z.string().trim().max(200).optional(),
});

/**
 * Absence for a date range (sick from … to …, vacation …), from the schedule: one absence per
 * weekday in the range — public holidays are skipped — as AM + PM rows like a single day.
 * The first/last day can be a half day. Optionally removes that person's entries in that time.
 */
async function reportAbsenceRangeImpl(input: z.input<typeof AbsenceRangeSchema>): Promise<{ days: number }> {
  const session = await requireRole(SCHEDULER_ROLES);
  const parsed = AbsenceRangeSchema.safeParse(input);
  if (!parsed.success) throw new UserError(await tr("Ungültige Eingabe."));
  const { employeeId, from, to, type, firstDayPmOnly, lastDayAmOnly, clearBlocks, note } = parsed.data;
  if (to < from) throw new UserError(await tr("Das Enddatum darf nicht vor dem Startdatum liegen."));
  const start = dayOf(from);
  const end = dayOf(to);
  if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > MAX_RANGE_DAYS) {
    throw new UserError(await tr("Höchstens {n} Tage auf einmal erfassen.", { n: MAX_RANGE_DAYS }));
  }
  if (from === to && firstDayPmOnly && lastDayAmOnly) {
    throw new UserError(await tr("Für einen einzelnen Tag entweder «nur NM» oder «nur VM» wählen."));
  }

  const days = weekdaysInRange(start, end).filter((d) => !holidayOn(toDateKey(d)));
  if (days.length === 0) throw new UserError(await tr("Im gewählten Zeitraum gibt es keinen Arbeitstag."));

  const plan = days.map((day) => {
    const k = toDateKey(day);
    const halves: ("AM" | "PM")[] = k === from && firstDayPmOnly ? ["PM"] : k === to && lastDayAmOnly ? ["AM"] : ["AM", "PM"];
    return { day, k, halves, fromMinute: halves.includes("AM") ? DAY_START_MINUTE : 12 * 60, toMinute: halves.includes("PM") ? DAY_END_MINUTE : 12 * 60 };
  });
  const cleared = clearBlocks ? await blocksToClear(employeeId, plan.map((p) => ({ day: p.day, from: p.fromMinute, to: p.toMinute }))) : new Map<string, ClearedBlock[]>();

  const ops = plan.flatMap(({ day, k, halves, fromMinute, toMinute }) => {
    const dayCleared = cleared.get(k) ?? [];
    const keep = (h: string) => (h === halves[0] && dayCleared.length > 0 ? { clearedBlocks: dayCleared } : {});
    return [
      ...halves.map((h) =>
        prisma.absenceEntry.upsert({
          where: { employeeId_date_halfDay: { employeeId, date: day, halfDay: h } },
          update: { type, status: "approved", ...(note ? { note } : {}), ...keep(h) },
          create: { employeeId, date: day, halfDay: h, type, status: "approved", note: note || "Kurzfristig erfasst", createdById: session.userId, ...keep(h) },
        })
      ),
      ...(clearBlocks
        ? [prisma.shiftBlock.deleteMany({ where: { employeeId, date: day, startMinute: { lt: toMinute }, endMinute: { gt: fromMinute } } })]
        : []),
    ];
  });
  await prisma.$transaction(ops);

  refresh();
  return { days: days.length };
}

export async function reportAbsenceRange(input: z.input<typeof AbsenceRangeSchema>) {
  return guard(() => reportAbsenceRangeImpl(input));
}

const CancelAbsenceSchema = z.object({
  employeeId: z.string().min(1),
  date: z.iso.date(),
  /** "day" = only this day; "period" = the whole run of working days with the same absence around it */
  scope: z.enum(["day", "period"]),
});

const addDaysUTC = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** The working days around `date` (both directions) with an absence of this type: the absence "period". */
async function absencePeriod(employeeId: string, date: Date, type: string): Promise<Date[]> {
  const window = await prisma.absenceEntry.findMany({
    where: { employeeId, type, date: { gte: addDaysUTC(date, -MAX_RANGE_DAYS), lte: addDaysUTC(date, MAX_RANGE_DAYS) } },
    select: { date: true },
  });
  const has = new Set(window.map((a) => toDateKey(a.date)));
  const days = [date];
  for (const step of [-1, 1]) {
    let d = addDaysUTC(date, step);
    for (let i = 0; i < MAX_RANGE_DAYS; i++, d = addDaysUTC(d, step)) {
      const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
      if (weekend || holidayOn(toDateKey(d))) continue; // weekends and holidays don't end a period
      if (!has.has(toDateKey(d))) break;
      days.push(d);
    }
  }
  return days.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Cancels an absence entered by mistake (e.g. "Krank" for the wrong person): removes it for the day
 * or the whole period and puts back the blocks that were removed when it was entered.
 */
async function cancelAbsenceImpl(input: z.input<typeof CancelAbsenceSchema>): Promise<{ days: number; restored: number }> {
  await requireRole(SCHEDULER_ROLES);
  const parsed = CancelAbsenceSchema.safeParse(input);
  if (!parsed.success) throw new UserError(await tr("Ungültige Eingabe."));
  const { employeeId, date, scope } = parsed.data;
  const day = dayOf(date);
  const onDay = await prisma.absenceEntry.findFirst({ where: { employeeId, date: day } });
  if (!onDay) throw new UserError(await tr("An diesem Tag ist keine Abwesenheit erfasst."));

  const days = scope === "day" ? [day] : await absencePeriod(employeeId, day, onDay.type);
  const entries = await prisma.absenceEntry.findMany({ where: { employeeId, type: onDay.type, date: { in: days } } });
  const restore = entries.flatMap((e) => ((e.clearedBlocks as ClearedBlock[] | null) ?? []).map((b) => ({ ...b, date: e.date })));
  // blocks only go back where nothing else is in the way (another absence, the same block added again since)
  const [otherAbsences, existing] = await Promise.all([
    prisma.absenceEntry.findMany({ where: { employeeId, date: { in: days }, id: { notIn: entries.map((e) => e.id) } } }),
    prisma.shiftBlock.findMany({ where: { employeeId, date: { in: days } } }),
  ]);
  const free = (b: (typeof restore)[number]) =>
    !otherAbsences.some((a) => a.date.getTime() === b.date.getTime() && halvesOf(b.startMinute, b.endMinute).some((h) => a.halfDay === h || a.halfDay === "FULL")) &&
    !existing.some((x) => x.date.getTime() === b.date.getTime() && x.dutyType === b.dutyType && x.startMinute < b.endMinute && x.endMinute > b.startMinute);
  const toCreate = restore.filter(free);

  await prisma.$transaction([
    prisma.absenceEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } }),
    prisma.shiftBlock.createMany({
      data: toCreate.map((b) => ({ employeeId, date: b.date, startMinute: b.startMinute, endMinute: b.endMinute, dutyType: b.dutyType, location: b.location, note: b.note, createdById: b.createdById })),
    }),
  ]);
  refresh();
  return { days: new Set(entries.map((e) => toDateKey(e.date))).size, restored: toCreate.length };
}

export async function cancelAbsence(input: z.input<typeof CancelAbsenceSchema>) {
  return guard(() => cancelAbsenceImpl(input));
}

const BackofficeSchema = z.object({
  employeeId: z.string().min(1),
  from: z.iso.date(),
  to: z.iso.date(),
  note: z.string().trim().max(200).optional(),
});

/** The weekdays from..to without public holidays, after the same checks as an absence range. */
async function workdaysOf(from: string, to: string): Promise<Date[]> {
  if (to < from) throw new UserError(await tr("Das Enddatum darf nicht vor dem Startdatum liegen."));
  const start = dayOf(from);
  const end = dayOf(to);
  if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > MAX_RANGE_DAYS) {
    throw new UserError(await tr("Höchstens {n} Tage auf einmal erfassen.", { n: MAX_RANGE_DAYS }));
  }
  const days = weekdaysInRange(start, end).filter((d) => !holidayOn(toDateKey(d)));
  if (days.length === 0) throw new UserError(await tr("Im gewählten Zeitraum gibt es keinen Arbeitstag."));
  return days;
}

/**
 * Backoffice (e-mail only, no calls) for one day or a range: one whole-day `backoffice` block per
 * working day. The person works, but is not counted as phone capacity. Days on which the person
 * is absent are skipped; an existing backoffice day is replaced (e.g. to change the note).
 */
async function setBackofficeImpl(input: z.input<typeof BackofficeSchema>): Promise<{ days: number; skipped: number }> {
  const session = await requireRole(SCHEDULER_ROLES);
  const parsed = BackofficeSchema.safeParse(input);
  if (!parsed.success) throw new UserError(await tr("Ungültige Eingabe."));
  const { employeeId, from, to, note } = parsed.data;
  const days = await workdaysOf(from, to);

  const absences = await prisma.absenceEntry.findMany({ where: { employeeId, date: { in: days } } });
  const absent = new Set(absences.map((a) => toDateKey(a.date)));
  const targets = days.filter((d) => !absent.has(toDateKey(d)));
  if (targets.length === 0) throw new UserError(await tr("Die Person ist an diesen Tagen abwesend."));

  await prisma.$transaction([
    prisma.shiftBlock.deleteMany({ where: { employeeId, date: { in: targets }, dutyType: BACKOFFICE } }),
    prisma.shiftBlock.createMany({
      data: targets.map((date) => ({
        employeeId,
        date,
        startMinute: DAY_START_MINUTE,
        endMinute: DAY_END_MINUTE,
        dutyType: BACKOFFICE,
        location: null,
        note: note || null,
        createdById: session.userId,
      })),
    }),
  ]);
  refresh();
  return { days: targets.length, skipped: days.length - targets.length };
}

/** Removes the backoffice days from..to again — the person counts as phone capacity. */
async function removeBackofficeImpl(input: z.input<typeof BackofficeSchema>): Promise<{ days: number }> {
  await requireRole(SCHEDULER_ROLES);
  const parsed = BackofficeSchema.safeParse(input);
  if (!parsed.success) throw new UserError(await tr("Ungültige Eingabe."));
  const { employeeId, from, to } = parsed.data;
  if (to < from) throw new UserError(await tr("Das Enddatum darf nicht vor dem Startdatum liegen."));
  const { count } = await prisma.shiftBlock.deleteMany({
    where: { employeeId, dutyType: BACKOFFICE, date: { gte: dayOf(from), lte: dayOf(to) } },
  });
  refresh();
  return { days: count };
}

export async function setBackoffice(input: z.input<typeof BackofficeSchema>) {
  return guard(() => setBackofficeImpl(input));
}

export async function removeBackoffice(input: z.input<typeof BackofficeSchema>) {
  return guard(() => removeBackofficeImpl(input));
}

const WorkModeSchema = z.object({
  employeeId: z.string().min(1),
  date: z.iso.date(),
  mode: z.enum(["HO", "BO"]),
  on: z.boolean(),
});

/**
 * The HO / BO pills: home office (a `HomeOfficeDay`) or backoffice (a whole-day `backoffice` block,
 * so the phone capacity stays right) for one day, switched on or off. Managers set it for anyone;
 * employees only for themselves and only from today on.
 */
async function setWorkModeImpl(input: z.input<typeof WorkModeSchema>) {
  const session = await verifySession();
  const parsed = WorkModeSchema.safeParse(input);
  if (!parsed.success) throw new UserError(await tr("Ungültige Eingabe."));
  const { employeeId, date, mode, on } = parsed.data;
  if (!isScheduler(session.role)) {
    if (employeeId !== session.userId) throw new UserError(await tr("Sie können nur Ihre eigenen Tage ändern."));
    if (date < zurichDateKey()) throw new UserError(await tr("Vergangene Tage können nicht mehr geändert werden."));
  }
  const day = dayOf(date);
  if (on) {
    await assertNotHoliday(day);
    const absent = await prisma.absenceEntry.count({ where: { employeeId, date: day, status: { not: "rejected" } } });
    if (absent > 0) throw new UserError(await tr("Die Person ist an diesem Tag abwesend."));
  }

  if (mode === "HO") {
    if (on) {
      await prisma.homeOfficeDay.upsert({
        where: { employeeId_date: { employeeId, date: day } },
        update: {},
        create: { employeeId, date: day, createdById: session.userId },
      });
    } else {
      await prisma.homeOfficeDay.deleteMany({ where: { employeeId, date: day } });
    }
  } else if (on) {
    const existing = await prisma.shiftBlock.count({ where: { employeeId, date: day, dutyType: BACKOFFICE } });
    if (existing === 0) {
      await prisma.shiftBlock.create({
        data: { employeeId, date: day, startMinute: DAY_START_MINUTE, endMinute: DAY_END_MINUTE, dutyType: BACKOFFICE, location: null, createdById: session.userId },
      });
    }
  } else {
    await prisma.shiftBlock.deleteMany({ where: { employeeId, date: day, dutyType: BACKOFFICE } });
  }
  refresh();
}

export async function setWorkMode(input: z.input<typeof WorkModeSchema>) {
  return guard(() => setWorkModeImpl(input));
}

const BilaSchema = z.object({
  employeeId: z.string().min(1),
  date: z.iso.date(),
  startMinute: Minute,
  endMinute: Minute,
  note: z.string().trim().max(200).optional(),
  /** the manager who books it takes part too (block on both rows) */
  includeMe: z.boolean(),
});

/**
 * A BILA (1:1 meeting) between a manager and one employee: a locked `bila` block on the employee's
 * row and — unless turned off — on the booking manager's row. Refused when someone is absent or
 * already has a fixed appointment or a break at that time.
 */
async function createBilaImpl(input: z.input<typeof BilaSchema>): Promise<{ created: number }> {
  const session = await requireRole(SCHEDULER_ROLES);
  const parsed = BilaSchema.safeParse(input);
  if (!parsed.success) throw new UserError(await tr("Ungültige Eingabe."));
  const { employeeId, date, startMinute, endMinute, note, includeMe } = parsed.data;
  if (endMinute <= startMinute) throw new UserError(await tr("Die Endzeit muss nach der Startzeit liegen."));
  const day = dayOf(date);
  await assertNotHoliday(day);

  const ids = [...new Set([employeeId, ...(includeMe ? [session.userId] : [])])];
  const [people, absences, clashes] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: ids }, active: true } }),
    prisma.absenceEntry.findMany({ where: { date: day, employeeId: { in: ids }, halfDay: { in: halvesOf(startMinute, endMinute) } } }),
    prisma.shiftBlock.findMany({
      where: {
        date: day,
        draft: false,
        employeeId: { in: ids },
        // another appointment, or a break (move the break first)
        dutyType: { in: [...FIXED_TYPES, ...BREAK_TYPES] },
        startMinute: { lt: endMinute },
        endMinute: { gt: startMinute },
      },
    }),
  ]);
  if (!people.some((p) => p.id === employeeId)) throw new UserError(await tr("Diese Person gibt es nicht (mehr)."));
  const show = await loadDisplayName();
  const nameOf = (id: string) => show(people.find((p) => p.id === id)?.name ?? id);
  if (absences.length > 0) {
    throw new UserError(await tr("{name} ist zu dieser Zeit abwesend – die BILA kann nicht eingetragen werden.", { name: nameOf(absences[0].employeeId) }));
  }
  if (clashes.length > 0) {
    const c = clashes[0];
    throw new UserError(
      await tr("{name} hat um {from}–{to} bereits «{what}» – bitte eine andere Zeit wählen.", {
        name: nameOf(c.employeeId),
        from: minutesToTime(c.startMinute),
        to: minutesToTime(c.endMinute),
        what: await tr(DUTY_TYPE_LABELS[c.dutyType as keyof typeof DUTY_TYPE_LABELS] ?? c.dutyType),
      })
    );
  }

  await prisma.shiftBlock.createMany({
    data: ids.map((id) => ({
      employeeId: id,
      date: day,
      startMinute,
      endMinute,
      dutyType: "bila",
      location: null,
      note: note || null,
      createdById: session.userId,
    })),
  });
  refresh();
  return { created: ids.length };
}

export async function createBila(input: z.input<typeof BilaSchema>) {
  return guard(() => createBilaImpl(input));
}

export async function createShiftBlock(input: CreateShiftBlockInput) {
  return guard(() => createShiftBlockImpl(input));
}

export async function updateShiftBlock(input: z.infer<typeof UpdateShiftBlockSchema>) {
  return guard(() => updateShiftBlockImpl(input));
}

export async function deleteShiftBlock(id: string) {
  return guard(() => deleteShiftBlockImpl(id));
}
