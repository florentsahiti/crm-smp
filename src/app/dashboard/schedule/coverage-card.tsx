"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleDot, RefreshCw } from "lucide-react";
import { DAY_END_MINUTE, DAY_START_MINUTE, SKILL_LABELS, SLOT_MINUTES } from "@/lib/constants";
import { minutesToTime } from "@/lib/dates";
import { HOURS, requiredAgents, skillCoverage, slotSummary, type Agent, type DayAbsences, type DayBlock } from "@/lib/capacity";
import { useZurichNow } from "@/lib/use-zurich-now";
import { useT } from "@/lib/i18n/client";

const TIMES = Array.from({ length: (DAY_END_MINUTE - DAY_START_MINUTE) / SLOT_MINUTES }, (_, i) => DAY_START_MINUTE + i * SLOT_MINUTES);
const DEFAULT_MINUTE = 10 * 60;

/**
 * "Abdeckung & verfügbare Mitarbeitende": who is available for calls in one 15-minute slot, who is on
 * a break, at lunch, in a meeting/BILA, away or in backoffice — and per language (available / planned).
 * Today it follows the current time (recomputed every 30 seconds); on other days a time is chosen.
 * Same counting as the coverage table (`slotSummary`).
 */
export function CoverageCard({
  dateKey,
  agents,
  absences,
  blocks,
  hourlyForecast,
}: {
  dateKey: string;
  agents: Agent[];
  absences: DayAbsences;
  blocks: DayBlock[];
  hourlyForecast: number[] | null;
}) {
  const t = useT();
  const router = useRouter();
  const now = useZurichNow();
  const [picked, setPicked] = useState<number | null>(null);
  const live = now !== null && now.dateKey === dateKey && now.minute >= DAY_START_MINUTE && now.minute < DAY_END_MINUTE;
  const minute = picked ?? (live ? Math.floor(now.minute / SLOT_MINUTES) * SLOT_MINUTES : DEFAULT_MINUTE);
  const s = slotSummary(minute, agents, absences, blocks);
  const skills = skillCoverage(minute, agents, absences, blocks);
  const hourIndex = HOURS.indexOf(Math.floor(minute / 60));
  const forecast = hourlyForecast && hourIndex >= 0 ? hourlyForecast[hourIndex] : null;
  const required = forecast === null ? null : requiredAgents(forecast);

  const tiles: { label: string; value: number; style: string }[] = [
    { label: "Verfügbar", value: s.available, style: "bg-green-50 text-green-800 ring-green-200" },
    { label: "In Pause", value: s.onBreak - s.onLunch, style: "bg-yellow-50 text-yellow-800 ring-yellow-200" },
    { label: "Mittagspause", value: s.onLunch, style: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
    { label: "Meeting / BILA", value: s.fixed, style: "bg-violet-50 text-violet-800 ring-violet-200" },
    { label: "Krank / Abwesend", value: s.absent, style: "bg-red-50 text-red-700 ring-red-200" },
    ...(s.backoffice > 0 ? [{ label: "Backoffice", value: s.backoffice, style: "bg-teal-50 text-teal-800 ring-teal-200" }] : []),
  ];

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title mb-0 flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-zinc-700" /> {t("Abdeckung & verfügbare Mitarbeitende")}
        </h2>
        <div className="flex items-center gap-1.5">
          {live && picked === null ? (
            <span className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-semibold text-white" title={t("Aktuelle Zeit")}>
              {minutesToTime(minute)}
            </span>
          ) : (
            <select
              aria-label={t("Zeitpunkt")}
              className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-zinc-800"
              value={minute}
              onChange={(e) => setPicked(Number(e.target.value))}
            >
              {TIMES.map((m) => (
                <option key={m} value={m}>
                  {minutesToTime(m)}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn-ghost btn-sm px-1.5"
            aria-label={t("Aktualisieren")}
            title={t("Aktualisieren")}
            onClick={() => {
              setPicked(null);
              router.refresh();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className={`grid gap-1.5 ${tiles.length > 5 ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-5"}`}>
        {tiles.map((tile) => (
          <div key={tile.label} className={`min-w-0 rounded-xl px-1 py-2 text-center ring-1 ${tile.style}`}>
            <p className="text-xl font-semibold tabular-nums">{tile.value}</p>
            <p className="text-[9px] leading-tight hyphens-auto">{t(tile.label)}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-500">
        {required === null
          ? t("{a} von {n} Anrufbearbeitenden verfügbar.", { a: s.available, n: agents.length })
          : t("{a} verfügbar / {r} benötigt", { a: s.available, r: required })}
        {s.work > 0 && ` · ${t("{n} in anderer Tätigkeit", { n: s.work })}`}
      </p>

      <div>
        <p className="mb-2 text-xs font-semibold text-zinc-800">{t("Verfügbare Mitarbeitende nach Sprachskill")}</p>
        <ul className="flex flex-col gap-2">
          {skills.map((row) => {
            const name = row.skills.length === 1 ? t(SKILL_LABELS[row.skills[0]]) : row.skills.join("/");
            const pct = row.planned ? (row.available / row.planned) * 100 : 0;
            return (
              <li key={name} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-xs">
                <span className="truncate text-zinc-700">{name}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
                  <span
                    className={`block h-full rounded-full ${row.available === 0 && row.planned > 0 ? "bg-red-400" : row.skills.length === 1 ? "bg-blue-600" : "bg-blue-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className={`text-right tabular-nums ${row.available === 0 && row.planned > 0 ? "font-semibold text-red-600" : "text-zinc-600"}`}>
                  {row.available} / {row.planned}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
