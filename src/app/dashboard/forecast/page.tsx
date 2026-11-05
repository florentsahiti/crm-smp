import Link from "next/link";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { HISTORY_FIRST_YEAR, SCHEDULER_ROLES } from "@/lib/constants";
import { addDays, dayLabel, formatDateKey, parseDateKey, todayUTC, toDateKey, weekOf, zurichDateKey } from "@/lib/dates";
import { loadCallHistoryYear } from "@/lib/actions/planning";
import {
  CALLS_PER_PERSON_HALF_DAY,
  REACHABILITY_TARGET,
  backtest,
  expectedReachability,
  requiredPerHalfDay,
} from "@/lib/forecast";
import { dayCapacity, onPhone, loadAgents, loadCallHistory, staffingFor } from "@/lib/staffing";
import { reachabilityStyle } from "./reachability-style";
import { holidayOn } from "@/lib/holidays";
import { editorDays, loadDayForecasts, loadWeekdayPattern, type ForecastSource } from "@/lib/day-forecasts";
import { ForecastWeekEditor, WeekdayPatternEditor } from "./forecast-week-editor";
import { CallHistoryEditor } from "./call-history-editor";
import { getLocale } from "@/lib/i18n/server";
import { makeT } from "@/lib/i18n";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export default async function ForecastPage(props: PageProps<"/dashboard/forecast">) {
  await requireRole(SCHEDULER_ROLES);
  const locale = await getLocale();
  const t = makeT(locale);

  const searchParams = await props.searchParams;
  const requested = typeof searchParams.w === "string" ? searchParams.w : null;
  const week = weekOf(requested ? parseDateKey(requested) : todayUTC());
  const [monday, , , , friday] = week;

  // "Ist-Werte vergangener Jahre": one month at a time (?hy=2025&hm=3), from 2024 up to this month
  const today = zurichDateKey();
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7));
  const years = Array.from({ length: thisYear - HISTORY_FIRST_YEAR + 1 }, (_, i) => HISTORY_FIRST_YEAR + i);
  const hy = years.includes(Number(searchParams.hy)) ? Number(searchParams.hy) : thisYear;
  const hmRaw = Number(searchParams.hm) >= 1 && Number(searchParams.hm) <= 12 ? Number(searchParams.hm) : thisMonth;
  const hm = hy === thisYear ? Math.min(hmRaw, thisMonth) : hmRaw;

  const [history, staffing, agents, forecasts, pattern, historyYear] = await Promise.all([
    loadCallHistory(),
    staffingFor(week),
    loadAgents(),
    loadDayForecasts(week),
    loadWeekdayPattern(),
    // the shown year for the "Ist-Werte" table (other years load in the browser)
    loadCallHistoryYear(hy),
  ]);

  const rows = week.map((date) => {
    const key = toDateKey(date);
    // Order: holiday 0 → entered for this date → Wochenmuster → automatic (see loadDayForecasts).
    const fc = forecasts.get(key)!;
    const f = fc.auto;
    const holiday = holidayOn(key);
    const expected = fc.total;
    const s = staffing.get(key)!;
    const capacity = dayCapacity(s, CALLS_PER_PERSON_HALF_DAY);
    return {
      date,
      key,
      f,
      s,
      actual: history.get(key) ?? null,
      capacity,
      expected,
      source: fc.source,
      crm: fc.crm,
      holiday,
      reach: expectedReachability(capacity, expected),
      need: requiredPerHalfDay(expected),
    };
  });

  const lastActual = [...history.keys()].sort().pop();
  const test = backtest(history, 40);
  const weekCalls = rows.reduce((a, r) => a + (r.expected ?? 0), 0);
  const weekCapacity = rows.reduce((a, r) => a + r.capacity, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t("Prognose")}</h1>
          <p className="page-subtitle">
            {t("Erwartete Anrufe, wer verfügbar ist, um sie entgegenzunehmen, und die daraus resultierende Erreichbarkeit – für {n} Personen, die Anrufe bearbeiten.", { n: agents.length })}
          </p>
        </div>
        <nav className="flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white p-1 text-sm shadow-sm">
          <Link href={`/dashboard/forecast?w=${toDateKey(addDays(monday, -7))}`} className="btn-ghost btn-sm" aria-label={t("Vorherige Woche")}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-36 px-2 text-center font-medium text-zinc-900">
            {dayLabel(monday, locale)} – {dayLabel(friday, locale)}
          </span>
          <Link href={`/dashboard/forecast?w=${toDateKey(addDays(monday, 7))}`} className="btn-ghost btn-sm" aria-label={t("Nächste Woche")}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{t("Erwartete Anrufe diese Woche")}</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{weekCalls || "—"}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{t("Teamkapazität")}</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{weekCapacity}</p>
          <p className="text-xs text-zinc-400">{t("Anrufe ({n} pro Person und Halbtag)", { n: CALLS_PER_PERSON_HALF_DAY })}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{t("Erwartete Erreichbarkeit")}</p>
          <p className="mt-1">
            <span className={`badge px-3 py-1 text-lg ${reachabilityStyle(expectedReachability(weekCapacity, weekCalls), REACHABILITY_TARGET)}`}>
              {pct(expectedReachability(weekCapacity, weekCalls))}
            </span>
          </p>
          <p className="mt-1 text-xs text-zinc-400">{t("Ziel {pct} (angenommen)", { pct: pct(REACHABILITY_TARGET) })}</p>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("Tag")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("Erwartete Anrufe")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("Gleicher Tag Vorjahr")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("Effektiv")}</th>
              <th className="px-4 py-3 text-center font-medium">{t("Personen VM / NM")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("Kapazität")}</th>
              <th className="px-4 py-3 text-center font-medium">{t("Erreichbarkeit")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("Benötigt pro Halbtag")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const phone = onPhone(r.s);
              const present = Math.min(phone.am, phone.pm);
              const short = r.need !== null && present < r.need;
              if (r.holiday) {
                return (
                  <tr key={r.key} className="bg-amber-50/60">
                    <td className="px-4 py-3 font-medium text-zinc-900">{dayLabel(r.date, locale)}</td>
                    <td colSpan={7} className="px-4 py-3 text-amber-900">
                      <span className="badge bg-amber-100 text-amber-800">{t("Feiertag")}</span> {t(r.holiday)}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={r.key}>
                  <td className="px-4 py-3 font-medium text-zinc-900">{dayLabel(r.date, locale)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.expected ?? "—"}
                    <SourceTag source={r.source} t={t} />
                    {r.crm !== null && <span className="block text-[10px] text-zinc-400">{t("CRM {n}", { n: r.crm })}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{r.f.lastYear ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{r.actual ?? "—"}</td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {r.s.presentAM} / {r.s.presentPM}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.capacity}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge ${reachabilityStyle(r.reach, REACHABILITY_TARGET)}`}>{pct(r.reach)}</span>
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${short ? "font-medium text-red-600" : "text-zinc-600"}`}>
                    {r.need ?? "—"}
                    {short && ` (${t("zu wenig")})`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="section-title">{t("Forecast pro Wochentag")}</h2>
        <ForecastWeekEditor key={toDateKey(monday)} days={editorDays(week, forecasts, staffing)} />
      </div>

      <div className="card">
        <h2 className="section-title mb-1">{t("Wochenmuster")}</h2>
        <p className="mb-3 text-sm text-zinc-500">{t("Standardwerte pro Wochentag, z. B. Montag 450 Anrufe. Reihenfolge für einen Tag: manueller Wert → Wochenmuster → automatische Prognose.")}</p>
        <WeekdayPatternEditor pattern={pattern} />
      </div>

      <div id="ist-werte" className="card scroll-mt-4">
        <div className="mb-3">
          <div>
            <h2 className="section-title mb-1">{t("Ist-Werte vergangener Jahre")}</h2>
            <p className="max-w-2xl text-sm text-zinc-500">
              {t("Tag für Tag erfassen, wie viele Anrufe eingegangen sind und wie viele CRM-Tasks erledigt wurden. Die automatische Prognose nutzt diese Zahlen (gleicher Wochentag im Vorjahr) – je vollständiger, desto genauer die Planung fürs nächste Jahr.")}
            </p>
          </div>
        </div>
        <CallHistoryEditor years={years} todayKey={today} initialYear={hy} initialMonth={hm} initialData={historyYear} />
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="section-title mb-0 flex items-center gap-2">
          <Info className="h-4 w-4 text-zinc-400" /> {t("Wie zuverlässig ist das?")}
        </h2>
        {test ? (
          <p className="text-sm text-zinc-600">
            {t(
              "Getestet an den letzten {days} Tagen mit echten Zahlen, jeweils nur mit Daten vor dem betreffenden Tag: Die Prognose wich im Schnitt um {mape}% pro Tag ab (Verzerrung {bias}%). Ein einfaches Übernehmen des Vorjahres hätte um {naive}% abgewichen. Einzelne Tage mit ±10% betrachten, Wochen sind zuverlässiger.",
              { days: test.days, mape: test.mape.toFixed(0), bias: `${test.bias > 0 ? "+" : ""}${test.bias.toFixed(1)}`, naive: test.naiveMape.toFixed(0) }
            )}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">{t("Noch zu wenig historische Daten, um die Prognose zu testen.")}</p>
        )}
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-500">
          <li>
            {t("Methode: derselbe Wochentag im Vorjahr (diese Woche und die beiden angrenzenden), skaliert nach dem Verhältnis der jüngsten Anrufe dieses Jahres zum Vorjahr.")}
          </li>
          <li>
            {t(
              "Die Kapazität folgt Ihrer eigenen Regel: anwesende Personen × {n} Anrufe pro Halbtag. Personen im Ticketdienst zählen nicht. Manager werden nicht als Anrufbearbeitende gezählt.",
              { n: CALLS_PER_PERSON_HALF_DAY }
            )}
          </li>
          <li>
            {t("Anrufzahlen sind bis {date} geladen. Spätere Wochen basieren auf dem Vorjahr plus Trend.", { date: lastActual ? formatDateKey(lastActual, locale) : "—" })}
          </li>
          <li>{t("Das Ziel von {pct} Erreichbarkeit ist ein Richtwert und lässt sich anpassen.", { pct: pct(REACHABILITY_TARGET) })}</li>
        </ul>
      </div>
    </div>
  );
}

function SourceTag({ source, t }: { source: ForecastSource; t: (k: string) => string }) {
  if (source === "manual") return <span className="ml-1 text-[10px] font-medium text-brand-700" title={t("Von einem Manager erfasst")}>{t("manuell")}</span>;
  if (source === "pattern") return <span className="ml-1 text-[10px] font-medium text-blue-700">{t("Wochenmuster")}</span>;
  if (source === "auto") return <span className="ml-1 text-[10px] text-zinc-400">{t("automatisch")}</span>;
  return null;
}
