"use client";

import { useEffect, useState, useTransition } from "react";
import { Cake, Coffee, Lock } from "lucide-react";
import { createShiftBlock, deleteShiftBlock, setWorkMode, updateShiftBlock } from "@/lib/actions/shifts";
import {
  BREAK_RULES,
  BREAK_TYPES,
  DUTY_TYPES,
  DUTY_TYPE_LABELS,
  LOCATIONS,
  LOCATION_LABELS,
  OTHER,
  OTHER_LABEL_MAX,
  activityOfDuty,
  isBackoffice,
  isBreak,
  isFixed,
  type Activity,
  type BreakType,
  type DutyType,
  type Location,
} from "@/lib/constants";
import { minutesToTime } from "@/lib/dates";
import { useZurichNow } from "@/lib/use-zurich-now";
import { useT } from "@/lib/i18n/client";
import { unwrap } from "@/lib/action-result";
import { LanguageBadges } from "@/components/language-badge";
import { EmployeePopup } from "./employee-popup";
import { useScheduleActions } from "./schedule-actions";
import { ABSENT_COLOR, DUTY_COLORS, PHONE_COLOR, SHORT_LABELS, avatarColor } from "./duty-colors";
import { ActivePopover } from "./active-popover";
import { scrollToNowLine } from "./now-scroll";
import { DAY_END_MINUTE, DAY_START_MINUTE, PX_PER_MINUTE, SLOT_MINUTES } from "./constants";

const WIDTH = (DAY_END_MINUTE - DAY_START_MINUTE) * PX_PER_MINUTE;
const NAME_COL = 250;
const LANG_COL = 64;
const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 32;
const SLOT_PX = SLOT_MINUTES * PX_PER_MINUTE;
const HOUR_PX = 60 * PX_PER_MINUTE;

const TIME_OPTIONS = Array.from({ length: (DAY_END_MINUTE - DAY_START_MINUTE) / SLOT_MINUTES + 1 }, (_, i) => DAY_START_MINUTE + i * SLOT_MINUTES);

type ShiftBlockData = {
  id: string;
  employeeId: string;
  startMinute: number;
  endMinute: number;
  dutyType: DutyType;
  location: Location | null;
  /** label of a "Sonstiges" block */
  note?: string | null;
  draft?: boolean;
};

/** agent = takes calls (counted in "aktiv"); managers are not */
type Employee = { id: string; name: string; shortCode: string; skills: string[]; birthday?: boolean; agent?: boolean };

const minuteToX = (minute: number) => (minute - DAY_START_MINUTE) * PX_PER_MINUTE;

/** Working time of the day not covered by any block or absence — shown as "Telefonie". */
function phoneSegments(blocks: { startMinute: number; endMinute: number }[], absent: ("AM" | "PM")[]): [number, number][] {
  let free: [number, number][] = [];
  if (!absent.includes("AM")) free.push([DAY_START_MINUTE, 12 * 60]);
  if (!absent.includes("PM")) free.push([12 * 60, DAY_END_MINUTE]);
  if (free.length === 2) free = [[DAY_START_MINUTE, DAY_END_MINUTE]];
  for (const b of blocks) {
    free = free.flatMap(([from, to]): [number, number][] => {
      if (b.endMinute <= from || b.startMinute >= to) return [[from, to]];
      const parts: [number, number][] = [];
      if (b.startMinute > from) parts.push([from, b.startMinute]);
      if (b.endMinute < to) parts.push([b.endMinute, to]);
      return parts;
    });
  }
  return free;
}

function snapDown(x: number): number {
  const raw = DAY_START_MINUTE + x / PX_PER_MINUTE;
  return Math.min(DAY_END_MINUTE - SLOT_MINUTES, Math.max(DAY_START_MINUTE, Math.floor(raw / SLOT_MINUTES) * SLOT_MINUTES));
}
function snapUp(x: number): number {
  const raw = DAY_START_MINUTE + x / PX_PER_MINUTE;
  return Math.min(DAY_END_MINUTE, Math.max(DAY_START_MINUTE + SLOT_MINUTES, Math.ceil(raw / SLOT_MINUTES) * SLOT_MINUTES));
}

