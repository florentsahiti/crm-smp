"use client";

import { useState, useTransition } from "react";
import { Coffee } from "lucide-react";
import { createShiftBlock, deleteShiftBlock, setWorkMode } from "@/lib/actions/shifts";
import {
  ABSENCE_TYPE_LABELS,
  BREAK_RULES,
  BREAK_TYPES,
  DUTY_TYPE_LABELS,
  HALF_DAY_LABELS,
  SLOT_MINUTES,
  isBackoffice,
  isBreak,
  type BreakType,
  type AbsenceType,
  type DutyType,
  type HalfDay,
  type Location,
} from "@/lib/constants";
import { minutesToTime } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { unwrap } from "@/lib/action-result";

export function DayCard({
  dateKey,
  label,
  absences,
  blocks,
  employeeId,
  homeOffice,
  canSetWorkMode,
}: {
  dateKey: string;
  label: string;
  absences: { halfDay: HalfDay; type: AbsenceType }[];
  blocks: { id: string; startMinute: number; endMinute: number; dutyType: DutyType; location: Location | null; note?: string | null }[];
  employeeId: string;
  homeOffice: boolean;
  canSetWorkMode: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<BreakType>("break_am");
  const [start, setStart] = useState(10 * 60 + 30);
  const [length, setLength] = useState(15);
  const rule = BREAK_RULES[type];
  const starts: number[] = [];
  for (let m = rule.from; m + length <= rule.to; m += SLOT_MINUTES) starts.push(m);

  function chooseType(next: BreakType) {
    const r = BREAK_RULES[next];
    const len = r.durations[r.durations.length - 1];
    setType(next);
    setLength(len);
    setStart(next === "break_am" ? 10 * 60 + 30 : next === "break_pm" ? 15 * 60 + 15 : 12 * 60);
  }

  const backoffice = blocks.some((b) => isBackoffice(b.dutyType));
  const fullDayAbsent = absences.some((a) => a.halfDay === "FULL") || absences.length >= 2;
  const modes = [
    { mode: "HO", label: "Home Office", active: homeOffice, on: "bg-sky-600 text-white border-sky-600" },
    { mode: "BO", label: "Backoffice", active: backoffice, on: "bg-teal-600 text-white border-teal-600" },
  ] as const;
  const showModes = canSetWorkMode && !fullDayAbsent;

  function toggleMode(mode: "HO" | "BO", on: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await unwrap(setWorkMode({ employeeId, date: dateKey, mode, on }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Etwas ist schiefgelaufen."));
      }
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200/70 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-800">{label}</p>
        {/* Home office / backoffice for this day: the employee sets it themselves (from today on) */}
        <span className="flex gap-1">
          {modes
            .filter((m) => showModes || m.active)
            .map((m) => (
              <button
                key={m.mode}
                type="button"
                disabled={pending || !showModes}
                aria-pressed={m.active}
                title={t(m.label)}
                onClick={() => toggleMode(m.mode, !m.active)}
                className={`rounded border px-1.5 text-[10px] font-bold leading-5 disabled:cursor-default ${
                  m.active ? m.on : "border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-500 hover:text-zinc-700"
                }`}
              >
                {m.mode}
              </button>
            ))}
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-1">
        {absences.map((a, i) => (
          <span key={i} className="w-fit rounded bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">
            {t(HALF_DAY_LABELS[a.halfDay])}: {t(ABSENCE_TYPE_LABELS[a.type])}
          </span>
        ))}

        {blocks.filter((b) => !isBackoffice(b.dutyType)).map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-md bg-tone-violet-20 px-2 py-0.5 text-xs text-[#3b3270]">
            <span className="flex items-center gap-1">
              {isBreak(b.dutyType) && <Coffee className="h-3 w-3 shrink-0" aria-label={t("Pause")} />}
              {minutesToTime(b.startMinute)}–{minutesToTime(b.endMinute)} {b.dutyType === "other" && b.note ? b.note : t(DUTY_TYPE_LABELS[b.dutyType])}
            </span>
            {isBreak(b.dutyType) && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    try {
                      await unwrap(deleteShiftBlock(b.id));
                    } catch (err) {
                      setError(err instanceof Error ? err.message : t("Etwas ist schiefgelaufen."));
                    }
                  })
                }
                className="ml-1 text-[#3b3270] hover:text-tone-red"
                aria-label={t("Pause entfernen")}
              >
                ×
              </button>
            )}
          </div>
        ))}

        {backoffice && <p className="text-xs text-teal-800">{t("Backoffice – nur E-Mail, keine Anrufe")}</p>}
        {homeOffice && <p className="text-xs text-sky-800">{t("Home Office")}</p>}

        {absences.length === 0 && blocks.length === 0 && !homeOffice && (
          <p className="text-xs text-zinc-400">{t("Nichts geplant.")}</p>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {showForm ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <select
            value={type}
            onChange={(e) => chooseType(e.target.value as BreakType)}
            className="w-full rounded border border-zinc-300 px-1 py-0.5 text-xs"
          >
            {BREAK_TYPES.map((breakType) => (
              <option key={breakType} value={breakType}>
                {t(DUTY_TYPE_LABELS[breakType])}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <select
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
              className="w-full rounded border border-zinc-300 px-1 py-0.5 text-xs"
            >
              {starts.map((m) => (
                <option key={m} value={m}>
                  {minutesToTime(m)}
                </option>
              ))}
            </select>
            {rule.durations.length > 1 ? (
              <select
                value={length}
                onChange={(e) => {
                  const len = Number(e.target.value);
                  setLength(len);
                  if (start + len > rule.to) setStart(rule.to - len);
                }}
                className="w-full rounded border border-zinc-300 px-1 py-0.5 text-xs"
              >
                {rule.durations.map((d) => (
                  <option key={d} value={d}>
                    {t("{n} Min.", { n: d })}
                  </option>
                ))}
              </select>
            ) : (
              <span className="shrink-0 text-xs text-zinc-500">{t("{n} Min.", { n: 15 })}</span>
            )}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={pending}
              className="btn-primary btn-sm flex-1"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await unwrap(createShiftBlock({
                      employeeId,
                      date: dateKey,
                      startMinute: start,
                      endMinute: start + length,
                      dutyType: type,
                      location: null,
                    }));
                    setShowForm(false);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : t("Die Pause konnte nicht hinzugefügt werden."));
                  }
                });
              }}
            >
              {t("Hinzufügen")}
            </button>
            <button
              type="button"
              className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-50"
              onClick={() => setShowForm(false)}
            >
              {t("Abbrechen")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-2 text-xs text-zinc-500 hover:text-zinc-900"
        >
          + {t("Pause hinzufügen")}
        </button>
      )}
    </div>
  );
}
