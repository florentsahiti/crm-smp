"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { Briefcase, ChevronDown, Lock, NotebookPen, Pencil, UserMinus, Users, X } from "lucide-react";
import { createBila } from "@/lib/actions/shifts";
import { unwrap } from "@/lib/action-result";
import { DAY_END_MINUTE, DAY_START_MINUTE, SLOT_MINUTES } from "@/lib/constants";
import { minutesToTime } from "@/lib/dates";
import { useT } from "@/lib/i18n/client";
import { FixedAppointmentDialog } from "./fixed-appointment-dialog";
import { EmployeePopup } from "./employee-popup";

type Person = { id: string; name: string; groupNumber: number | null };
type Open = { kind: "bila"; employeeId?: string } | { kind: "fixed" } | { kind: "activity" } | { kind: "absence" } | { kind: "backoffice" };

const ActionsContext = createContext<{ open: (what: Open) => void } | null>(null);

/** The manager's dialogs on the Einsatzplan, or null for employees (no provider). */
export function useScheduleActions() {
  return useContext(ActionsContext);
}

/**
 * Holds the manager's "Manuelle Änderung" dialogs for the shown day, so both the header menu and the
 * name popup in the timeline ("BILA planen") can open them. Each dialog is mounted only while open.
 */
export function ScheduleActionsProvider({
  dateKey,
  people,
  currentUserId,
  backofficeIds,
  children,
}: {
  dateKey: string;
  people: Person[];
  currentUserId: string;
  /** people with a backoffice day on the shown day */
  backofficeIds: string[];
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState<Open | null>(null);
  const close = () => setCurrent(null);
  return (
    <ActionsContext.Provider value={{ open: setCurrent }}>
      {children}
      {current?.kind === "fixed" && <FixedAppointmentDialog dateKey={dateKey} people={people} onClose={close} />}
      {current?.kind === "activity" && <FixedAppointmentDialog activity dateKey={dateKey} people={people} onClose={close} />}
      {current?.kind === "bila" && (
        <BilaDialog dateKey={dateKey} people={people.filter((p) => p.id !== currentUserId)} initialEmployeeId={current.employeeId} onClose={close} />
      )}
      {(current?.kind === "absence" || current?.kind === "backoffice") && (
        <PersonDialog dateKey={dateKey} people={people} tab={current.kind} backofficeIds={backofficeIds} onClose={close} />
      )}
    </ActionsContext.Provider>
  );
}

/** "Manuelle Änderung ▾" in the page header. */
export function ManualChangeMenu() {
  const t = useT();
  const actions = useScheduleActions();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!actions) return null;
  const items: { what: Open; label: string; Icon: typeof Users }[] = [
    { what: { kind: "bila" }, label: "BILA erfassen", Icon: Users },
    { what: { kind: "fixed" }, label: "Fixtermin erfassen", Icon: Lock },
    { what: { kind: "activity" }, label: "Tätigkeit eintragen", Icon: NotebookPen },
    { what: { kind: "absence" }, label: "Abwesenheit erfassen", Icon: UserMinus },
    { what: { kind: "backoffice" }, label: "Backoffice", Icon: Briefcase },
  ];
  return (
    <div className="relative">
      <button type="button" className="btn-primary btn-sm" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
        <Pencil className="h-3.5 w-3.5" /> {t("Manuelle Änderung")} <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl" role="menu">
            {items.map(({ what, label, Icon }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                onClick={() => {
                  setMenuOpen(false);
                  actions.open(what);
                }}
              >
                <Icon className="h-4 w-4 text-zinc-400" /> {t(label)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Modal shell: shows itself on mount; closing (Esc, ×, onClose) unmounts it in the provider. */
function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-zinc-900/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
            {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label={t("Schliessen")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

const TIMES = Array.from({ length: (DAY_END_MINUTE - DAY_START_MINUTE) / SLOT_MINUTES + 1 }, (_, i) => DAY_START_MINUTE + i * SLOT_MINUTES);

/** BILA with one employee; the booking manager is included unless unticked. */
function BilaDialog({ dateKey, people, initialEmployeeId, onClose }: { dateKey: string; people: Person[]; initialEmployeeId?: string; onClose: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? "");
  const [date, setDate] = useState(dateKey);
  const [start, setStart] = useState(13 * 60);
  const [end, setEnd] = useState(13 * 60 + 30);
  const [note, setNote] = useState("");
  const [includeMe, setIncludeMe] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <Modal title={t("BILA erfassen")} subtitle={t("Gespräch mit einer Person – die Zeit wird für beide gesperrt.")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          startTransition(async () => {
            try {
              await unwrap(createBila({ employeeId, date, startMinute: start, endMinute: end, note: note || undefined, includeMe }));
              onClose();
            } catch (err) {
              setMessage({ ok: false, text: err instanceof Error ? err.message : t("Konnte nicht gespeichert werden.") });
            }
          });
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="label">{t("Mitarbeitende/r")}</span>
          <select required className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">{t("Bitte wählen")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="label">{t("Datum")}</span>
            <input type="date" required className="input px-2" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">{t("Von")}</span>
            <select
              className="input px-2"
              value={start}
              onChange={(e) => {
                const s = Number(e.target.value);
                setEnd(Math.min(DAY_END_MINUTE, s + Math.max(SLOT_MINUTES, end - start))); // keep the length
                setStart(s);
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
            <select className="input px-2" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
              {TIMES.filter((m) => m > start).map((m) => (
                <option key={m} value={m}>
                  {minutesToTime(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-1">
          {[30, 60].map((d) => (
            <button
              key={d}
              type="button"
              className={`badge cursor-pointer border ${end - start === d ? "border-brand-700 bg-brand-50 text-brand-800" : "border-zinc-200 text-zinc-600"}`}
              onClick={() => setEnd(Math.min(DAY_END_MINUTE, start + d))}
            >
              {t("{n} Min.", { n: d })}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="label">{t("Notiz (optional)")}</span>
          <input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("z. B. Zielvereinbarung")} />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand-700)]" />
          {t("Ich nehme teil (auch in meiner Zeile eintragen)")}
        </label>
        {message && (
          <p className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`} role="alert">
            {message.text}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("Abbrechen")}
          </button>
          <button type="submit" className="btn-primary" disabled={pending || !employeeId}>
            {pending ? t("Wird eingetragen…") : t("BILA eintragen")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Absence or backoffice for a person picked from a list (same form as the name popup). */
function PersonDialog({
  dateKey,
  people,
  tab,
  backofficeIds,
  onClose,
}: {
  dateKey: string;
  people: Person[];
  tab: "absence" | "backoffice";
  backofficeIds: string[];
  onClose: () => void;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const person = people.find((p) => p.id === employeeId);

  function run(action: () => Promise<unknown>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        const notice = result && typeof result === "object" && "notice" in result && typeof result.notice === "string" ? result.notice : t("Gespeichert.");
        setMessage({ ok: true, text: notice });
      } catch (err) {
        setMessage({ ok: false, text: err instanceof Error ? err.message : t("Konnte nicht gespeichert werden.") });
      }
    });
  }

  return (
    <Modal title={tab === "absence" ? t("Abwesenheit erfassen") : t("Backoffice")} onClose={onClose}>
      <>
        <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">{t("Mitarbeitende/n wählen")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {person && (
          <div className="rounded-xl border border-zinc-200 p-3">
            <EmployeePopup
              key={person.id}
              employee={person}
              dateKey={dateKey}
              hasBackoffice={backofficeIds.includes(person.id)}
              initialTab={tab}
              pending={pending}
              run={run}
            />
          </div>
        )}
        {message && (
          <p className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`} role="status">
            {message.text}
          </p>
        )}
      </>
    </Modal>
  );
}
