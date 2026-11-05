import { CalendarOff } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { addDays, toDateKey, weekOf, weekdaysInMonth } from "@/lib/dates";
import { ABSENCE_TYPE_LABELS, type AbsenceType, type Activity, type DutyType, type Location } from "@/lib/constants";
import { makeT, type Locale } from "@/lib/i18n";
import { CALLS_PER_PERSON_HALF_DAY, REACHABILITY_TARGET, expectedReachability } from "@/lib/forecast";
import { dayCapacity, staffingFor } from "@/lib/staffing";
import { editorDays, loadDayForecasts, loadWeekdayPattern, type DayForecastValue } from "@/lib/day-forecasts";
import { holidayOn } from "@/lib/holidays";
import { withDisplayNames } from "@/lib/names";
import { AGENDA_DAYS_AHEAD, buildAgenda, isBirthdayOn } from "@/lib/events";
import { HOURS, SLOTS, hourRows, hourlyForecast, slotSummary, splitDaily, type DayAbsences } from "@/lib/capacity";
import { Timeline } from "./timeline";
import { CapacityPanel, type ForecastInfo } from "./capacity-panel";
import { EventsPanel } from "./events-panel";
import { ForecastCard, type DayPerf, type HourPerf } from "./forecast-card";
import { CoverageCard } from "./coverage-card";
import { DetailsToggle } from "./details-toggle";

export type DayData = Awaited<ReturnType<typeof loadDay>>;

/**
 * Everything the day view needs for one date. The forecast card also shows the day's week and
 * month, so forecasts, staffing and completed work are loaded once for all those days.
 */
export async function loadDay(date: Date, scheduler: boolean) {
  const dateKey = toDateKey(date);
  const week = weekOf(date);
  const month = weekdaysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
  const span = [...new Map([...month, ...week, date].map((d) => [toDateKey(d), d])).values()];
  const [employees, absences, shiftBlocks, taskCounts, callStats, events, forecasts, staffing, pattern, homeOfficeDays] = await Promise.all([
    // first names only (no last names in the app)
    prisma.employee
      .findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
      .then(withDisplayNames),
    prisma.absenceEntry.findMany({ where: { date } }),
    prisma.shiftBlock.findMany({
      where: { date, draft: false },
      orderBy: { startMinute: "asc" },
    }),
    prisma.taskCount.findMany({ where: { date: { in: span } } }),
    prisma.dailyCallStat.findMany({ where: { date: { in: span } } }),
    prisma.event.findMany({
      where: { date: { gte: date, lte: addDays(date, AGENDA_DAYS_AHEAD) } },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    }),
    loadDayForecasts(span),
    staffingFor(span),
    scheduler ? loadWeekdayPattern() : null,
    prisma.homeOfficeDay.findMany({ where: { date }, select: { employeeId: true } }),
  ]);

  // Completed work per day: what managers entered per hour, else the imported daily statistics.
  const perf = (d: Date): DayPerf => {
    const k = toDateKey(d);
    const f: DayForecastValue = forecasts.get(k)!;
    const counts = taskCounts.filter((c) => toDateKey(c.date) === k);
    const stat = callStats.find((c) => toDateKey(c.date) === k);
    const sumOf = (values: (number | null)[]) => (values.some((v) => v !== null) ? values.reduce<number>((a, v) => a + (v ?? 0), 0) : null);
    return {
      dateKey: k,
      holiday: holidayOn(k),
      forecastCalls: f.total,
      forecastCrm: f.crm,
      doneCalls: counts.length ? sumOf(counts.map((c) => c.done)) : (stat?.callsAnswered ?? null),
      doneCrm: counts.length ? sumOf(counts.map((c) => c.crmDone)) : (stat?.crmCompleted ?? null),
      capacity: dayCapacity(staffing.get(k)!, CALLS_PER_PERSON_HALF_DAY),
    };
  };

  return {
    dateKey,
    employees,
    absences,
    shiftBlocks,
    homeOffice: homeOfficeDays.map((h) => h.employeeId),
    taskCounts: taskCounts.filter((c) => toDateKey(c.date) === dateKey),
    events,
    forecast: forecasts.get(dateKey)!,
    perf: { day: perf(date), week: week.map(perf), month: month.map(perf) },
    editor: pattern ? { days: editorDays(week, forecasts, staffing), pattern } : null,
  };
}

/**
 * Tag view, laid out like the design: the timeline, then three cards — forecast & completed work,
 * coverage now, Ereignisse — and the detailed per-hour table folded away under "Details anzeigen".
 */
