import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { withDisplayNames } from "@/lib/names";
import { dayLabel, toDateKey, weekOf } from "@/lib/dates";
import {
  ABSENCE_TYPE_LABELS,
  DAY_END_MINUTE,
  DAY_START_MINUTE,
  DUTY_TYPE_LABELS,
  activityOfDuty,
  isBackoffice,
  type AbsenceType,
  type Activity,
  type DutyType,
} from "@/lib/constants";
import { makeT, type Locale } from "@/lib/i18n";
import { CALLS_PER_PERSON_HALF_DAY } from "@/lib/forecast";
import { dayCapacity, onPhone, staffingFor } from "@/lib/staffing";
import { loadDayForecasts } from "@/lib/day-forecasts";
import { holidayOn } from "@/lib/holidays";
import { LanguageBadges } from "@/components/language-badge";
import { ABSENT_COLOR, DUTY_COLORS, PHONE_COLOR } from "./duty-colors";
import { scheduleHref } from "./schedule-url";

export type WeekData = Awaited<ReturnType<typeof loadWeek>>;

/** Mon–Fri around `date`: people, absences, blocks, forecast and staffing per day. */
export async function loadWeek(date: Date) {
  const days = weekOf(date);
  const [employees, absences, blocks, forecasts, staffing] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }).then(withDisplayNames),
    prisma.absenceEntry.findMany({ where: { date: { in: days } } }),
    prisma.shiftBlock.findMany({ where: { date: { in: days }, draft: false }, orderBy: { startMinute: "asc" } }),
    loadDayForecasts(days),
    staffingFor(days),
  ]);
  return { days, employees, absences, blocks, forecasts, staffing };
}

const SPAN = DAY_END_MINUTE - DAY_START_MINUTE;
const pct = (minute: number) => `${((minute - DAY_START_MINUTE) / SPAN) * 100}%`;

/**
 * Woche view (read-only): one row per person, Mon–Fri columns, each cell a mini timeline of the
 * day (or the absence / backoffice label). Under the grid: people on the phone, forecast and
 * capacity per day. A click on a day or cell opens that day in the Tag view, where editing happens.
 */
