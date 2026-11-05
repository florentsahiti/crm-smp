"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import { HISTORY_FIRST_YEAR, SCHEDULER_ROLES } from "@/lib/constants";
import { HOURS } from "@/lib/capacity";
import { holidayOn } from "@/lib/holidays";
import { UserError, guard } from "@/lib/action-result";
import { tr } from "@/lib/i18n/server";
import { zurichDateKey } from "@/lib/dates";

const dayOf = (dateKey: string) => new Date(`${dateKey}T00:00:00.000Z`);
const Volume = z.number().int().min(0).max(100_000);

function refresh() {
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/forecast");
  revalidatePath("/dashboard/absences");
}

const ForecastSchema = z.union([
  // a daily total — split over the hours by the usual pattern
  z.object({ date: z.iso.date(), total: Volume }),
  // one value per hour 08–16 — the total is their sum
  z.object({ date: z.iso.date(), hourly: z.array(Volume).length(HOURS.length) }),
]);

/** Managers enter the expected workload for a day, as a total or per hour. */
export async function saveForecast(input: z.input<typeof ForecastSchema>) {
  const session = await requireRole(SCHEDULER_ROLES);
  const parsed = ForecastSchema.parse(input);
  const date = dayOf(parsed.date);
  const data =
    "hourly" in parsed
      ? { total: parsed.hourly.reduce((a, b) => a + b, 0), hourly: parsed.hourly }
      : { total: parsed.total, hourly: [] };
  await prisma.forecastDay.upsert({
    where: { date },
    update: { ...data, updatedById: session.userId },
    create: { date, ...data, updatedById: session.userId },
  });
  refresh();
}

/** Back to the automatic forecast from the call history. */
export async function clearForecast(dateKey: string) {
  await requireRole(SCHEDULER_ROLES);
  await prisma.forecastDay.deleteMany({ where: { date: dayOf(z.iso.date().parse(dateKey)) } });
  refresh();
}

const WeekSchema = z.object({
  days: z
    .array(
      z.object({
        date: z.iso.date(),
        /** null = no manual value: the day falls back to the Wochenmuster / automatic forecast */
        calls: Volume.nullable(),
        crm: Volume.nullable(),
      })
    )
    .min(1)
    .max(5),
});

/**
 * The week editor: expected calls and CRM tasks per weekday, saved together. A day whose total
 * changes loses its per-hour values (it is split by the usual pattern again); public holidays are
 * skipped (always 0).
 */
export async function saveForecastWeek(input: z.input<typeof WeekSchema>) {
  return guard(async () => {
    const session = await requireRole(SCHEDULER_ROLES);
    const parsed = WeekSchema.safeParse(input);
    if (!parsed.success) throw new UserError(await tr("Bitte nur ganze Zahlen ab 0 eingeben."));
    const days = parsed.data.days.filter((d) => !holidayOn(d.date));
    if (days.some((d) => d.calls === null && d.crm !== null)) {
      throw new UserError(await tr("Für CRM bitte auch die Anrufe des Tages eintragen."));
    }
    const existing = await prisma.forecastDay.findMany({ where: { date: { in: days.map((d) => dayOf(d.date)) } } });
    await prisma.$transaction(
      days.map((d) => {
        const date = dayOf(d.date);
        if (d.calls === null) return prisma.forecastDay.deleteMany({ where: { date } });
        const before = existing.find((e) => e.date.getTime() === date.getTime());
        const hourly = before && before.total === d.calls ? before.hourly : [];
        const data = { total: d.calls, crmTotal: d.crm, hourly, updatedById: session.userId };
        return prisma.forecastDay.upsert({ where: { date }, update: data, create: { date, ...data } });
      })
    );
    refresh();
  });
}

const PatternSchema = z.object({
  days: z
    .array(z.object({ weekday: z.number().int().min(1).max(5), calls: Volume.nullable(), crm: Volume.nullable() }))
    .length(5),
});

/** Wochenmuster: standard calls/CRM per weekday (Mo–Fr). Empty calls = no standard for that weekday. */
export async function saveWeekdayDefaults(input: z.input<typeof PatternSchema>) {
  return guard(async () => {
    const session = await requireRole(SCHEDULER_ROLES);
    const parsed = PatternSchema.safeParse(input);
    if (!parsed.success) throw new UserError(await tr("Bitte nur ganze Zahlen ab 0 eingeben."));
    if (parsed.data.days.some((d) => d.calls === null && d.crm !== null)) {
      throw new UserError(await tr("Für CRM bitte auch die Anrufe des Tages eintragen."));
    }
    await prisma.$transaction(
      parsed.data.days.map(({ weekday, calls, crm }) =>
        calls === null
          ? prisma.forecastWeekdayDefault.deleteMany({ where: { weekday } })
          : prisma.forecastWeekdayDefault.upsert({
              where: { weekday },
              update: { calls, crm, updatedById: session.userId },
              create: { weekday, calls, crm, updatedById: session.userId },
            })
      )
    );
    refresh();
  });
}