/** Moves/resizes a range so it is a valid break of that type (e.g. a 15-minute morning break). */
function fitBreak(type: BreakType, start: number, end: number) {
  const rule = BREAK_RULES[type];
  const wanted = end - start;
  const length = rule.durations.includes(wanted) ? wanted : rule.durations[rule.durations.length - 1];
  const s = Math.min(Math.max(start, rule.from), rule.to - length);
  return { startMinute: s, endMinute: s + length };
}

/** Breaks an employee can start at this time, e.g. a 30-minute lunch at 12:00. */
function breakOptionsAt(start: number) {
  const options: { type: BreakType; startMinute: number; endMinute: number; minutes: number; choice: boolean }[] = [];
  for (const type of BREAK_TYPES) {
    const rule = BREAK_RULES[type];
    for (const d of rule.durations) {
      if (start >= rule.from && start + d <= rule.to) {
        options.push({ type, startMinute: start, endMinute: start + d, minutes: d, choice: rule.durations.length > 1 });
      }
    }
  }
  return options;
}

type Popup =
  | { kind: "create"; employeeId: string; startMinute: number; endMinute: number; x: number; y: number }
  | { kind: "edit"; block: ShiftBlockData; x: number; y: number }
  | { kind: "absence"; employee: Employee; x: number; y: number };

