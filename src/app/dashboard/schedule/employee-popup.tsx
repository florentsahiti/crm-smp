"use client";

import { useState } from "react";
import { Undo2, Users } from "lucide-react";
import { cancelAbsence, removeBackoffice, reportAbsenceRange, reportShortNoticeAbsence, setBackoffice } from "@/lib/actions/shifts";
import { unwrap } from "@/lib/action-result";
import { ABSENCE_TYPES, ABSENCE_TYPE_LABELS, type AbsenceType } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";

type Person = { id: string; name: string };
/** the person's absence on the shown day (managers only see the reason) */
export type AbsenceInfo = { label: string; halves: ("AM" | "PM")[] };
type Run = (action: () => Promise<unknown>) => void;

/** "Nur heute" / "Zeitraum" switch shared by the sections of the popup. */
function ScopeSwitch({ value, onChange }: { value: "day" | "range"; onChange: (v: "day" | "range") => void }) {
  const t = useT();
  return (
    <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-0.5 text-[11px]">
      {(
        [
          ["day", "Nur heute"],
          ["range", "Zeitraum"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          className={`rounded-md px-2 py-1 ${value === v ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500"}`}
          onClick={() => onChange(v)}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}

function RangeInputs({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  const t = useT();
  return (
    <div className="mt-2 grid grid-cols-2 gap-1">
      <label className="flex flex-col gap-0.5 text-[10px] text-zinc-500">
        {t("Von")}
        <input
          type="date"
          className="input px-1.5 py-1 text-xs"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            if (to < e.target.value) setTo(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-zinc-500">
        {t("Bis")}
        <input type="date" className="input px-1.5 py-1 text-xs" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </label>
    </div>
  );
}

/**
 * The person is already absent on the shown day: cancel it (e.g. "Krank" entered for the wrong
 * person), for this day or the whole period. The blocks removed with it come back. Asks once more first.
 */
function CancelAbsenceBox({ employee, dateKey, absence, pending, run }: { employee: Person; dateKey: string; absence: AbsenceInfo; pending: boolean; run: Run }) {
  const t = useT();
  const [confirm, setConfirm] = useState<"day" | "period" | null>(null);
  const when = absence.halves.length === 2 ? t("Ganzer Tag") : absence.halves[0] === "AM" ? t("Vormittag") : t("Nachmittag");
  return (
    <div className="mt-2 rounded-lg bg-red-50 p-2 text-[11px] text-red-800">
      <p>
        <span className="font-medium">{absence.label}</span> ({when})
      </p>
      {confirm ? (
        <div className="mt-1.5 flex flex-col gap-1">
          <p className="font-medium">{confirm === "day" ? t("Abwesenheit an diesem Tag wirklich aufheben?") : t("Ganzen Abwesenheitszeitraum wirklich aufheben?")}</p>
          <div className="flex gap-1">
            <button type="button" className="btn-secondary btn-sm flex-1" onClick={() => setConfirm(null)}>
              {t("Nein")}
            </button>
            <button
              type="button"
              disabled={pending}
              className="btn-primary btn-sm flex-1"
              onClick={() =>
                run(async () => {
                  const r = await unwrap(cancelAbsence({ employeeId: employee.id, date: dateKey, scope: confirm }));
                  const params = { name: employee.name, n: r.days, m: r.restored };
                  return {
                    notice:
                      r.days === 1
                        ? t("{name}: Abwesenheit an 1 Tag aufgehoben, {m} Einträge wiederhergestellt.", params)
                        : t("{name}: Abwesenheit an {n} Tagen aufgehoben, {m} Einträge wiederhergestellt.", params),
                  };
                })
              }
            >
              {t("Ja, aufheben")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          <button type="button" disabled={pending} className="flex items-center justify-center gap-1 rounded border border-red-200 bg-white px-1 py-1 hover:bg-red-100" onClick={() => setConfirm("day")}>
            <Undo2 className="h-3 w-3" /> {t("Nur diesen Tag")}
          </button>
          <button type="button" disabled={pending} className="rounded border border-red-200 bg-white px-1 py-1 hover:bg-red-100" onClick={() => setConfirm("period")}>
            {t("Ganzer Zeitraum")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Absence (sick, vacation …) for the shown day or a date range. */
function AbsenceSection({ employee, dateKey, pending, run }: { employee: Person; dateKey: string; pending: boolean; run: Run }) {
  const t = useT();
  const [scope, setScope] = useState<"day" | "range">("day");
  const [type, setType] = useState<AbsenceType>("sick");
  const [halfDay, setHalfDay] = useState<"AM" | "PM" | "FULL">("FULL");
  const [from, setFrom] = useState(dateKey);
  const [to, setTo] = useState(dateKey);
  const [firstDayPmOnly, setFirstDayPmOnly] = useState(false);
  const [lastDayAmOnly, setLastDayAmOnly] = useState(false);
  const [clearBlocks, setClearBlocks] = useState(true);
  const [note, setNote] = useState("");
  const check = "h-3.5 w-3.5 accent-[var(--color-brand-700)]";

  return (
    <>
      <select className="input mt-2 w-full py-1 text-xs" value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
        {ABSENCE_TYPES.map((absenceType) => (
          <option key={absenceType} value={absenceType}>
            {t(ABSENCE_TYPE_LABELS[absenceType])}
          </option>
        ))}
      </select>
      <ScopeSwitch value={scope} onChange={setScope} />
      {scope === "day" ? (
        <div className="mt-2 grid grid-cols-3 gap-1">
          {(
            [
              ["AM", "Vormittag"],
              ["PM", "Nachmittag"],
              ["FULL", "Ganzer Tag"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`rounded border px-1 py-1 text-[11px] ${halfDay === value ? "border-brand-700 bg-brand-50 text-brand-800" : "border-zinc-200 text-zinc-600"}`}
              onClick={() => setHalfDay(value)}
            >
              {t(label)}
            </button>
          ))}
        </div>
      ) : (
        <>
          <RangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} />
          <label className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-600">
            <input type="checkbox" checked={firstDayPmOnly} onChange={(e) => setFirstDayPmOnly(e.target.checked)} className={check} />
            {t("Erster Tag nur NM")}
          </label>
          <label className="mt-1 flex items-center gap-2 text-[11px] text-zinc-600">
            <input type="checkbox" checked={lastDayAmOnly} onChange={(e) => setLastDayAmOnly(e.target.checked)} className={check} />
            {t("Letzter Tag nur VM")}
          </label>
          <p className="mt-1 text-[10px] text-zinc-400">{t("Wochenenden und Feiertage werden übersprungen.")}</p>
        </>
      )}
      <label className="mt-2 flex items-center gap-2 text-[11px] text-zinc-600">
        <input type="checkbox" checked={clearBlocks} onChange={(e) => setClearBlocks(e.target.checked)} className={check} />
        {t("Einträge in dieser Zeit entfernen")}
      </label>
      <input
        className="input mt-2 py-1 text-xs"
        maxLength={200}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("Notiz (optional), z. B. Arzttermin")}
      />
      <button
        type="button"
        disabled={pending}
        className="btn-primary btn-sm mt-2 w-full"
        onClick={() =>
          run(async () => {
            const n = note.trim() || undefined;
            if (scope === "day") return reportShortNoticeAbsence({ employeeId: employee.id, date: dateKey, halfDay, type, clearBlocks, note: n });
            const r = await unwrap(reportAbsenceRange({ employeeId: employee.id, from, to, type, firstDayPmOnly, lastDayAmOnly, clearBlocks, note: n }));
            return {
              notice:
                r.days === 1
                  ? t("{name}: Abwesenheit für 1 Arbeitstag erfasst.", { name: employee.name })
                  : t("{name}: Abwesenheit für {n} Arbeitstage erfasst.", { name: employee.name, n: r.days }),
            };
          })
        }
      >
        {t("Abwesenheit erfassen")}
      </button>
    </>
  );
}

/** Backoffice (works, e-mail only, no calls) for the shown day or a date range — and removing it again. */
function BackofficeSection({
  employee,
  dateKey,
  hasBackoffice,
  pending,
  run,
}: {
  employee: Person;
  dateKey: string;
  hasBackoffice: boolean;
  pending: boolean;
  run: Run;
}) {
  const t = useT();
  const [scope, setScope] = useState<"day" | "range">("day");
  const [from, setFrom] = useState(dateKey);
  const [to, setTo] = useState(dateKey);
  const [note, setNote] = useState("");
  const range = scope === "day" ? { from: dateKey, to: dateKey } : { from, to };

  return (
    <>
      <p className="mt-2 text-[11px] text-zinc-500">{t("Arbeitet, nimmt aber keine Anrufe entgegen (nur E-Mail). Zählt nicht als Telefonie-Kapazität.")}</p>
      <ScopeSwitch value={scope} onChange={setScope} />
      {scope === "range" && <RangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} />}
      <input
        className="input mt-2 py-1 text-xs"
        maxLength={200}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("Grund (optional), z. B. Stimme weg")}
      />
      <button
        type="button"
        disabled={pending}
        className="btn-primary btn-sm mt-2 w-full"
        onClick={() =>
          run(async () => {
            const r = await unwrap(setBackoffice({ employeeId: employee.id, ...range, note: note || undefined }));
            return {
              notice:
                (r.days === 1
                  ? t("{name}: Backoffice für 1 Arbeitstag eingetragen.", { name: employee.name })
                  : t("{name}: Backoffice für {n} Arbeitstage eingetragen.", { name: employee.name, n: r.days })) +
                (r.skipped ? ` ${t("{n} Tage übersprungen (abwesend).", { n: r.skipped })}` : ""),
            };
          })
        }
      >
        {t("Backoffice eintragen")}
      </button>
      {(hasBackoffice || scope === "range") && (
        <button
          type="button"
          disabled={pending}
          className="mt-1 w-full rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          onClick={() =>
            run(async () => {
              const r = await unwrap(removeBackoffice({ employeeId: employee.id, ...range }));
              return { notice: t("{name}: Backoffice an {n} Tagen entfernt.", { name: employee.name, n: r.days }) };
            })
          }
        >
          {scope === "day" ? t("Backoffice an diesem Tag entfernen") : t("Backoffice im Zeitraum entfernen")}
        </button>
      )}
    </>
  );
}

/** Popup when a manager clicks an employee's name in the Einsatzplan. */
export function EmployeePopup({
  employee,
  dateKey,
  hasBackoffice,
  absence = null,
  initialTab = "absence",
  onPlanBila,
  pending,
  run,
}: {
  employee: Person;
  dateKey: string;
  hasBackoffice: boolean;
  absence?: AbsenceInfo | null;
  initialTab?: "absence" | "backoffice";
  /** shortcut: open the BILA dialog with this person preselected */
  onPlanBila?: () => void;
  pending: boolean;
  run: Run;
}) {
  const t = useT();
  const [tab, setTab] = useState<"absence" | "backoffice">(initialTab);
  return (
    <>
      <p className="text-xs font-medium text-zinc-700">{employee.name}</p>
      {absence && <CancelAbsenceBox key={dateKey} employee={employee} dateKey={dateKey} absence={absence} pending={pending} run={run} />}
      <div className="mt-2 flex border-b border-zinc-100 text-xs" role="tablist">
        {(
          [
            ["absence", "Abwesenheit"],
            ["backoffice", "Backoffice"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 px-2 py-1 ${tab === value ? "border-brand-700 font-medium text-brand-800" : "border-transparent text-zinc-500"}`}
          >
            {t(label)}
            {value === "backoffice" && hasBackoffice && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-teal-500 align-middle" />}
          </button>
        ))}
      </div>
      {tab === "absence" ? (
        <AbsenceSection employee={employee} dateKey={dateKey} pending={pending} run={run} />
      ) : (
        <BackofficeSection employee={employee} dateKey={dateKey} hasBackoffice={hasBackoffice} pending={pending} run={run} />
      )}
      {onPlanBila && (
        <button type="button" className="btn-secondary btn-sm mt-2 w-full" onClick={onPlanBila}>
          <Users className="h-3.5 w-3.5" /> {t("BILA planen")}
        </button>
      )}
    </>
  );
}