export function DayView({
  data,
  isToday,
  scheduler,
  currentUserId,
  activity,
  locale,
}: {
  data: DayData;
  isToday: boolean;
  scheduler: boolean;
  currentUserId: string;
  activity: Activity | null;
  locale: Locale;
}) {
  const t = makeT(locale);
  const { dateKey, employees, absences, shiftBlocks, homeOffice, taskCounts, events, forecast, perf, editor } = data;
  // Public holiday (Basel-Stadt): the day is blocked — nobody available, forecast 0.
  const holiday = holidayOn(dateKey);
  const agenda = buildAgenda({ dateKey, events, people: employees, blocks: shiftBlocks });

  const absentByEmployee: DayAbsences = {};
  for (const a of absences) {
    const halves = a.halfDay === "FULL" ? (["AM", "PM"] as const) : ([a.halfDay as "AM" | "PM"] as const);
    absentByEmployee[a.employeeId] = [...new Set([...(absentByEmployee[a.employeeId] ?? []), ...halves])];
  }
  // Only managers see why someone is away (sick, accident … is sensitive).
  const absenceLabels = scheduler
    ? Object.fromEntries(
        absences.map((a) => {
          const reason = t(ABSENCE_TYPE_LABELS[a.type as AbsenceType] ?? "Abwesend");
          // the manager's note (not the automatic "Kurzfristig erfasst")
          return [a.employeeId, a.note && a.note !== "Kurzfristig erfasst" ? `${reason}: ${a.note}` : reason];
        })
      )
    : undefined;

  // Call-takers for the capacity numbers: everyone active except the manager.
  const agents = employees
    .filter((e) => e.role !== "manager" && !holiday)
    .map((e) => ({ id: e.id, name: e.name, skills: e.skills ? e.skills.split(",").filter(Boolean) : [] }));
  const liveBlocks = shiftBlocks.map((b) => ({ employeeId: b.employeeId, startMinute: b.startMinute, endMinute: b.endMinute, dutyType: b.dutyType }));

  // Everyone sees coverage (employees read-only); only managers plan with it.
  const forecastInfo: ForecastInfo = { source: forecast.source, total: forecast.total, autoTotal: forecast.auto.expected };
  const hourly = holiday ? HOURS.map(() => 0) : forecast.manual ? hourlyForecast(forecast.manual) : forecast.total !== null ? splitDaily(forecast.total) : null;
  const hourlyCrm = forecast.crm !== null ? splitDaily(forecast.crm) : null;
  const slots = SLOTS.map((m) => slotSummary(m, agents, absentByEmployee, liveBlocks));
  const doneCalls = Object.fromEntries(taskCounts.map((tc) => [tc.hour, tc.done]));
  const doneCrm = Object.fromEntries(taskCounts.map((tc) => [tc.hour, tc.crmDone]));
  const rows = hourRows(slots, hourly, doneCalls);
  // Same 15-minute capacity as the table (breaks and appointments taken out).
  const dayCapacityCalls = rows.reduce((a, r) => a + r.capacity, 0);
  const hours: HourPerf[] = HOURS.map((hour, i) => ({
    hour,
    forecastCalls: hourly ? hourly[i] : null,
    forecastCrm: hourlyCrm ? hourlyCrm[i] : null,
    doneCalls: doneCalls[hour] ?? null,
    doneCrm: doneCrm[hour] ?? null,
  }));

  return (
    <>
      {holiday && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          <CalendarOff className="h-5 w-5 shrink-0" />
          <p>
            <strong>{t("Feiertag: {name}", { name: t(holiday) })}</strong> – {t("An diesem Tag wird nicht geplant. Niemand ist verfügbar, der Forecast ist 0.")}
          </p>
        </div>
      )}

      <div className="card px-3 py-3">
        <Timeline
          employees={employees.map((e) => ({
            id: e.id,
            name: e.name,
            shortCode: e.shortCode,
            skills: e.skills ? e.skills.split(",").filter(Boolean) : [],
            birthday: isBirthdayOn(e, dateKey),
            agent: e.role !== "manager",
          }))}
          absences={absentByEmployee}
          absenceLabels={absenceLabels}
          shiftBlocks={shiftBlocks.map((b) => ({
            id: b.id,
            employeeId: b.employeeId,
            startMinute: b.startMinute,
            endMinute: b.endMinute,
            dutyType: b.dutyType as DutyType,
            location: b.location as Location | null,
            note: b.note,
            draft: b.draft,
          }))}
          dateKey={dateKey}
          currentUserId={currentUserId}
          canEditAll={scheduler}
          locked={Boolean(holiday)}
          activity={activity}
          homeOffice={homeOffice}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr]">
        <ForecastCard
          isToday={isToday}
          day={{ ...perf.day, capacity: dayCapacityCalls }}
          week={perf.week}
          month={perf.month}
          reachability={expectedReachability(dayCapacityCalls, forecastInfo.total)}
          target={REACHABILITY_TARGET}
          editor={editor}
        />
        <CoverageCard dateKey={dateKey} agents={agents} absences={absentByEmployee} blocks={liveBlocks} hourlyForecast={hourly} />
        <EventsPanel dateKey={dateKey} isToday={isToday} items={agenda} canEdit={scheduler} />
      </div>

      <DetailsToggle title={t("Abdeckung, Forecast und Kapazität pro Stunde")}>
        <p className="mb-4 text-sm text-zinc-500">
          {t(
            "Verfügbar = nicht abwesend, nicht in Pause, nicht in einem Termin und nicht in einer anderen Tätigkeit. Benötigt = Personen für {pct}% Erreichbarkeit beim Forecast der Stunde.",
            { pct: Math.round(REACHABILITY_TARGET * 100) }
          )}
        </p>
        <CapacityPanel
          key={`${dateKey}|${rows.map((r) => `${r.forecast}:${r.done}`).join(",")}|${hours.map((h) => h.doneCrm).join(",")}`}
          dateKey={dateKey}
          rows={rows}
          crmDone={hours.map((h) => h.doneCrm)}
          slots={slots}
          forecast={forecastInfo}
          canEdit={scheduler && !holiday}
        />
      </DetailsToggle>
    </>
  );
}
