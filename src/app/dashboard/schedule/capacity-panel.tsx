"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { clearForecast, saveForecast, saveTaskCount } from "@/lib/actions/planning";
import { MAX_CONCURRENT_BREAKS, SKILL_CODES } from "@/lib/constants";
import { minutesToTime } from "@/lib/dates";
import { requiredAgents, staffingOf, type HourRow, type SlotSummary, type Staffing } from "@/lib/capacity";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n";
import { LanguageBadges } from "@/components/language-badge";
import type { ForecastSource } from "@/lib/day-forecasts";

export type ForecastInfo = {
  source: ForecastSource;
  total: number | null;
  /** the automatic forecast from the call history, for reference */
  autoTotal: number | null;
};

const STAFFING_STYLE: Record<Staffing, string> = {
  under: "bg-red-100 text-red-700",
  ok: "bg-green-100 text-green-700",
  over: "bg-sky-100 text-sky-700",
  unknown: "bg-zinc-100 text-zinc-500",
};
const CELL_STYLE: Record<Staffing, string> = {
  under: "bg-red-200 text-red-900",
  ok: "bg-green-100 text-green-900",
  over: "bg-sky-100 text-sky-900",
  unknown: "bg-zinc-50 text-zinc-700",
};

function staffingLabel(row: HourRow, t: T) {
  if (row.diff === null) return "–";
  if (row.staffing === "under") return `${t("Unterbesetzt")} ${row.diff}`;
  if (row.staffing === "over") return `${t("Überbesetzt")} +${row.diff}`;
  return "OK";
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function CapacityPanel({
  dateKey,
  rows,
  crmDone,
  slots,
  forecast,
  canEdit,
}: {
  dateKey: string;
  rows: HourRow[];
  /** completed CRM tasks per hour (same order as rows) */
  crmDone: (number | null)[];
  slots: SlotSummary[];
  forecast: ForecastInfo;
  canEdit: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dayTotal, setDayTotal] = useState(forecast.total?.toString() ?? "");
  const [hourly, setHourly] = useState(rows.map((r) => r.forecast?.toString() ?? ""));
  const [done, setDone] = useState(rows.map((r) => r.done?.toString() ?? ""));
  const [crm, setCrm] = useState(crmDone.map((v) => v?.toString() ?? ""));

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Konnte nicht gespeichert werden."));
      }
    });
  }

  const totalForecast = rows.reduce((a, r) => a + (r.forecast ?? 0), 0);
  const totalCapacity = rows.reduce((a, r) => a + r.capacity, 0);
  const withDone = rows.filter((r) => r.done !== null);
  const doneSum = withDone.reduce((a, r) => a + (r.done ?? 0), 0);
  const plannedForDone = withDone.reduce((a, r) => a + (r.forecast ?? 0), 0);
  const under = rows.filter((r) => r.staffing === "under");
  const over = rows.filter((r) => r.staffing === "over");
  const hasForecast = forecast.source !== "none";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={t("Forecast Tag")}
          value={hasForecast ? totalForecast.toString() : "–"}
          note={forecast.source === "holiday" ? t("Feiertag") : forecast.source === "pattern" ? t("aus dem Wochenmuster") : forecast.source === "manual" ? t("manuell erfasst") : forecast.source === "auto" ? t("automatisch aus Anrufhistorie") : t("noch kein Forecast")}
        />
        <Kpi
          label={t("Erledigt (Soll-Ist)")}
          value={withDone.length ? doneSum.toString() : "–"}
          note={withDone.length ? t("Soll {n} in {h} erfassten Stunden", { n: plannedForDone, h: withDone.length }) : t("noch keine Tasks erfasst")}
          tone={withDone.length ? (doneSum >= plannedForDone ? "good" : "warn") : undefined}
        />
        <Kpi
          label={t("Kapazität Tag")}
          value={totalCapacity.toString()}
          note={hasForecast && totalForecast > 0 ? t("Abdeckung {pct}", { pct: pct(Math.min(1, totalCapacity / totalForecast)) }) : t("Anrufe, nach Pausen und Terminen")}
          tone={hasForecast && totalForecast > 0 ? (totalCapacity >= totalForecast * 0.9 ? "good" : "warn") : undefined}
        />
        <Kpi
          label={t("Besetzung")}
          value={hasForecast ? (under.length ? t("{n} h unterbesetzt", { n: under.length }) : t("ausreichend")) : "–"}
          note={
            hasForecast
              ? [
                  under.length ? `${t("knapp")}: ${under.map((r) => `${r.hour}h`).join(", ")}` : "",
                  over.length ? `${t("frei")}: ${over.map((r) => `${r.hour}h`).join(", ")}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || t("alle Stunden im Soll")
              : t("Forecast erfassen, um Bedarf zu sehen")
          }
          tone={hasForecast ? (under.length ? "bad" : "good") : undefined}
        />
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200/70 bg-zinc-50/60 p-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            {t("Forecast Tag (Anrufe/Tasks)")}
            <input
              type="number"
              min={0}
              className="input w-36 py-1"
              value={dayTotal}
              onChange={(e) => setDayTotal(e.target.value)}
              placeholder={forecast.autoTotal?.toString() ?? ""}
            />
          </label>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={pending || dayTotal === ""}
            onClick={() => run(() => saveForecast({ date: dateKey, total: Number(dayTotal) }))}
          >
            {t("Auf Stunden verteilen")}
          </button>
          {forecast.source === "manual" && (
            <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => clearForecast(dateKey))}>
              <RotateCcw className="h-3.5 w-3.5" /> {t("Automatische Prognose")}{forecast.autoTotal !== null ? ` (${forecast.autoTotal})` : ""}
            </button>
          )}
          <p className="text-xs text-zinc-500">
            {t("Der Tageswert wird nach dem üblichen Tagesverlauf auf die Stunden verteilt. Einzelne Stunden und erledigte Tasks können Sie direkt in der Tabelle anpassen.")}
          </p>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50/60 text-[11px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">{t("Zeit")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Forecast")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Erledigt")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("CRM erledigt")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Soll-Ist")}</th>
              <th className="px-3 py-2 text-right font-medium" title={t("Wenigste verfügbare Personen in einem 15-Minuten-Fenster dieser Stunde")}>
                {t("Verfügbar")}
              </th>
              <th className="px-3 py-2 text-right font-medium">{t("Benötigt")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Kapazität")}</th>
              <th className="px-3 py-2 font-medium">{t("Besetzung")}</th>
              {SKILL_CODES.map((k) => (
                <th key={k} className="px-2 py-2 text-right font-medium">
                  <LanguageBadges codes={[k]} size="xs" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r, i) => {
              const gap = r.done !== null && r.forecast !== null ? r.done - r.forecast : null;
              return (
                <tr key={r.hour}>
                  <td className="px-3 py-1.5 font-medium tabular-nums text-zinc-800">
                    {minutesToTime(r.hour * 60)}–{minutesToTime((r.hour + 1) * 60)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {canEdit ? (
                      <input
                        type="number"
                        min={0}
                        className="input w-20 py-0.5 text-right text-sm"
                        value={hourly[i]}
                        onChange={(e) => setHourly((h) => h.map((v, j) => (j === i ? e.target.value : v)))}
                        onBlur={() => {
                          if (hourly[i] === (r.forecast?.toString() ?? "")) return;
                          run(() => saveForecast({ date: dateKey, hourly: hourly.map((v) => Number(v) || 0) }));
                        }}
                      />
                    ) : (
                      (r.forecast ?? "–")
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {canEdit ? (
                      <input
                        type="number"
                        min={0}
                        className="input w-20 py-0.5 text-right text-sm"
                        aria-label={`${t("Erledigt")} ${r.hour}h`}
                        value={done[i]}
                        placeholder="–"
                        onChange={(e) => setDone((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
                        onBlur={() => {
                          if (done[i] === (r.done?.toString() ?? "")) return;
                          run(() => saveTaskCount({ date: dateKey, hour: r.hour, done: done[i] === "" ? null : Number(done[i]) }));
                        }}
                      />
                    ) : (
                      (r.done ?? "–")
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {canEdit ? (
                      <input
                        type="number"
                        min={0}
                        className="input w-20 py-0.5 text-right text-sm"
                        value={crm[i]}
                        placeholder="–"
                        aria-label={`${t("CRM erledigt")} ${r.hour}h`}
                        onChange={(e) => setCrm((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                        onBlur={() => {
                          if (crm[i] === (crmDone[i]?.toString() ?? "")) return;
                          run(() => saveTaskCount({ date: dateKey, hour: r.hour, crmDone: crm[i] === "" ? null : Number(crm[i]) }));
                        }}
                      />
                    ) : (
                      (crmDone[i] ?? "–")
                    )}
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${gap === null ? "text-zinc-400" : gap >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {gap === null ? "–" : gap > 0 ? `+${gap}` : gap}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.minAvailable}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600">{r.required ?? "–"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600">{r.capacity}</td>
                  <td className="px-3 py-1.5">
                    <span className={`badge ${STAFFING_STYLE[r.staffing]}`}>{staffingLabel(r, t)}</span>
                  </td>
                  {SKILL_CODES.map((k) => (
                    <td key={k} className={`px-2 py-1.5 text-right tabular-nums ${r.bySkill[k] === 0 ? "font-semibold text-red-600" : "text-zinc-600"}`}>
                      {r.bySkill[k]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SlotStrip rows={rows} slots={slots} t={t} />
    </div>
  );
}

/** 15-minute view: free people per slot, coloured against the hour's need; language rows below. */
function SlotStrip({ rows, slots, t }: { rows: HourRow[]; slots: SlotSummary[]; t: T }) {
  const forecastOf = (minute: number) => rows.find((r) => r.hour === Math.floor(minute / 60))?.forecast ?? null;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <span className="font-medium text-zinc-700">{t("Verfügbare Personen pro 15 Minuten")}</span>
        <Legend className="bg-red-200" label={t("unterbesetzt")} />
        <Legend className="bg-green-100" label={t("im Soll")} />
        <Legend className="bg-sky-100" label={t("freie Kapazität")} />
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-medium text-zinc-500" />
              {slots.map((s) => (
                <th key={s.minute} className="w-7 px-0 py-1 text-center font-normal text-zinc-400">
                  {s.minute % 60 === 0 ? minutesToTime(s.minute) : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="sticky left-0 z-10 bg-white px-2 py-1 font-medium text-zinc-700">{t("Total")}</td>
              {slots.map((s) => {
                const f = forecastOf(s.minute);
                const st = f === null ? "unknown" : staffingOf(s.available - requiredAgents(f));
                return (
                  <td key={s.minute} className={`border border-white text-center tabular-nums ${CELL_STYLE[st]}`}>
                    {s.available}
                  </td>
                );
              })}
            </tr>
            {SKILL_CODES.map((k) => (
              <tr key={k}>
                <td className="sticky left-0 z-10 bg-white px-2 py-1">
                  <LanguageBadges codes={[k]} size="xs" />
                </td>
                {slots.map((s) => (
                  <td
                    key={s.minute}
                    className={`border border-white text-center tabular-nums ${s.bySkill[k] === 0 ? "bg-red-100 font-semibold text-red-700" : "bg-zinc-50 text-zinc-600"}`}
                  >
                    {s.bySkill[k]}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 z-10 bg-white px-2 py-1 text-zinc-400" title={t("Maximal {max} Personen gleichzeitig in Pause", { max: MAX_CONCURRENT_BREAKS })}>
                {t("Pause")} (max {MAX_CONCURRENT_BREAKS})
              </td>
              {slots.map((s) => (
                <td
                  key={s.minute}
                  className={`border border-white text-center tabular-nums ${s.onBreak > MAX_CONCURRENT_BREAKS ? "bg-red-200 font-semibold text-red-800" : "text-zinc-400"}`}
                >
                  {s.onBreak || ""}
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-white px-2 py-1 text-zinc-400">{t("Termin")}</td>
              {slots.map((s) => (
                <td key={s.minute} className="border border-white text-center tabular-nums text-zinc-400">
                  {s.fixed || ""}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-3 w-3 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-green-700" : "text-zinc-900";
  return (
    <div className="rounded-xl border border-zinc-200/70 bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{note}</p>
    </div>
  );
}
