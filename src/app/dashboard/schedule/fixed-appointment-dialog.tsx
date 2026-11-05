"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { createFixedAppointment } from "@/lib/actions/shifts";
import { DAY_END_MINUTE, DAY_START_MINUTE, DUTY_TYPE_LABELS, FIXED_TYPES, OTHER, OTHER_LABEL_MAX, SLOT_MINUTES } from "@/lib/constants";
import { minutesToTime } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";

type Person = { id: string; name: string; groupNumber: number | null };
type FixedType = (typeof FIXED_TYPES)[number];

const TIMES = Array.from({ length: (DAY_END_MINUTE - DAY_START_MINUTE) / SLOT_MINUTES + 1 }, (_, i) => DAY_START_MINUTE + i * SLOT_MINUTES);

/**
 * Books a fixed appointment (BILA, team meeting, training …) for several people; the time is locked
 * for them. With `activity` it books a free-text activity instead ("Tätigkeit eintragen": whatever
 * the people are doing, shown as their label in the plan). Opened from the "Manuelle Änderung" menu.
 */
export function FixedAppointmentDialog({
  dateKey,
  people,
  activity = false,
  onClose,
}: {
  dateKey: string;
  people: Person[];
  activity?: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<FixedType>("meeting");
  const [date, setDate] = useState(dateKey);
  const [start, setStart] = useState(9 * 60);
  const [end, setEnd] = useState(10 * 60);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  const groups = [...new Set(people.map((p) => p.groupNumber).filter((g): g is number => g !== null))].sort();
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // mounted only while open (fresh form each time)
  useEffect(() => dialogRef.current?.showModal(), []);

  return (
    <>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        className="m-auto w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-zinc-900/40 backdrop:backdrop-blur-[2px]"
      >
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(null);
            startTransition(async () => {
              const r = await createFixedAppointment({ dutyType: activity ? OTHER : type, date, startMinute: start, endMinute: end, employeeIds: selected, note: note || undefined });
              if (!r.ok) return setMessage({ tone: "error", text: r.error });
              const extra = [
                r.absent.length ? `${t("abwesend, nicht eingetragen")}: ${r.absent.join(", ")}` : "",
                r.overlaps.length ? `${t("überschneidet bestehende Einträge bei")}: ${r.overlaps.join(", ")}` : "",
              ].filter(Boolean);
              setMessage({ tone: extra.length ? "warn" : "ok", text: `${r.created === 1 ? t("Für 1 Person eingetragen.") : t("Für {n} Personen eingetragen.", { n: r.created })}${extra.length ? ` ${t("Hinweis")} – ${extra.join("; ")}.` : ""}` });
              setSelected([]);
              setNote("");
            });
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">{activity ? t("Tätigkeit eintragen") : t("Fixtermin erfassen")}</h2>
              <p className="text-sm text-zinc-500">
                {activity
                  ? t("Frei beschreiben, was die Mitarbeitenden in dieser Zeit machen – es steht so im Einsatzplan.")
                  : t("Das Zeitfenster wird gesperrt; die Personen zählen in dieser Zeit als nicht verfügbar.")}
              </p>
            </div>
            <button type="button" className="btn-ghost btn-sm" onClick={() => dialogRef.current?.close()} aria-label={t("Schliessen")}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {activity ? (
              <label className="col-span-2 flex flex-col gap-1.5">
                <span className="label">{t("Was machen die Mitarbeitenden?")}</span>
                <input
                  required
                  autoFocus
                  className="input"
                  maxLength={OTHER_LABEL_MAX}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("z. B. Inventur, Kundenanlass, Projekt X")}
                />
              </label>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="label">{t("Art")}</span>
                <select className="input" value={type} onChange={(e) => setType(e.target.value as FixedType)}>
                  {FIXED_TYPES.map((fixedType) => (
                    <option key={fixedType} value={fixedType}>
                      {t(DUTY_TYPE_LABELS[fixedType])}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={`flex flex-col gap-1.5 ${activity ? "col-span-2" : ""}`}>
              <span className="label">{t("Datum")}</span>
              <input type="date" required className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">{t("Von")}</span>
              <select
                className="input"
                value={start}
                onChange={(e) => {
                  const s = Number(e.target.value);
                  setStart(s);
                  if (end <= s) setEnd(s + 60 <= DAY_END_MINUTE ? s + 60 : DAY_END_MINUTE);
                }}
              >
                {TIMES.slice(0, -1).map((m) => (
                  <option key={m} value={m}>
                    {minutesToTime(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">{t("Bis")}</span>
              <select className="input" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
                {TIMES.filter((m) => m > start).map((m) => (
                  <option key={m} value={m}>
                    {minutesToTime(m)}
                  </option>
                ))}
              </select>
            </label>
            {!activity && (
              <label className="col-span-2 flex flex-col gap-1.5">
                <span className="label">{t("Bezeichnung (optional)")}</span>
                <input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("z. B. BILA mit Manager, Produktschulung")} />
              </label>
            )}
          </div>

          <fieldset>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <legend className="label mr-2">{t("Personen")} ({selected.length})</legend>
              <button type="button" className="badge cursor-pointer bg-zinc-100 text-zinc-600 hover:bg-zinc-200" onClick={() => setSelected(people.map((p) => p.id))}>
                {t("Alle")}
              </button>
              {groups.map((g) => (
                <button
                  key={g}
                  type="button"
                  className="badge cursor-pointer bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  onClick={() => setSelected((s) => [...new Set([...s, ...people.filter((p) => p.groupNumber === g).map((p) => p.id)])])}
                >
                  + {t("Gruppe")} {g}
                </button>
              ))}
              <button type="button" className="badge cursor-pointer bg-zinc-100 text-zinc-600 hover:bg-zinc-200" onClick={() => setSelected([])}>
                {t("Keine")}
              </button>
            </div>
            <div className="grid max-h-48 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2">
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-[var(--color-brand-700)]" />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>

          {message && (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : message.tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}
              role="status"
            >
              {message.text}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => dialogRef.current?.close()}>
              {t("Schliessen")}
            </button>
            <button type="submit" className="btn-primary" disabled={pending || selected.length === 0 || (activity && !note.trim())}>
              {pending ? t("Wird eingetragen…") : activity ? t("Tätigkeit eintragen") : t("Termin eintragen")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
