"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";
import { saveForecastWeek, saveWeekdayDefaults } from "@/lib/actions/planning";
import { unwrap } from "@/lib/action-result";
import { parseDateKey } from "@/lib/dates";
import type { EditorDay } from "@/lib/day-forecasts";
import { INTL_LOCALE } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr"];
const toInput = (v: number | null) => (v === null ? "" : String(v));
const fromInput = (v: string) => (v.trim() === "" ? null : Number(v));
const valid = (v: string) => v.trim() === "" || /^\d{1,6}$/.test(v.trim());

function useSave() {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const save = (action: () => Promise<unknown>, done?: () => void) => {
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        setMessage({ ok: true, text: t("Gespeichert.") });
        done?.();
      } catch (err) {
        setMessage({ ok: false, text: err instanceof Error ? err.message : t("Konnte nicht gespeichert werden.") });
      }
    });
  };
  return { pending, message, save };
}

function Message({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`} role="status">
      {message.text}
    </p>
  );
}

/**
 * Forecast for one week, Mo–Fr side by side: expected calls (Telefonie) and CRM tasks per day, next to
 * the automatic forecast, the people on the phone, the capacity and the difference. Empty = the day
 * uses the Wochenmuster or the automatic forecast. One "Speichern" for the whole week.
 */
export function ForecastWeekEditor({ days, onSaved }: { days: EditorDay[]; onSaved?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [calls, setCalls] = useState(days.map((d) => toInput(d.calls)));
  const [crm, setCrm] = useState(days.map((d) => toInput(d.crm)));
  const { pending, message, save } = useSave();
  const ok = calls.every(valid) && crm.every(valid);
  const label = (k: string) => parseDateKey(k).toLocaleDateString(INTL_LOCALE[locale], { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const sourceLabel = { pattern: t("Wochenmuster"), auto: t("automatisch"), none: "–" } as const;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="py-1.5 pr-2 font-medium" />
              {days.map((d) => (
                <th key={d.dateKey} className={`px-1.5 py-1.5 font-medium ${d.holiday ? "text-amber-800" : ""}`}>
                  {label(d.dateKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            <tr>
              <th className="py-1.5 pr-2 text-left text-xs font-medium text-zinc-600">{t("Anrufe (Telefonie)")}</th>
              {days.map((d, i) => (
                <td key={d.dateKey} className="px-1.5 py-1.5 align-top">
                  {d.holiday ? (
                    <span className="badge bg-amber-100 text-amber-800" title={t(d.holiday)}>
                      {t("Feiertag")}
                    </span>
                  ) : (
                    <>
                      <input
                        inputMode="numeric"
                        aria-label={`${t("Anrufe (Telefonie)")} ${label(d.dateKey)}`}
                        className={`input w-20 py-1 text-right ${valid(calls[i]) ? "" : "border-red-400"}`}
                        value={calls[i]}
                        placeholder={toInput(d.fallback)}
                        onChange={(e) => setCalls((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                      />
                      <p className="mt-0.5 text-[10px] text-zinc-400">{calls[i].trim() === "" ? sourceLabel[d.fallbackSource] : t("manuell")}</p>
                    </>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th className="py-1.5 pr-2 text-left text-xs font-medium text-zinc-600">{t("CRM-Tasks")}</th>
              {days.map((d, i) => (
                <td key={d.dateKey} className="px-1.5 py-1.5">
                  {!d.holiday && (
                    <input
                      inputMode="numeric"
                      aria-label={`${t("CRM-Tasks")} ${label(d.dateKey)}`}
                      className={`input w-20 py-1 text-right ${valid(crm[i]) ? "" : "border-red-400"}`}
                      value={crm[i]}
                      placeholder={toInput(d.fallbackCrm)}
                      onChange={(e) => setCrm((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                    />
                  )}
                </td>
              ))}
            </tr>
            <Row label={t("Automatische Prognose")} days={days} render={(d) => (d.holiday ? "–" : (d.auto ?? "–"))} />
            <Row label={t("Telefonie VM / NM")} days={days} render={(d) => (d.holiday ? "–" : `${d.onPhoneAM} / ${d.onPhonePM}`)} />
            <Row label={t("Kapazität")} days={days} render={(d) => (d.holiday ? "–" : d.capacity)} />
            <Row
              label={t("Differenz")}
              days={days}
              render={(d, i) => {
                const expected = fromInput(calls[i]) ?? d.fallback;
                if (d.holiday || expected === null || !valid(calls[i])) return "–";
                const diff = d.capacity - expected;
                return <span className={`badge ${diff < 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{diff > 0 ? `+${diff}` : diff}</span>;
              }}
            />
          </tbody>
        </table>
      </div>
      <Message message={message} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">{t("Leer = Wochenmuster bzw. automatische Prognose. Ein geänderter Tageswert wird wieder nach dem üblichen Tagesverlauf auf die Stunden verteilt.")}</p>
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={pending || !ok}
          onClick={() =>
            save(
              () => unwrap(saveForecastWeek({ days: days.map((d, i) => ({ date: d.dateKey, calls: fromInput(calls[i]), crm: fromInput(crm[i]) })) })),
              onSaved
            )
          }
        >
          {pending ? t("Wird gespeichert…") : t("Woche speichern")}
        </button>
      </div>
    </div>
  );
}