const TaskSchema = z.object({
  date: z.iso.date(),
  hour: z.number().int().min(HOURS[0]).max(HOURS[HOURS.length - 1]),
  /** calls handled; null clears, left out = unchanged */
  done: Volume.nullable().optional(),
  /** CRM tasks completed; null clears, left out = unchanged */
  crmDone: Volume.nullable().optional(),
});

/** Records how many calls / CRM tasks were completed in one hour; an hour with neither is removed. */
export async function saveTaskCount(input: z.input<typeof TaskSchema>) {
  const session = await requireRole(SCHEDULER_ROLES);
  const { date, hour, done, crmDone } = TaskSchema.parse(input);
  const day = dayOf(date);
  const before = await prisma.taskCount.findUnique({ where: { date_hour: { date: day, hour } } });
  const next = {
    done: done === undefined ? (before?.done ?? null) : done,
    crmDone: crmDone === undefined ? (before?.crmDone ?? null) : crmDone,
  };
  if (next.done === null && next.crmDone === null) {
    await prisma.taskCount.deleteMany({ where: { date: day, hour } });
  } else {
    await prisma.taskCount.upsert({
      where: { date_hour: { date: day, hour } },
      update: { ...next, updatedById: session.userId },
      create: { date: day, hour, ...next, updatedById: session.userId },
    });
  }
  refresh();
}

const HistorySchema = z.object({
  days: z
    .array(z.object({ date: z.iso.date(), calls: Volume.nullable(), crm: Volume.nullable() }))
    .min(1)
    .max(400),
});

/**
 * Past figures a manager types in day by day (calls received, CRM tasks done) — every day changed
 * since the last save, across months and years.
 * They go into the call history, so the automatic forecast (same weekday one year earlier) uses them.
 * Only working days from 2024 up to today; holidays and weekends are refused.
 */
export async function saveCallHistory(input: z.input<typeof HistorySchema>) {
  return guard(async () => {
    await requireRole(SCHEDULER_ROLES);
    const parsed = HistorySchema.safeParse(input);
    if (!parsed.success) throw new UserError(await tr("Ungültige Eingabe."));
    const today = zurichDateKey();
    for (const d of parsed.data.days) {
      const weekday = dayOf(d.date).getUTCDay();
      if (d.date < `${HISTORY_FIRST_YEAR}-01-01` || d.date > today || weekday === 0 || weekday === 6 || holidayOn(d.date)) {
        throw new UserError(await tr("{date} ist kein vergangener Arbeitstag.", { date: d.date.split("-").reverse().join(".") }));
      }
    }
    const existing = await prisma.dailyCallStat.findMany({ where: { date: { in: parsed.data.days.map((d) => dayOf(d.date)) } }, select: { date: true } });
    const has = new Set(existing.map((e) => e.date.toISOString().slice(0, 10)));
    await prisma.$transaction(
      parsed.data.days
        // an empty day without a row stays without a row
        .filter((d) => has.has(d.date) || d.calls !== null || d.crm !== null)
        .map((d) =>
          prisma.dailyCallStat.upsert({
            where: { date: dayOf(d.date) },
            update: { callsReceived: d.calls, crmCompleted: d.crm, source: "manual" },
            create: { date: dayOf(d.date), callsReceived: d.calls, crmCompleted: d.crm, source: "manual" },
          })
        )
    );
    refresh();
  });
}

/** The past figures of one year for the "Ist-Werte" table: { "YYYY-MM-DD": [calls, crm] }. */
export async function loadCallHistoryYear(year: number): Promise<Record<string, [number | null, number | null]>> {
  await requireRole(SCHEDULER_ROLES);
  const y = z.number().int().min(HISTORY_FIRST_YEAR).max(9999).parse(year);
  const rows = await prisma.dailyCallStat.findMany({
    where: { date: { gte: dayOf(`${y}-01-01`), lte: dayOf(`${y}-12-31`) } },
    select: { date: true, callsReceived: true, crmCompleted: true },
  });
  return Object.fromEntries(rows.map((r) => [r.date.toISOString().slice(0, 10), [r.callsReceived, r.crmCompleted]]));
}