export function WeekView({ data, scheduler, activity, locale }: { data: WeekData; scheduler: boolean; activity: Activity | null; locale: Locale }) {
  const t = makeT(locale);
  const { days, employees, absences, blocks, forecasts, staffing } = data;
  const keys = days.map(toDateKey);
  const dim = (a: Activity | null) => (activity && a !== activity ? "opacity-20" : "");

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[860px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
            <th className="sticky left-0 z-10 w-44 bg-zinc-50 px-3 py-2 font-medium uppercase tracking-wide text-zinc-500">{t("Mitarbeitende")}</th>
            {days.map((d, i) => {
              const holiday = holidayOn(keys[i]);
              return (
                <th key={keys[i]} className={`border-l border-zinc-200 px-2 py-2 font-medium ${holiday ? "bg-amber-50 text-amber-900" : "text-zinc-700"}`}>
                  <Link href={scheduleHref({ d: keys[i], a: activity })} className="hover:underline">
                    {dayLabel(d, locale)}
                  </Link>
                  {holiday && <span className="ml-1 font-normal text-amber-700">· {t(holiday)}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id} className="border-b border-zinc-100">
              <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate text-zinc-800" title={e.name}>
                    {e.name}
                  </span>
                  <LanguageBadges codes={e.skills ? e.skills.split(",").filter(Boolean) : []} size="xs" className="ml-auto shrink-0 flex-nowrap" />
                </div>
              </td>
              {days.map((d, i) => {
                const k = keys[i];
                const holiday = holidayOn(k);
                const dayAbs = absences.filter((a) => a.employeeId === e.id && toDateKey(a.date) === k);
                const halves = new Set(dayAbs.flatMap((a) => (a.halfDay === "FULL" ? ["AM", "PM"] : [a.halfDay])));
                const dayBlocks = blocks.filter((b) => b.employeeId === e.id && toDateKey(b.date) === k);
                const backoffice = dayBlocks.find((b) => isBackoffice(b.dutyType));
                // Employees only see that someone is away, not why (same rule as the Absences page).
                const absenceLabel = scheduler && dayAbs[0] ? t(ABSENCE_TYPE_LABELS[dayAbs[0].type as AbsenceType] ?? "Abwesend") : t("Abwesend");
                return (
                  <td key={k} className={`border-l border-zinc-100 p-1 ${holiday ? "bg-amber-50/70" : ""}`}>
                    <Link
                      href={scheduleHref({ d: k, a: activity })}
                      className="block rounded-md p-0.5 hover:ring-1 hover:ring-brand-300"
                      title={`${e.name} · ${dayLabel(d, locale)}`}
                    >
                      {holiday ? (
                        <span className="block py-0.5 text-center text-[10px] text-amber-700">{t("FT")}</span>
                      ) : halves.size === 2 ? (
                        <span className={`block rounded bg-red-100 px-1.5 py-0.5 text-center text-[10px] font-medium text-red-800 ${dim("absent")}`}>
                          {absenceLabel}
                        </span>
                      ) : (
                        <span className="relative block h-5 overflow-hidden rounded bg-zinc-50">
                          {/* call-takers' working time = Telefonie, under everything else */}
                          {e.role !== "manager" && !halves.has("AM") && (
                            <span className={`absolute inset-y-0 left-0 ${PHONE_COLOR.split(" ")[0]} opacity-70 ${dim("phone")}`} style={{ width: pct(12 * 60) }} />
                          )}
                          {e.role !== "manager" && !halves.has("PM") && (
                            <span className={`absolute inset-y-0 right-0 ${PHONE_COLOR.split(" ")[0]} opacity-70 ${dim("phone")}`} style={{ left: pct(12 * 60) }} />
                          )}
                          {backoffice && (
                            <span className={`absolute inset-y-0 flex items-center px-1 text-[9px] font-medium ${DUTY_COLORS.backoffice} ${dim("backoffice")}`} style={{ left: pct(backoffice.startMinute), right: `calc(100% - ${pct(backoffice.endMinute)})` }}>
                              {t("Backoffice")}
                            </span>
                          )}
                          {halves.has("AM") && <span className={`absolute inset-y-0 left-0 ${ABSENT_COLOR.split(" ")[0]} ${dim("absent")}`} style={{ width: pct(12 * 60) }} title={absenceLabel} />}
                          {halves.has("PM") && <span className={`absolute inset-y-0 right-0 ${ABSENT_COLOR.split(" ")[0]} ${dim("absent")}`} style={{ left: pct(12 * 60) }} title={absenceLabel} />}
                          {dayBlocks
                            .filter((b) => !isBackoffice(b.dutyType))
                            .map((b) => (
                              <span
                                key={b.id}
                                className={`absolute inset-y-0.5 rounded-sm ${(DUTY_COLORS[b.dutyType as DutyType] ?? DUTY_COLORS.other).split(" ")[0]} ${dim(activityOfDuty(b.dutyType))}`}
                                style={{ left: pct(b.startMinute), width: `${((b.endMinute - b.startMinute) / SPAN) * 100}%` }}
                                title={b.dutyType === "other" && b.note ? b.note : t(DUTY_TYPE_LABELS[b.dutyType as DutyType] ?? b.dutyType)}
                              />
                            ))}
                        </span>
                      )}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-zinc-200 bg-zinc-50/60 text-[11px]">
          <SummaryRow label={t("Telefonie VM / NM")} keys={keys} render={(k) => (holidayOn(k) ? "–" : `${onPhone(staffing.get(k)!).am} / ${onPhone(staffing.get(k)!).pm}`)} />
          <SummaryRow label={t("Forecast Anrufe")} keys={keys} render={(k) => forecasts.get(k)?.total ?? "–"} />
          <SummaryRow label={t("Kapazität")} keys={keys} render={(k) => dayCapacity(staffing.get(k)!, CALLS_PER_PERSON_HALF_DAY)} />
          <SummaryRow
            label={t("Differenz")}
            keys={keys}
            render={(k) => {
              const f = forecasts.get(k)?.total;
              if (f == null || holidayOn(k)) return "–";
              const diff = dayCapacity(staffing.get(k)!, CALLS_PER_PERSON_HALF_DAY) - f;
              return <span className={`badge ${diff < 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{diff > 0 ? `+${diff}` : diff}</span>;
            }}
          />
        </tfoot>
      </table>
    </div>
  );
}

function SummaryRow({ label, keys, render }: { label: string; keys: string[]; render: (k: string) => React.ReactNode }) {
  return (
    <tr className="border-b border-zinc-100">
      <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-1.5 text-left font-medium text-zinc-600">{label}</th>
      {keys.map((k) => (
        <td key={k} className="border-l border-zinc-100 px-2 py-1.5 text-center tabular-nums text-zinc-700">
          {render(k)}
        </td>
      ))}
    </tr>
  );
}
