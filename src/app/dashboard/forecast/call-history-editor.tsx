"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { loadCallHistoryYear, saveCallHistory } from "@/lib/actions/planning";
import { unwrap } from "@/lib/action-result";
import { monthLabel, parseDateKey, toDateKey, weekdaysInMonth } from "@/lib/dates";
import { holidayOn } from "@/lib/holidays";
import { INTL_LOCALE } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";

/** One year's saved figures: { "YYYY-MM-DD": [calls, crm] }. */
type YearData = Record<string, [number | null, number | null]>;
/** What is typed in, per day (kept while switching months, until saved). */
type Draft = Record<string, { calls: string; crm: string }>;

const toInput = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const fromInput = (v: string) => (v.trim() === "" ? null : Number(v));
const valid = (v: string) => v.trim() === "" || /^\d{1,6}$/.test(v.trim());

/**
 * "Ist-Werte vergangener Jahre": one month of working days at a time; the manager types in how many
 * calls came in and how many CRM tasks were done each day. Each year is loaded once and months are
 * switched in the browser (instant); the other years load in the background. Typed values survive
 * switching months, and "Speichern" saves everything changed.
 */
export function CallHistoryEditor({
  years,
  todayKey,
  initialYear,
  initialMonth,
  initialData,
}: {
  years: number[];
  todayKey: string;
  initialYear: number;
  initialMonth: number;
  initialData: YearData;
}) {
  const t = useT();
  const locale = useLocale();
  const [saving, startSaving] = useTransition();
  const [loading, setLoading] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [data, setData] = useState<Record<number, YearData>>({ [initialYear]: initialData });
  const [draft, setDraft] = useState<Draft>({});
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  const thisYear = Number(todayKey.slice(0, 4));
  const thisMonth = Number(todayKey.slice(5, 7));
  const lastMonthOf = (y: number) => (y === thisYear ? thisMonth : 12);

  // the other years in the background, so switching year is instant too
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const y of years) {
        if (y === initialYear) continue;
        const d = await loadCallHistoryYear(y).catch(() => null);
        if (d && !cancelled) setData((all) => (all[y] ? all : { ...all, [y]: d }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [years, initialYear]);

  // keep the shown month in the URL (reload / link opens the same month), without a page load
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("hy", String(year));
    url.searchParams.set("hm", String(month));
    window.history.replaceState(window.history.state, "", url);
  }, [year, month]);

  async function go(y: number, m: number) {
    setMessage(null);
    setYear(y);
    setMonth(Math.min(m, lastMonthOf(y)));
    if (!data[y]) {
      setLoading(y);
      try {
        const d = await loadCallHistoryYear(y);
        setData((all) => ({ ...all, [y]: d }));
      } catch {
        setMessage({ ok: false, text: t("Konnte nicht geladen werden.") });
      }
      setLoading(null);
    }
  }

  const yearData = data[year];
  const days = weekdaysInMonth(year, month).map((d) => {
    const k = toDateKey(d);
    return { k, holiday: holidayOn(k), future: k > todayKey };
  });
  const editable = (d: (typeof days)[number]) => !d.holiday && !d.future;
  const saved = (k: string) => data[Number(k.slice(0, 4))]?.[k];
  const value = (k: string, field: "calls" | "crm") => draft[k]?.[field] ?? toInput(saved(k)?.[field === "calls" ? 0 : 1]);
  const setValue = (k: string, field: "calls" | "crm", v: string) =>
    setDraft((all) => ({ ...all, [k]: { calls: value(k, "calls"), crm: value(k, "crm"), [field]: v } }));

  // days whose typed value differs from what is saved
  const changed = Object.entries(draft).filter(([k, d]) => {
    const s = saved(k);
    return fromInput(d.calls) !== (s?.[0] ?? null) || fromInput(d.crm) !== (s?.[1] ?? null);
  });
  const ok = Object.values(draft).every((d) => valid(d.calls) && valid(d.crm));
  const total = (field: "calls" | "crm") => days.reduce((a, d) => a + (editable(d) && valid(value(d.k, field)) ? (fromInput(value(d.k, field)) ?? 0) : 0), 0);
  const filled = days.filter((d) => editable(d) && (value(d.k, "calls").trim() !== "" || value(d.k, "crm").trim() !== "")).length;
  const label = (k: string) => parseDateKey(k).toLocaleDateString(INTL_LOCALE[locale], { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const hasPrev = years.includes(prev.y);
  const hasNext = years.includes(next.y) && next.m <= lastMonthOf(next.y);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        const days = changed.map(([date, d]) => ({ date, calls: fromInput(d.calls), crm: fromInput(d.crm) }));
        startSaving(async () => {
          try {
            await unwrap(saveCallHistory({ days }));
            setData((all) => {
              const nextData = { ...all };
              for (const d of days) {
                const y = Number(d.date.slice(0, 4));
                nextData[y] = { ...nextData[y], [d.date]: [d.calls, d.crm] };
              }
              return nextData;
            });
            setDraft({});
            setMessage({ ok: true, text: days.length === 1 ? t("1 Tag gespeichert.") : t("{n} Tage gespeichert.", { n: days.length }) });
          } catch (err) {
            setMessage({ ok: false, text: err instanceof Error ? err.message : t("Konnte nicht gespeichert werden.") });
          }
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-zinc-200/70 bg-white p-1 text-xs shadow-sm" role="group" aria-label={t("Jahr")}>
          {years.map((y) => (
            <button
              key={y}
              type="button"
              aria-pressed={y === year}
              onClick={() => go(y, month)}
              className={`rounded-lg px-3 py-1.5 font-medium ${y === year ? "bg-brand-50 text-brand-700" : "text-zinc-500 hover:text-zinc-900"}`}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white p-1 text-sm shadow-sm">
          <button type="button" className="btn-ghost btn-sm disabled:opacity-30" disabled={!hasPrev} onClick={() => go(prev.y, prev.m)} aria-label={t("Vorheriger Monat")}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-32 px-2 text-center font-medium text-zinc-900">{monthLabel(year, month, locale)}</span>
          <button type="button" className="btn-ghost btn-sm disabled:opacity-30" disabled={!hasNext} onClick={() => go(next.y, next.m)} aria-label={t("Nächster Monat")}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {loading !== null && (
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Lädt…")}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full max-w-xl text-left text-sm">
          <thead className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2 pr-3 font-medium">{t("Tag")}</th>
              <th className="py-2 pr-3 font-medium">{t("Anrufe")}</th>
              <th className="py-2 pr-3 font-medium">{t("CRM-Tasks")}</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-zinc-50 ${yearData ? "" : "opacity-40"}`}>
            {days.map((d) => (
              <tr key={d.k} className={d.holiday ? "bg-amber-50/60" : d.future ? "text-zinc-400" : ""}>
                <td className="py-1 pr-3 whitespace-nowrap font-medium tabular-nums">{label(d.k)}</td>
                {d.holiday ? (
                  <td colSpan={2} className="py-1 pr-3 text-xs text-amber-800">
                    {t("Feiertag")}: {t(d.holiday)}
                  </td>
                ) : (
                  (
                    [
                      ["calls", "Anrufe"],
                      ["crm", "CRM-Tasks"],
                    ] as const
                  ).map(([field, name]) => {
                    const v = value(d.k, field);
                    return (
                      <td key={field} className="py-1 pr-3">
                        <input
                          inputMode="numeric"
                          disabled={d.future || !yearData}
                          aria-label={`${t(name)} ${label(d.k)}`}
                          className={`input w-28 py-1 text-right tabular-nums ${valid(v) ? "" : "border-red-400 ring-1 ring-red-300"} ${draft[d.k] ? "bg-amber-50" : ""}`}
                          value={v}
                          placeholder={d.future ? "" : "–"}
                          onChange={(e) => setValue(d.k, field, e.target.value)}
                        />
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-zinc-200 text-sm font-semibold text-zinc-800">
            <tr>
              <td className="py-2 pr-3">{t("Total Monat")}</td>
              <td className="py-2 pr-3">
                <span className="inline-block w-28 px-3 text-right tabular-nums">{total("calls")}</span>
              </td>
              <td className="py-2 pr-3">
                <span className="inline-block w-28 px-3 text-right tabular-nums">{total("crm")}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={saving || !ok || changed.length === 0}>
          {saving ? t("Wird gespeichert…") : t("Speichern")}
        </button>
        <span className="text-xs text-zinc-500">{t("{n} von {m} Arbeitstagen erfasst", { n: filled, m: days.filter(editable).length })}</span>
        {changed.length > 0 && <span className="text-xs font-medium text-amber-700">{t("{n} ungespeicherte Änderungen", { n: changed.length })}</span>}
        {!ok && <span className="text-xs text-red-600">{t("Nur ganze Zahlen eingeben.")}</span>}
      </div>
      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`} role="status">
          {message.text}
        </p>
      )}
    </form>
  );
}