export function Timeline({
  employees,
  absences,
  shiftBlocks,
  dateKey,
  currentUserId,
  canEditAll,
  locked = false,
  activity = null,
  absenceLabels,
  homeOffice = [],
}: {
  employees: Employee[];
  absences: Record<string, ("AM" | "PM")[]>;
  shiftBlocks: ShiftBlockData[];
  dateKey: string;
  currentUserId: string;
  canEditAll: boolean;
  /** public holiday: greyed out, nothing can be planned */
  locked?: boolean;
  /** activity filter: everything else is dimmed */
  activity?: Activity | null;
  /** employeeId -> absence reason, for managers only (employees just see "Abwesend") */
  absenceLabels?: Record<string, string>;
  /** employees working from home on this day ("HO") */
  homeOffice?: string[];
}) {
  // Everyone sees everyone's day; employees can only touch their own row, and only breaks.
  const canEditRow = (employeeId: string) => !locked && (canEditAll || employeeId === currentUserId);
  const canOpenBlock = (b: ShiftBlockData) => !locked && (canEditAll || (b.employeeId === currentUserId && isBreak(b.dutyType)));
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ employeeId: string; rowLeft: number; startX: number; currentX: number } | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const actions = useScheduleActions();
  const dim = (a: Activity | null) => (activity && a !== activity ? "opacity-20" : "");
  // clicked time in the ruler: how many are active then
  const [probe, setProbe] = useState<number | null>(null);
  // nobody works on a holiday
  const agents = locked ? [] : employees.filter((e) => e.agent).map((e) => ({ id: e.id, name: e.name, skills: e.skills }));
  const now = useZurichNow();
  const nowMinute = now && now.dateKey === dateKey && now.minute >= DAY_START_MINUTE && now.minute < DAY_END_MINUTE ? now.minute : null;
  const hasNow = nowMinute !== null;
  // HO / BO: managers switch it for anyone, employees for themselves from today on
  const canSetWorkMode = (employeeId: string) => !locked && (canEditAll || (employeeId === currentUserId && now !== null && dateKey >= now.dateKey));

  // Today: scroll the plan sideways so the red now line is in view; with "#now" (Aktuelle Zeit) also scroll the page to it.
  useEffect(() => {
    if (hasNow) scrollToNowLine(window.location.hash === "#now");
  }, [hasNow]);

  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      setDrag((d) => (d ? { ...d, currentX: e.clientX - d.rowLeft } : d));
    }
    function onUp(e: PointerEvent) {
      setDrag((d) => {
        if (!d) return null;
        const x0 = Math.max(0, Math.min(d.startX, e.clientX - d.rowLeft));
        const x1 = Math.min(WIDTH, Math.max(d.startX, e.clientX - d.rowLeft));
        const startMinute = snapDown(x0);
        // a click (no real drag) selects the single 15-minute slot under the pointer
        const endMinute = Math.max(startMinute + SLOT_MINUTES, snapUp(x1));

        const employeeAbsences = absences[d.employeeId] ?? [];
        const overlapsAbsence =
          (startMinute < 12 * 60 && employeeAbsences.includes("AM")) || (endMinute > 12 * 60 && employeeAbsences.includes("PM"));
        if (overlapsAbsence) {
          setError(t("Für diese Person ist in dieser Zeit eine Abwesenheit erfasst."));
          return null;
        }
        setPopup({ kind: "create", employeeId: d.employeeId, startMinute, endMinute, x: e.clientX, y: e.clientY });
        return null;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, absences, t]);

  function handleRowPointerDown(e: React.PointerEvent<HTMLDivElement>, employeeId: string) {
    if (!canEditRow(employeeId)) return;
    // clicking a block you may open edits it; otherwise (e.g. your break inside ticket duty) it starts a new entry
    if ((e.target as HTMLElement).closest("button[data-block]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setError(null);
    setDrag({ employeeId, rowLeft: rect.left, startX: e.clientX - rect.left, currentX: e.clientX - rect.left });
  }

  function run(action: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        // a manager may exceed the break limit — the save went through, show why it is unusual
        if (result && typeof result === "object" && "warning" in result && typeof result.warning === "string") setNotice(result.warning);
        if (result && typeof result === "object" && "notice" in result && typeof result.notice === "string") setNotice(result.notice);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Die Änderung konnte nicht gespeichert werden."));
      }
      setPopup(null);
    });
  }

  const gridBackground = {
    backgroundImage: `repeating-linear-gradient(to right, rgba(24,24,27,0.10) 0 1px, transparent 1px ${HOUR_PX}px), repeating-linear-gradient(to right, rgba(24,24,27,0.05) 0 1px, transparent 1px ${SLOT_PX}px)`,
  };

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          {notice}
        </div>
      )}
      <div data-timeline-scroll className="overflow-x-auto pb-1">
        <div style={{ width: WIDTH + NAME_COL }} className={`relative ${locked ? "opacity-50 grayscale" : ""}`}>
          {/* Header: column titles + ruler with every quarter hour — click a time to see who is active */}
          <div className="flex border-b border-zinc-200" style={{ height: HEADER_HEIGHT }}>
            <div className="sticky left-0 z-20 flex shrink-0 items-end bg-white pb-1 text-[10px] font-semibold text-zinc-600" style={{ width: NAME_COL }}>
              <span className="pl-1" style={{ width: NAME_COL - LANG_COL }}>
                {t("Mitarbeitende")}
              </span>
              <span>{t("Sprache")}</span>
            </div>
            <div className="relative" style={{ width: WIDTH }}>
              {TIME_OPTIONS.slice(0, -1).map((m) => (
                <div key={m} className="absolute inset-y-0" style={{ left: minuteToX(m), width: SLOT_PX }}>
                  <button
                    type="button"
                    onClick={() => setProbe(probe === m ? null : m)}
                    className={`flex h-full w-full cursor-pointer flex-col items-start justify-end rounded-t hover:bg-brand-50 ${probe === m ? "bg-brand-100" : ""}`}
                    title={t("Wer ist um {time} aktiv?", { time: minutesToTime(m) })}
                    aria-label={t("Wer ist um {time} aktiv?", { time: minutesToTime(m) })}
                  >
                    <span className={`whitespace-nowrap pl-0.5 text-[9px] tabular-nums ${m % 60 === 0 ? "font-semibold text-zinc-700" : "text-zinc-400"}`}>
                      {minutesToTime(m)}
                    </span>
                    <span className={`w-px ${m % 60 === 0 ? "h-2 bg-zinc-400" : "h-1 bg-zinc-300"}`} />
                  </button>
                  {probe === m && <ActivePopover minute={m} agents={agents} absences={absences} blocks={shiftBlocks} alignRight={m >= 15 * 60} onClose={() => setProbe(null)} />}
                </div>
              ))}
            </div>
          </div>

          {employees.map((employee) => {
            const empBlocks = shiftBlocks.filter((b) => b.employeeId === employee.id);
            const empAbsences = absences[employee.id] ?? [];
            const isDraggingHere = drag?.employeeId === employee.id;
            const isMe = employee.id === currentUserId;
            const editable = canEditRow(employee.id);
            // names are first names only (see lib/names)
            const firstName = employee.name;
            // Managers see why someone is away; employees only that they are.
            const absenceLabel = absenceLabels?.[employee.id] ?? t("Abwesend");
            const absentFrom = empAbsences.includes("AM") ? DAY_START_MINUTE : 12 * 60;
            const absentTo = empAbsences.includes("PM") ? DAY_END_MINUTE : 12 * 60;
            // Working time without another block = Telefonie (display only, call-takers only).
            const phone = employee.agent && !locked ? phoneSegments(empBlocks, empAbsences) : [];

            return (
              <div key={employee.id} className={`flex items-center border-b border-zinc-100 ${isMe ? "bg-brand-50/60" : ""}`} style={{ height: ROW_HEIGHT }}>
                <div className={`sticky left-0 z-10 flex h-full shrink-0 items-center gap-1.5 pr-2 ${isMe ? "bg-brand-50" : "bg-white"}`} style={{ width: NAME_COL }}>
                  <span
                    className={`flex h-5 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold ${avatarColor(employee.id)}`}
                    title={employee.shortCode}
                    aria-hidden
                  >
                    {firstName.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    {canEditAll && !locked ? (
                      <button
                        type="button"
                        className={`min-w-0 truncate text-left text-xs hover:underline ${isMe ? "font-semibold text-brand-800" : "text-zinc-800"}`}
                        title={`${employee.name} – ${t("Kurzfristige Abwesenheit erfassen")}`}
                        onClick={(e) => setPopup({ kind: "absence", employee, x: e.clientX, y: e.clientY })}
                      >
                        {firstName}
                      </button>
                    ) : (
                      <span className={`min-w-0 truncate text-xs ${isMe ? "font-semibold text-brand-800" : "text-zinc-800"}`} title={employee.name}>
                        {firstName}
                        {isMe && ` (${t("Sie")})`}
                      </span>
                    )}
                    {employee.birthday && (
                      <span title={t("Hat heute Geburtstag")}>
                        <Cake className="h-3.5 w-3.5 shrink-0 text-pink-500" aria-label={t("Geburtstag")} />
                      </span>
                    )}
                  </span>
                  <WorkModePills
                    ho={homeOffice.includes(employee.id)}
                    bo={empBlocks.some((b) => isBackoffice(b.dutyType))}
                    disabled={!canSetWorkMode(employee.id) || empAbsences.length === 2 || pending}
                    onToggle={(mode, on) => run(() => unwrap(setWorkMode({ employeeId: employee.id, date: dateKey, mode, on })))}
                  />
                  <LanguageBadges codes={employee.skills} size="xs" className="shrink-0 flex-nowrap" />
                </div>
                <div
                  className={`relative shrink-0 ${editable ? "cursor-crosshair" : "cursor-default"}`}
                  style={{ width: WIDTH, height: ROW_HEIGHT - 6, ...gridBackground }}
                  onPointerDown={(e) => handleRowPointerDown(e, employee.id)}
                >
                  {phone.map(([from, to]) => (
                    <div
                      key={from}
                      className={`pointer-events-none absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-sm border-x border-white text-[10px] font-medium whitespace-nowrap ${PHONE_COLOR} ${dim("phone")}`}
                      style={{ left: minuteToX(from), width: minuteToX(to) - minuteToX(from) }}
                    >
                      {to - from >= 30 ? t("Telefonie") : ""}
                    </div>
                  ))}

                  {empAbsences.length > 0 && (
                    <div
                      className={`absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-sm text-[10px] font-medium ${ABSENT_COLOR} ${dim("absent")}`}
                      style={{
                        left: minuteToX(empAbsences.length === 2 ? DAY_START_MINUTE : absentFrom),
                        width: minuteToX(empAbsences.length === 2 ? DAY_END_MINUTE : absentTo) - minuteToX(empAbsences.length === 2 ? DAY_START_MINUTE : absentFrom),
                      }}
                      title={`${absenceLabel} (${empAbsences.length === 2 ? t("Ganzer Tag") : empAbsences.includes("AM") ? t("Vormittag") : t("Nachmittag")})`}
                    >
                      {absenceLabel}
                    </div>
                  )}

                  {/* Backoffice day: a band under everything else, so breaks can still be added on top */}
                  {empBlocks.filter((b) => isBackoffice(b.dutyType)).map((b) => (
                    <div
                      key={b.id}
                      className={`pointer-events-none absolute inset-y-0 flex items-center justify-center rounded-sm text-[10px] font-medium ${DUTY_COLORS.backoffice} ${dim("backoffice")}`}
                      style={{ left: minuteToX(b.startMinute), width: minuteToX(b.endMinute) - minuteToX(b.startMinute) }}
                      title={`${t(DUTY_TYPE_LABELS.backoffice)} ${minutesToTime(b.startMinute)}–${minutesToTime(b.endMinute)}`}
                    >
                      {t(DUTY_TYPE_LABELS.backoffice)}
                    </div>
                  ))}

                  {empBlocks.filter((b) => !isBackoffice(b.dutyType)).map((b) => {
                    const fixed = isFixed(b.dutyType);
                    const blockClass = `absolute inset-y-0 flex items-center justify-center gap-0.5 overflow-hidden whitespace-nowrap rounded-sm border-x border-white px-1 text-[10px] font-medium ${DUTY_COLORS[b.dutyType]} ${b.draft ? "border-2 border-dashed border-brand-700 opacity-90" : ""} ${dim(activityOfDuty(b.dutyType))}`;
                    const blockStyle = { left: minuteToX(b.startMinute), width: minuteToX(b.endMinute) - minuteToX(b.startMinute) };
                    const custom = b.dutyType === OTHER && b.note ? b.note : null;
                    const extra = !custom && b.note ? ` – ${b.note}` : "";
                    const title = `${custom ?? t(DUTY_TYPE_LABELS[b.dutyType])}${extra} ${minutesToTime(b.startMinute)}–${minutesToTime(b.endMinute)}${fixed ? ` (${t("fixer Termin, gesperrt")})` : ""}${b.draft ? ` (${t("Vorschlag")})` : ""}`;
                    const content = (
                      <>
                        {fixed && <Lock className="h-2.5 w-2.5 shrink-0" />}
                        {/* breaks: the cup always, the word only when there is room */}
                        {isBreak(b.dutyType) && <Coffee className="h-3 w-3 shrink-0" aria-hidden />}
                        {b.endMinute - b.startMinute > 15 ? (custom ?? t(SHORT_LABELS[b.dutyType] ?? DUTY_TYPE_LABELS[b.dutyType])) : ""}
                      </>
                    );
                    return canOpenBlock(b) ? (
                      <button
                        key={b.id}
                        type="button"
                        data-block
                        onClick={(e) => {
                          e.stopPropagation();
                          setPopup({ kind: "edit", block: b, x: e.clientX, y: e.clientY });
                        }}
                        className={`${blockClass} cursor-pointer hover:brightness-95`}
                        style={blockStyle}
                        title={title}
                      >
                        {content}
                      </button>
                    ) : (
                      <div key={b.id} data-block className={blockClass} style={blockStyle} title={title}>
                        {content}
                      </div>
                    );
                  })}

                  {isDraggingHere && drag && (
                    <div
                      className="pointer-events-none absolute inset-y-0 rounded bg-zinc-400/50"
                      style={{ left: Math.min(drag.startX, drag.currentX), width: Math.abs(drag.currentX - drag.startX) }}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {probe !== null && (
            <div
              className="pointer-events-none absolute bottom-0 z-10 bg-brand-500/10 ring-1 ring-brand-300"
              style={{ left: NAME_COL + minuteToX(probe), width: SLOT_PX, top: HEADER_HEIGHT }}
            />
          )}

          {nowMinute !== null && (
            <div
              data-now-line
              className="pointer-events-none absolute bottom-0 z-10 w-0.5 bg-red-600"
              style={{ left: NAME_COL + minuteToX(nowMinute), top: 4 }}
              title={`${t("Jetzt")} ${minutesToTime(nowMinute)}`}
            >
              <span className="absolute -left-[18px] top-0 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">{minutesToTime(nowMinute)}</span>
            </div>
          )}
        </div>
      </div>

      <Legend />

      {popup && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setPopup(null)} />
          <div
            className={`fixed z-30 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl ${popup.kind === "absence" ? "w-72" : "w-64"}`}
            style={{ left: Math.max(8, Math.min(popup.x, window.innerWidth - 300)), top: Math.max(8, Math.min(popup.y, window.innerHeight - (popup.kind === "absence" ? 480 : 340))) }}
          >
            {popup.kind === "create" && (
              <CreatePopup
                popup={popup}
                canEditAll={canEditAll}
                pending={pending}
                onPick={(dutyType, startMinute, endMinute, note) =>
                  run(() => unwrap(createShiftBlock({ employeeId: popup.employeeId, date: dateKey, startMinute, endMinute, dutyType, location: null, note })))
                }
              />
            )}
            {popup.kind === "edit" && (
              <EditPopup
                block={popup.block}
                canEditAll={canEditAll}
                pending={pending}
                onUpdate={(changes) => run(() => unwrap(updateShiftBlock({ id: popup.block.id, ...changes })))}
                onDelete={() => run(() => unwrap(deleteShiftBlock(popup.block.id)))}
              />
            )}
            {popup.kind === "absence" && (
              <EmployeePopup
                employee={popup.employee}
                dateKey={dateKey}
                hasBackoffice={shiftBlocks.some((b) => b.employeeId === popup.employee.id && isBackoffice(b.dutyType))}
                absence={
                  absences[popup.employee.id]?.length
                    ? { label: absenceLabels?.[popup.employee.id] ?? t("Abwesend"), halves: absences[popup.employee.id] }
                    : null
                }
                onPlanBila={
                  actions && popup.employee.id !== currentUserId
                    ? () => {
                        setPopup(null);
                        actions.open({ kind: "bila", employeeId: popup.employee.id });
                      }
                    : undefined
                }
                pending={pending}
                run={run}
              />
            )}
            <button type="button" className="mt-2 w-full rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-50" onClick={() => setPopup(null)}>
              {t("Abbrechen")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CreatePopup({
  popup,
  canEditAll,
  pending,
  onPick,
}: {
  popup: { startMinute: number; endMinute: number };
  canEditAll: boolean;
  pending: boolean;
  onPick: (dutyType: DutyType, startMinute: number, endMinute: number, note?: string) => void;
}) {
  const t = useT();
  // "Sonstiges" asks for a free-text label first
  const [other, setOther] = useState<string | null>(null);
  if (!canEditAll) {
    const options = breakOptionsAt(popup.startMinute);
    return (
      <>
        <p className="mb-2 text-xs text-zinc-500">{t("Pause ab {time}", { time: minutesToTime(popup.startMinute) })}</p>
        {options.length === 0 ? (
          <p className="text-xs text-zinc-500">
            {t("Um diese Zeit ist keine Pause möglich. Vormittag 08–12 Uhr, Mittag 12–14 Uhr, Nachmittag 14–17 Uhr.")}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {options.map((o) => (
              <button
                key={`${o.type}-${o.minutes}`}
                type="button"
                disabled={pending}
                className={`rounded px-2 py-1.5 text-left text-xs hover:opacity-80 ${DUTY_COLORS[o.type]}`}
                onClick={() => onPick(o.type, o.startMinute, o.endMinute)}
              >
                {t(DUTY_TYPE_LABELS[o.type])}
                {o.choice ? ` ${t("{n} Min.", { n: o.minutes })}` : ""} · {minutesToTime(o.startMinute)}–{minutesToTime(o.endMinute)}
              </button>
            ))}
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <p className="mb-2 text-xs text-zinc-500">
        {minutesToTime(popup.startMinute)}–{minutesToTime(popup.endMinute)}
      </p>
      {other !== null ? (
        <OtherLabelForm value={other} onChange={setOther} pending={pending} onSave={() => onPick(OTHER, popup.startMinute, popup.endMinute, other.trim())} onBack={() => setOther(null)} />
      ) : (
        <div className="grid grid-cols-2 gap-1">
          {DUTY_TYPES.map((duty) => (
            <button
              key={duty}
              type="button"
              disabled={pending}
              className={`flex items-center gap-1 rounded px-2 py-1 text-left text-xs hover:opacity-80 ${DUTY_COLORS[duty]}`}
              onClick={() => {
                if (duty === OTHER) return setOther("");
                const range = isBreak(duty) ? fitBreak(duty, popup.startMinute, popup.endMinute) : popup;
                onPick(duty, range.startMinute, range.endMinute);
              }}
            >
              {isFixed(duty) && <Lock className="h-2.5 w-2.5 shrink-0" />}
              {t(DUTY_TYPE_LABELS[duty])}
              {duty === OTHER && "…"}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-zinc-400">{t("Mit Schloss = fixer Termin, sperrt das Zeitfenster.")}</p>
    </>
  );
}

function EditPopup({
  block,
  canEditAll,
  pending,
  onUpdate,
  onDelete,
}: {
  block: ShiftBlockData;
  canEditAll: boolean;
  pending: boolean;
  onUpdate: (changes: { dutyType?: DutyType; location?: Location | null; startMinute?: number; endMinute?: number; note?: string }) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [other, setOther] = useState<string | null>(block.dutyType === OTHER ? (block.note ?? "") : null);
  const [start, setStart] = useState(block.startMinute);
  const [end, setEnd] = useState(block.endMinute);
  const length = block.endMinute - block.startMinute;
  const timeChanged = start !== block.startMinute || end !== block.endMinute;

  return (
    <>
      <p className="mb-2 text-xs font-medium text-zinc-700">{block.dutyType === OTHER && block.note ? block.note : t(DUTY_TYPE_LABELS[block.dutyType])}</p>
      <div className="flex items-center gap-1 text-xs">
        <select
          className="input w-full py-1 text-xs"
          value={start}
          onChange={(e) => {
            const s = Number(e.target.value);
            setStart(s);
            if (!canEditAll || s >= end) setEnd(Math.min(DAY_END_MINUTE, s + length)); // employees move breaks, keeping the length
          }}
        >
          {TIME_OPTIONS.slice(0, -1).map((m) => (
            <option key={m} value={m}>
              {minutesToTime(m)}
            </option>
          ))}
        </select>
        <span className="text-zinc-400">–</span>
        <select className="input w-full py-1 text-xs" value={end} disabled={!canEditAll} onChange={(e) => setEnd(Number(e.target.value))}>
          {TIME_OPTIONS.filter((m) => m > start).map((m) => (
            <option key={m} value={m}>
              {minutesToTime(m)}
            </option>
          ))}
        </select>
      </div>
      {timeChanged && (
        <button type="button" disabled={pending} className="btn-primary btn-sm mt-2 w-full" onClick={() => onUpdate({ startMinute: start, endMinute: end })}>
          {t("Zeit ändern")}
        </button>
      )}

      {canEditAll && (
        <>
          {other !== null && (
            <div className="mt-2">
              <OtherLabelForm
                value={other}
                onChange={setOther}
                pending={pending}
                onSave={() => onUpdate({ dutyType: OTHER, note: other.trim() })}
                onBack={block.dutyType === OTHER ? undefined : () => setOther(null)}
              />
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-1">
            {DUTY_TYPES.map((duty) => (
              <button
                key={duty}
                type="button"
                disabled={pending || duty === block.dutyType}
                className={`flex items-center gap-1 rounded px-2 py-1 text-left text-xs hover:opacity-80 disabled:opacity-40 ${DUTY_COLORS[duty]}`}
                onClick={() => {
                  if (duty === OTHER) return setOther("");
                  const range = isBreak(duty) ? fitBreak(duty, block.startMinute, block.endMinute) : { startMinute: block.startMinute, endMinute: block.endMinute };
                  onUpdate({ dutyType: duty, ...range });
                }}
              >
                {isFixed(duty) && <Lock className="h-2.5 w-2.5 shrink-0" />}
                {t(DUTY_TYPE_LABELS[duty])}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            {LOCATIONS.map((loc) => (
              <button
                key={loc}
                type="button"
                disabled={pending}
                className={`flex-1 rounded border px-2 py-1 text-xs ${block.location === loc ? "border-zinc-500 bg-zinc-100" : "border-zinc-200"}`}
                onClick={() => onUpdate({ location: loc })}
              >
                {t(LOCATION_LABELS[loc])}
              </button>
            ))}
          </div>
        </>
      )}
      <button type="button" disabled={pending} className="mt-2 w-full rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50" onClick={onDelete}>
        {t("Entfernen")}
      </button>
    </>
  );
}

const WORK_MODES = [
  { mode: "HO", label: "Home Office", on: "bg-sky-600 text-white" },
  { mode: "BO", label: "Backoffice", on: "bg-teal-600 text-white" },
] as const;

/** Small "HO" / "BO" pills next to a name: lit when set; clickable for whoever may change it. */
function WorkModePills({ ho, bo, disabled, onToggle }: { ho: boolean; bo: boolean; disabled: boolean; onToggle: (mode: "HO" | "BO", on: boolean) => void }) {
  const t = useT();
  const active = { HO: ho, BO: bo };
  return (
    <span className="flex shrink-0 gap-0.5">
      {WORK_MODES.filter((m) => !disabled || active[m.mode]).map((m) => (
        <button
          key={m.mode}
          type="button"
          disabled={disabled}
          aria-pressed={active[m.mode]}
          title={`${t(m.label)}${disabled ? "" : active[m.mode] ? ` – ${t("klicken zum Entfernen")}` : ` – ${t("klicken zum Setzen")}`}`}
          onClick={() => onToggle(m.mode, !active[m.mode])}
          className={`rounded px-1 text-[9px] font-bold leading-4 ${
            active[m.mode] ? m.on : "border border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-500 hover:text-zinc-700"
          } disabled:cursor-default`}
        >
          {m.mode}
        </button>
      ))}
    </span>
  );
}

/** Free-text label for a "Sonstiges" block. */
function OtherLabelForm({
  value,
  onChange,
  pending,
  onSave,
  onBack,
}: {
  value: string;
  onChange: (value: string) => void;
  pending: boolean;
  onSave: () => void;
  onBack?: () => void;
}) {
  const t = useT();
  const empty = value.trim() === "";
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!empty) onSave();
      }}
    >
      <label className="text-[11px] font-medium text-zinc-600" htmlFor="other-label">
        {t("Sonstiges – Bezeichnung")}
      </label>
      <input
        id="other-label"
        className="input py-1 text-xs"
        autoFocus
        maxLength={OTHER_LABEL_MAX}
        placeholder={t("z. B. Produktschulung")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex gap-1">
        {onBack && (
          <button type="button" className="btn-secondary btn-sm flex-1" onClick={onBack}>
            {t("Zurück")}
          </button>
        )}
        <button type="submit" disabled={pending || empty} className="btn-primary btn-sm flex-1">
          {t("Speichern")}
        </button>
      </div>
    </form>
  );
}

/** Colour legend under the plan. */
function Legend() {
  const t = useT();
  const items: [string, string][] = [
    [PHONE_COLOR, "Telefonie"],
    [DUTY_COLORS.crm, DUTY_TYPE_LABELS.crm],
    [DUTY_COLORS.ticket_duty, DUTY_TYPE_LABELS.ticket_duty],
    [DUTY_COLORS.break_am, "Pause"],
    [DUTY_COLORS.break, "Mittagspause"],
    [DUTY_COLORS.bila, "BILA / Teammeeting"],
    [DUTY_COLORS.training_lock, DUTY_TYPE_LABELS.training_lock],
    [DUTY_COLORS.backoffice, DUTY_TYPE_LABELS.backoffice],
    [ABSENT_COLOR, "Krank / Abwesend"],
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] text-zinc-600">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`flex h-3 w-6 items-center justify-center rounded-sm ${color}`}>
            {(label === "Pause" || label === "Mittagspause") && <Coffee className="h-2.5 w-2.5" aria-hidden />}
          </span>
          {t(label)}
        </span>
      ))}
    </div>
  );
}
