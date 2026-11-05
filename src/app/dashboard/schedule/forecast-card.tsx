"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { parseDateKey } from "@/lib/dates";
import type { EditorDay } from "@/lib/day-forecasts";
import { INTL_LOCALE, type T } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { ForecastEditorButton } from "../forecast/forecast-week-editor";
import { reachabilityStyle } from "../forecast/reachability-style";

/** Forecast and completed work of one day (null = nothing known). */
export type DayPerf = {
  dateKey: string;
  holiday: string | null;
  forecastCalls: number | null;
  forecastCrm: number | null;
  doneCalls: number | null;
  doneCrm: number | null;
  /** phone capacity (calls) of the people planned */
  capacity: number;
};

/** One hour of the shown day. */
export type HourPerf = { hour: number; forecastCalls: number | null; forecastCrm: number | null; doneCalls: number | null; doneCrm: number | null };

type Tab = "day" | "week" | "month";

const sum = (values: (number | null)[]) => (values.some((v) => v !== null) ? values.reduce<number>((a, v) => a + (v ?? 0), 0) : null);

function totals(days: DayPerf[]) {
  const calls = { forecast: sum(days.map((d) => d.forecastCalls)), done: sum(days.map((d) => d.doneCalls)) };
  const crm = { forecast: sum(days.map((d) => d.forecastCrm)), done: sum(days.map((d) => d.doneCrm)) };
  const total = { forecast: sum([calls.forecast, crm.forecast]), done: sum([calls.done, crm.done]) };
  return { calls, crm, total };
}

/**
 * "Forecast & Tagesleistung": forecast against what is done — Telefonie, CRM and both together — for
 * the shown day, its week or its month (with the days of the week / the weeks of the month). Managers open the weekday editor from here.
 */
export function ForecastCard({
  isToday,
  day,
  week,
  month,
  reachability,
  target,
  editor,
}: {
  isToday: boolean;
  day: DayPerf;
  week: DayPerf[];
  month: DayPerf[];
  reachability: number | null;
  target: number;
  editor: { days: EditorDay[]; pattern: { weekday: number; calls: number | null; crm: number | null }[] } | null;
}) {
  const t = useT();
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("day");
  const shown = tab === "day" ? [day] : tab === "week" ? week : month;
  const tt = totals(shown);
  const label = (k: string, opts: Intl.DateTimeFormatOptions) => parseDateKey(k).toLocaleDateString(INTL_LOCALE[locale], { ...opts, timeZone: "UTC" });

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-title mb-0 flex items-center gap-2 whitespace-nowrap">
          <BarChart3 className="h-4 w-4 text-blue-600" /> {t("Forecast & Tagesleistung")}
        </h2>
        {editor && (
          <ForecastEditorButton
            key={editor.days.map((d) => `${d.calls}:${d.crm}`).join(",")}
            days={editor.days}
            pattern={editor.pattern}
            className="btn-secondary btn-sm whitespace-nowrap px-2 text-[11px]"
          />
        )}
      </div>

      <div className="flex gap-4 border-b border-zinc-100 text-xs" role="tablist">
        {(
          [
            ["day", isToday ? "Heute" : "Tag"],
            ["week", "Woche"],
            ["month", "Monat"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 px-2 py-1.5 ${tab === value ? "border-blue-600 font-medium text-blue-700" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
          >
            {t(text)}
          </button>
        ))}
      </div>

      {day.holiday && tab === "day" ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("Feiertag: {name}", { name: t(day.holiday) })} – {t("kein Forecast.")}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Tile title={t("Telefonie")} values={tt.calls} bar="bg-blue-600" tint="bg-blue-50/60" t={t} />
          <Tile title={t("CRM")} values={tt.crm} bar="bg-green-600" tint="bg-green-50/60" t={t} />
          <Tile title={t("Total Tasks")} values={tt.total} bar="bg-violet-500" tint="bg-violet-50/60" t={t} />
        </div>
      )}

      {tab === "day" && !day.holiday && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          {t("Kapazität {n} Anrufe", { n: day.capacity })} · {t("Erwartete Erreichbarkeit")}
          <span className={`badge ${reachabilityStyle(reachability, target)}`}>{reachability === null ? "—" : `${Math.round(reachability * 100)}%`}</span>
          <span>{t("Ziel {pct}", { pct: `${Math.round(target * 100)}%` })}</span>
        </p>
      )}
      {tab === "week" && <WeekChart days={week} t={t} label={(k) => label(k, { weekday: "short" })} />}
      {tab === "week" && <PeriodTable rows={week.map((d) => ({ key: d.dateKey, label: label(d.dateKey, { weekday: "short", day: "2-digit" }), days: [d] }))} t={t} />}
      {tab === "month" && <PeriodTable rows={byWeek(month).map((w) => ({ key: w[0].dateKey, label: `${label(w[0].dateKey, { day: "2-digit", month: "2-digit" })}–${label(w[w.length - 1].dateKey, { day: "2-digit", month: "2-digit" })}`, days: w }))} t={t} />}
    </div>
  );
}