function Row({ label, days, render }: { label: string; days: EditorDay[]; render: (d: EditorDay, i: number) => React.ReactNode }) {
  return (
    <tr>
      <th className="py-1.5 pr-2 text-left text-xs font-normal text-zinc-500">{label}</th>
      {days.map((d, i) => (
        <td key={d.dateKey} className="px-1.5 py-1.5 tabular-nums text-zinc-700">
          {render(d, i)}
        </td>
      ))}
    </tr>
  );
}

/** Wochenmuster: the standard calls/CRM per weekday, used for every week without manual values. */
export function WeekdayPatternEditor({ pattern }: { pattern: { weekday: number; calls: number | null; crm: number | null }[] }) {
  const t = useT();
  const [calls, setCalls] = useState(pattern.map((p) => toInput(p.calls)));
  const [crm, setCrm] = useState(pattern.map((p) => toInput(p.crm)));
  const { pending, message, save } = useSave();
  const ok = calls.every(valid) && crm.every(valid);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] items-center gap-x-2 gap-y-1.5 text-sm">
        <span />
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {t(w)}
          </span>
        ))}
        <span className="pr-2 text-xs font-medium text-zinc-600">{t("Anrufe")}</span>
        {calls.map((v, i) => (
          <input
            key={i}
            inputMode="numeric"
            aria-label={`${t("Anrufe")} ${t(WEEKDAYS[i])}`}
            className={`input py-1 text-right ${valid(v) ? "" : "border-red-400"}`}
            value={v}
            placeholder="–"
            onChange={(e) => setCalls((c) => c.map((x, j) => (j === i ? e.target.value : x)))}
          />
        ))}
        <span className="pr-2 text-xs font-medium text-zinc-600">{t("CRM")}</span>
        {crm.map((v, i) => (
          <input
            key={i}
            inputMode="numeric"
            aria-label={`${t("CRM")} ${t(WEEKDAYS[i])}`}
            className={`input py-1 text-right ${valid(v) ? "" : "border-red-400"}`}
            value={v}
            placeholder="–"
            onChange={(e) => setCrm((c) => c.map((x, j) => (j === i ? e.target.value : x)))}
          />
        ))}
      </div>
      <Message message={message} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">{t("Gilt für jede Woche ohne manuelle Werte. Leer = automatische Prognose aus der Anrufhistorie.")}</p>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={pending || !ok}
          onClick={() => save(() => unwrap(saveWeekdayDefaults({ days: pattern.map((p, i) => ({ weekday: p.weekday, calls: fromInput(calls[i]), crm: fromInput(crm[i]) })) })))}
        >
          {t("Wochenmuster speichern")}
        </button>
      </div>
    </div>
  );
}

/** "Forecast bearbeiten" on the Einsatzplan: the week editor (and Wochenmuster) in a dialog. */
export function ForecastEditorButton({
  days,
  pattern,
  className = "btn-secondary btn-sm",
}: {
  days: EditorDay[];
  pattern: { weekday: number; calls: number | null; crm: number | null }[];
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" /> {t("Forecast bearbeiten")}
      </button>
      {open && <EditorDialog days={days} pattern={pattern} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditorDialog({ days, pattern, onClose }: { days: EditorDay[]; pattern: { weekday: number; calls: number | null; crm: number | null }[]; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-zinc-900/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{t("Forecast der Woche")}</h2>
            <p className="text-sm text-zinc-500">{t("Erwartete Anrufe und CRM-Tasks pro Wochentag.")}</p>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label={t("Schliessen")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <ForecastWeekEditor days={days} />
        <div className="border-t border-zinc-100 pt-4">
          <h3 className="section-title">{t("Wochenmuster")}</h3>
          <WeekdayPatternEditor pattern={pattern} />
        </div>
      </div>
    </dialog>
  );
}
