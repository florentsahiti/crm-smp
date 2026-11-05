"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { SLOT_MINUTES } from "@/lib/constants";
import { minutesToTime } from "@/lib/dates";
import { slotSummary, statusAt, type Agent, type DayAbsences, type DayBlock } from "@/lib/capacity";
import { useT } from "@/lib/i18n/client";

/**
 * Popover under a clicked time in the ruler: how many call-takers are active (available for calls)
 * in that 15-minute slot, out of how many — counted with `slotSummary`, exactly like the coverage
 * table. Closes on Esc or a click outside.
 */
export function ActivePopover({
  minute,
  agents,
  absences,
  blocks,
  alignRight = false,
  onClose,
}: {
  minute: number;
  agents: Agent[];
  absences: DayAbsences;
  blocks: DayBlock[];
  /** open to the left of the time (near the end of the day) */
  alignRight?: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [showNames, setShowNames] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = slotSummary(minute, agents, absences, blocks);
  const active = agents.filter((a) => statusAt(a.id, minute, absences, blocks).status === "available");
  const rows: [string, number][] = [
    ["In Pause", s.onBreak],
    ["Termin", s.fixed],
    ["Abwesend", s.absent],
    ["Backoffice", s.backoffice],
    ["Andere Tätigkeit", s.work],
  ];

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className={`absolute z-30 mt-1 w-48 ${alignRight ? "right-0" : "left-0"} rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-xl`} role="dialog" aria-label={t("Aktiv um {time}", { time: minutesToTime(minute) })}>
        <p className="text-[11px] text-zinc-500">
          {minutesToTime(minute)}–{minutesToTime(minute + SLOT_MINUTES)}
        </p>
        <p className="mt-0.5 text-2xl font-semibold text-zinc-900">
          {t("{n} aktiv", { n: s.available })} <span className="text-sm font-normal text-zinc-500">{t("von {n}", { n: agents.length })}</span>
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-zinc-500">
          {rows
            .filter(([label, n]) => n > 0 || label !== "Backoffice")
            .map(([label, n]) => (
              <div key={label} className="contents">
                <dt>{t(label)}</dt>
                <dd className="text-right tabular-nums text-zinc-700">{n}</dd>
              </div>
            ))}
        </dl>
        {active.length > 0 && (
          <>
            <button type="button" className="mt-2 flex items-center gap-1 text-[11px] text-brand-700 hover:underline" onClick={() => setShowNames((v) => !v)}>
              {showNames ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} {t("Wer ist aktiv?")}
            </button>
            {showNames && <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">{active.map((a) => a.name).join(", ")}</p>}
          </>
        )}
      </div>
    </>
  );
}