function Tile({ title, values, bar, tint, t }: { title: string; values: { forecast: number | null; done: number | null }; bar: string; tint: string; t: T }) {
  const rest = values.forecast === null ? null : Math.max(0, values.forecast - (values.done ?? 0));
  const pct = values.forecast ? Math.min(100, Math.round(((values.done ?? 0) / values.forecast) * 100)) : null;
  return (
    <div className={`min-w-0 rounded-xl border border-zinc-200/70 p-2.5 ${tint}`}>
      <p className="text-xs font-semibold text-zinc-800">{title}</p>
      <dl className="mt-1 flex flex-col gap-0.5">
        {(
          [
            ["Forecast", values.forecast, "text-zinc-900"],
            ["Erledigt", values.done, "text-green-700"],
            ["Rest", rest, rest ? "text-red-600" : "text-zinc-900"],
          ] as const
        ).map(([name, v, color]) => (
          <div key={name} className="flex items-baseline justify-between gap-1">
            <dt className="text-[10px] text-zinc-500">{t(name)}</dt>
            <dd className={`text-base leading-tight font-semibold tabular-nums ${color}`}>{v ?? "–"}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200">
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct ?? 0}%` }} />
        </div>
        <span className="w-8 text-right text-[10px] font-medium tabular-nums text-zinc-600">{pct === null ? "–" : `${pct}%`}</span>
      </div>
    </div>
  );
}

function PeriodTable({ rows, t }: { rows: { key: string; label: string; days: DayPerf[] }[]; t: T }) {
  const num = (v: number | null) => (v === null ? "–" : v);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead className="text-[9px] leading-tight text-zinc-500">
          <tr className="border-b border-zinc-100">
            <th className="py-1 text-left font-medium" />
            <th className="py-1 text-right font-medium">{t("Forecast Anrufe")}</th>
            <th className="py-1 text-right font-medium">{t("Anrufe")}</th>
            <th className="py-1 text-right font-medium">{t("Forecast CRM")}</th>
            <th className="py-1 text-right font-medium">{t("CRM")}</th>
            <th className="py-1 text-right font-medium">{t("Kapazität")}</th>
            <th className="py-1 text-right font-medium">{t("Differenz")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50 tabular-nums">
          {rows.map((r) => {
            const tt = totals(r.days);
            const capacity = r.days.reduce((a, d) => a + d.capacity, 0);
            const holiday = r.days.length === 1 && r.days[0].holiday;
            const diff = tt.calls.forecast === null || holiday ? null : capacity - tt.calls.forecast;
            return (
              <tr key={r.key}>
                <td className="py-1 font-medium text-zinc-700">{r.label}</td>
                {holiday ? (
                  <td colSpan={6} className="py-1 text-right text-amber-700">
                    {t("Feiertag")}
                  </td>
                ) : (
                  <>
                    <td className="py-1 text-right text-zinc-600">{num(tt.calls.forecast)}</td>
                    <td className="py-1 text-right text-zinc-800">{num(tt.calls.done)}</td>
                    <td className="py-1 text-right text-zinc-600">{num(tt.crm.forecast)}</td>
                    <td className="py-1 text-right text-zinc-800">{num(tt.crm.done)}</td>
                    <td className="py-1 text-right text-zinc-600">{capacity}</td>
                    <td className={`py-1 text-right font-medium ${diff === null ? "text-zinc-400" : diff < 0 ? "text-red-600" : "text-green-700"}`}>
                      {diff === null ? "–" : diff > 0 ? `+${diff}` : diff}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The month's weekdays grouped into weeks (Mon–Fri). */
function byWeek(days: DayPerf[]): DayPerf[][] {
  const weeks: DayPerf[][] = [];
  for (const d of days) {
    const monday = parseDateKey(d.dateKey).getUTCDay() === 1;
    if (monday || weeks.length === 0) weeks.push([d]);
    else weeks[weeks.length - 1].push(d);
  }
  return weeks;
}

/** Bars = forecast calls per day, line = phone capacity of the people planned (plain SVG). */
function WeekChart({ days, t, label }: { days: DayPerf[]; t: T; label: (k: string) => string }) {
  const W = 360;
  const H = 120;
  const pad = { l: 28, r: 8, t: 8, b: 18 };
  const max = Math.max(1, ...days.map((d) => Math.max(d.forecastCalls ?? 0, d.capacity)));
  const step = (W - pad.l - pad.r) / days.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const cx = (i: number) => pad.l + step * i + step / 2;
  const line = days.map((d, i) => `${i ? "L" : "M"}${cx(i)},${y(d.capacity)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" role="img" aria-label={t("Forecast Anrufe und Kapazität pro Tag")}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="stroke-zinc-100" />
            <text x={pad.l - 4} y={y(max * f) + 3} textAnchor="end" className="fill-zinc-400 text-[8px]">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {days.map((d, i) => (
          <g key={d.dateKey}>
            <rect x={cx(i) - step * 0.3} width={step * 0.6} y={y(d.forecastCalls ?? 0)} height={y(0) - y(d.forecastCalls ?? 0)} rx={2} className="fill-blue-200" />
            <text x={cx(i)} y={H - 5} textAnchor="middle" className="fill-zinc-500 text-[9px]">
              {label(d.dateKey)}
            </text>
          </g>
        ))}
        <path d={line} fill="none" className="stroke-blue-800" strokeWidth={1.5} />
        {days.map((d, i) => (
          <circle key={d.dateKey} cx={cx(i)} cy={y(d.capacity)} r={2.5} className="fill-blue-800" />
        ))}
      </svg>
      <figcaption className="flex gap-4 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-blue-200" /> {t("Forecast Anrufe")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-blue-800" /> {t("Kapazität (Anrufe)")}
        </span>
      </figcaption>
    </figure>
  );
}
