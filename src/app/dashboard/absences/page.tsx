import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { AbsenceCell } from "./absence-cell";
import { dayLabel, fullDayLabel, monthLabel, toDateKey, zurichDateKey } from "@/lib/dates";
import { isScheduler, type AbsenceType, type HalfDay } from "@/lib/constants";
import { holidayOn } from "@/lib/holidays";
import { CALLS_PER_PERSON_HALF_DAY } from "@/lib/forecast";
import { onPhone, staffingFor, type DayStaffing } from "@/lib/staffing";
import { loadDayForecasts, type DayForecastValue } from "@/lib/day-forecasts";
import { getLocale } from "@/lib/i18n/server";
import { INTL_LOCALE, makeT } from "@/lib/i18n";
import { PERIOD_VIEWS, periodFromParams, periodHref } from "./period";
import { PeriodDateInput } from "./period-picker";
import { RefusedLeave } from "./refused-leave";
import { withDisplayNames } from "@/lib/names";
import { loadDisplayName } from "@/lib/names-server";

export default async function AbsencesPage(props: PageProps<"/dashboard/absences">) {
  // Managers edit; employees see the calendar read-only and only that someone is away — not why
  // (sick, accident … is sensitive), so the reason never leaves the server for them.
  const session = await verifySession();
  const canEdit = isScheduler(session.role);
  const locale = await getLocale();
  const t = makeT(locale);

  // Tag / Woche / Monat and a date, from the URL
  const period = periodFromParams(await props.searchParams);
  const { view, days } = period;
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];

  const [employees, entries, staffing, forecasts, refused] = await Promise.all([
    prisma.employee
      .findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
      .then(withDisplayNames),
    rangeStart && rangeEnd
      ? prisma.absenceEntry.findMany({
          where: { date: { gte: rangeStart, lte: rangeEnd } },
        })
      : Promise.resolve([]),
    // Staffing rows under the grid: loaded once for the whole month, same numbers as the Einsatzplan.
    staffingFor(days),
    loadDayForecasts(days),
    // "Abgelehnte Ferien" overlapping the shown period; employees only get their own
    prisma.leaveRequest.findMany({
      where: {
        status: "rejected",
        startDate: { lte: rangeEnd },
        endDate: { gte: rangeStart },
        ...(canEdit ? {} : { employeeId: session.userId }),
      },
      include: { employee: { select: { name: true } }, decidedBy: { select: { name: true } } },
      orderBy: { startDate: "asc" },
    }),
  ]);

  const showName = await loadDisplayName();

  const lookup = new Map<string, AbsenceType>();
  for (const entry of entries) {
    const key = `${entry.employeeId}|${toDateKey(entry.date)}|${entry.halfDay}`;
    lookup.set(key, entry.type as AbsenceType);
  }

  const short = (d: Date, withYear = false) =>
    d.toLocaleDateString(INTL_LOCALE[locale], { day: "2-digit", month: "2-digit", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
  const periodLabel =
    view === "day"
      ? fullDayLabel(days[0], locale)
      : view === "week"
        ? `${short(days[0])} – ${short(days[days.length - 1], true)}`
        : monthLabel(period.year!, period.month!, locale);
  const prevLabel = { day: "Vorheriger Tag", week: "Vorherige Woche", month: "Vorheriger Monat" }[view];
  const nextLabel = { day: "Nächster Tag", week: "Nächste Woche", month: "Nächster Monat" }[view];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t("Abwesenheiten")}</h1>
          <p className="page-subtitle">
            {canEdit
              ? t("Ferien, Krankheit usw. pro Halbtag erfassen. Änderungen erscheinen sofort im Einsatzplan.")
              : t("Wer an welchem Halbtag abwesend ist (A = abwesend).")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter: one day, one week or one month */}
          <div className="flex rounded-xl border border-zinc-200/70 bg-white p-1 text-xs shadow-sm" role="group" aria-label={t("Zeitraum")}>
            {PERIOD_VIEWS.map((v) => (
              <Link
                key={v}
                href={periodHref(v, period.anchor)}
                aria-current={v === view ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 font-medium ${v === view ? "bg-brand-50 text-brand-700" : "text-zinc-500 hover:text-zinc-900"}`}
              >
                {t({ day: "Tag", week: "Woche", month: "Monat" }[v])}
              </Link>
            ))}
          </div>
          <PeriodDateInput view={view} dateKey={period.anchor} />
          <nav className="flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white p-1 text-sm shadow-sm">
            <Link href={periodHref(view, period.prev)} className="btn-ghost btn-sm" aria-label={t(prevLabel)}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="min-w-32 px-2 text-center font-medium text-zinc-900">{periodLabel}</span>
            <Link href={periodHref(view, period.next)} className="btn-ghost btn-sm" aria-label={t(nextLabel)}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </div>

      <div className="card mt-6 overflow-x-auto p-0">
        <table className={`border-collapse text-xs ${view === "month" ? "" : "w-full"}`}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r border-zinc-200 bg-zinc-50 px-2 py-2 text-left text-xs uppercase tracking-wide text-zinc-500">
                {t("Mitarbeitende")}
              </th>
              {days.map((day) => {
                const holiday = holidayOn(toDateKey(day));
                return (
                  <th
                    key={toDateKey(day)}
                    colSpan={2}
                    title={holiday ? `${t("Feiertag")}: ${t(holiday)}` : undefined}
                    className={`border-b border-l border-zinc-200 px-1 py-2 text-center font-medium ${holiday ? "bg-amber-100 text-amber-900" : "bg-zinc-50 text-zinc-600"}`}
                  >
                    {dayLabel(day, locale)}
                  </th>
                );
              })}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r border-zinc-200 bg-zinc-50" />
              {days.map((day) => (
                <th key={toDateKey(day) + "-half"} colSpan={2} className="border-b border-l border-zinc-200 p-0">
                  <div className="grid grid-cols-2 text-[10px] text-zinc-400">
                    <span className="border-r border-zinc-100 py-1 text-center">{t("VM")}</span>
                    <span className="py-1 text-center">{t("NM")}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id} className="border-b border-zinc-100 last:border-0">
                <td className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-2 py-1 font-medium whitespace-nowrap text-zinc-800">
                  {employee.name}
                </td>
                {days.map((day) => {
                  const dateKey = toDateKey(day);
                  const holiday = holidayOn(dateKey);
                  if (holiday) {
                    return (
                      <td key={dateKey} colSpan={2} className="border-l border-amber-200 bg-amber-50 p-0 text-center text-[11px] font-semibold text-amber-700" title={t(holiday)}>
                        {t("FT")}
                      </td>
                    );
                  }
                  return (
                    <td key={dateKey} colSpan={2} className="border-l border-zinc-100 p-0">
                      <div className="grid grid-cols-2 divide-x divide-zinc-100">
                        {(["AM", "PM"] as HalfDay[]).map((half) => {
                          const type = lookup.get(`${employee.id}|${dateKey}|${half}`) ?? null;
                          return canEdit ? (
                            <AbsenceCell key={half} employeeId={employee.id} date={dateKey} halfDay={half} currentType={type} readOnly={false} />
                          ) : (
                            <span
                              key={half}
                              title={type ? t("Abwesend") : undefined}
                              className={`block min-w-[2.25rem] py-1 text-center text-[11px] font-medium ${type ? "bg-zinc-200 text-zinc-700" : ""}`}
                            >
                              {type ? "A" : ""}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <StaffingRows days={days.map(toDateKey)} staffing={staffing} forecasts={forecasts} t={t} />
        </table>
      </div>

      <RefusedLeave
        key={period.anchor}
        rows={refused.map((r) => ({
          id: r.id,
          employee: showName(r.employee.name),
          from: toDateKey(r.startDate),
          to: toDateKey(r.endDate),
          note: r.note,
          decidedBy: r.decidedBy ? showName(r.decidedBy.name) : null,
          decidedAt: r.decidedAt ? zurichDateKey(r.decidedAt) : null,
        }))}
        employees={employees.filter((e) => e.role !== "manager").map((e) => ({ id: e.id, name: e.name }))}
        canEdit={canEdit}
        defaultDate={toDateKey(days[0])}
      />
    </div>
  );
}

/** Difference colours, as in the Einsatzplan's capacity table. */
const DIFF_STYLE = {
  under: "bg-red-100 text-red-700",
  ok: "bg-green-100 text-green-700",
  over: "bg-sky-100 text-sky-700",
};
/** Two spare half-days of one person (2 × 15 calls) or more = more people than needed. */
const OVER_MARGIN_CALLS = 2 * CALLS_PER_PERSON_HALF_DAY;

/**
 * Forecast and staffing per day under the absence grid: people on the phone per half-day
 * (call-takers only — managers, ticket duty and backoffice left out), their capacity, the forecast
 * (same source order as the Einsatzplan) and the difference. Totals only — no names or reasons,
 * so employees can see them too.
 */
function StaffingRows({
  days,
  staffing,
  forecasts,
  t,
}: {
  days: string[];
  staffing: Map<string, DayStaffing>;
  forecasts: Map<string, DayForecastValue>;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const label = "sticky left-0 z-10 border-r border-zinc-200 bg-zinc-50 px-2 py-1 text-left font-medium whitespace-nowrap text-zinc-600";
  const cell = "border-l border-zinc-100 px-0.5 py-1 text-center tabular-nums";
  const holidayCell = (k: string, first: boolean) =>
    holidayOn(k) ? (
      first ? (
        <td key={k} colSpan={2} className={`${cell} bg-amber-50 text-[10px] font-semibold text-amber-700`}>
          {t("FT")}
        </td>
      ) : null
    ) : undefined;

  return (
    <tfoot className="border-t-2 border-zinc-200 bg-zinc-50/60 text-[11px]">
      <tr>
        <th className={label}>{t("Forecast Anrufe")}</th>
        {days.map((k) => holidayCell(k, true) ?? (
          <td key={k} colSpan={2} className={`${cell} text-zinc-700`}>
            {forecasts.get(k)?.total ?? "–"}
          </td>
        ))}
      </tr>
      <tr>
        <th className={label} title={t("Anrufbearbeitende, ohne Manager, Ticketdienst und Backoffice")}>
          {t("Anwesend VM / NM")}
        </th>
        {days.flatMap((k) => {
          const h = holidayCell(k, true);
          if (h !== undefined) return [h];
          const p = onPhone(staffing.get(k)!);
          return [
            <td key={`${k}-am`} className={`${cell} text-zinc-700`}>{p.am}</td>,
            <td key={`${k}-pm`} className={`${cell} text-zinc-700`}>{p.pm}</td>,
          ];
        })}
      </tr>
      <tr>
        <th className={label}>{t("Kapazität")}</th>
        {days.flatMap((k) => {
          const h = holidayCell(k, true);
          if (h !== undefined) return [h];
          const p = onPhone(staffing.get(k)!);
          return [
            <td key={`${k}-am`} className={`${cell} text-zinc-500`}>{p.am * CALLS_PER_PERSON_HALF_DAY}</td>,
            <td key={`${k}-pm`} className={`${cell} text-zinc-500`}>{p.pm * CALLS_PER_PERSON_HALF_DAY}</td>,
          ];
        })}
      </tr>
      <tr>
        <th className={label}>{t("Differenz")}</th>
        {days.map((k) => {
          const h = holidayCell(k, true);
          if (h !== undefined) return h;
          const f = forecasts.get(k)?.total;
          if (f == null) return <td key={k} colSpan={2} className={cell}>–</td>;
          const p = onPhone(staffing.get(k)!);
          const diff = (p.am + p.pm) * CALLS_PER_PERSON_HALF_DAY - f;
          const tone = diff < 0 ? "under" : diff >= OVER_MARGIN_CALLS ? "over" : "ok";
          return (
            <td key={k} colSpan={2} className={cell}>
              <span className={`inline-block min-w-[2.5rem] rounded px-1 font-medium ${DIFF_STYLE[tone]}`}>{diff > 0 ? `+${diff}` : diff}</span>
            </td>
          );
        })}
      </tr>
    </tfoot>
  );
}
