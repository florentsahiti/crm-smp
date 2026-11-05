"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, CircleHelp, Clock, MoreHorizontal } from "lucide-react";
import type { Activity } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { scheduleHref, type ScheduleView } from "./schedule-url";
import { scrollToNowLine } from "./now-scroll";

/**
 * "Aktuelle Zeit": opens today's plan at the now line. When today's plan is already shown, it only
 * scrolls there (a link to the same page would not move the page).
 */
export function NowButton({ href }: { href: string }) {
  const t = useT();
  return (
    <Link
      href={href}
      className="btn btn-sm bg-blue-600 text-white shadow-sm hover:bg-blue-700"
      onClick={(e) => {
        if (scrollToNowLine(true)) e.preventDefault();
      }}
    >
      <Clock className="h-4 w-4" /> {t("Aktuelle Zeit")}
    </Link>
  );
}

/** The shown day (or week) as a button that opens the browser's calendar. */
export function DatePicker({ dateKey, label, view, activity }: { dateKey: string; label: string; view: ScheduleView; activity: Activity | null }) {
  const t = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  return (
    <label className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50">
      <CalendarDays className="h-4 w-4 text-zinc-500" />
      <span className="whitespace-nowrap">{label}</span>
      <ChevronDown className="h-4 w-4 text-zinc-400" />
      <input
        ref={input}
        type="date"
        aria-label={t("Datum wählen")}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={dateKey}
        onClick={() => {
          try {
            input.current?.showPicker();
          } catch {
            // older browsers open the picker on their own
          }
        }}
        onChange={(e) => e.target.value && router.push(scheduleHref({ d: e.target.value, view, a: activity }))}
      />
    </label>
  );
}

/** "…": help for the page and links to the related pages. */
export function MoreMenu({ help, links }: { help: string; links: { href: string; label: string }[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" className="btn-secondary btn-sm px-2" aria-label={t("Weitere Optionen")} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl" role="menu">
            <p className="flex gap-2 px-3 py-2 text-xs leading-relaxed text-zinc-500">
              <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {help}
            </p>
            {links.map((l) => (
              <Link key={l.href} href={l.href} role="menuitem" className="block rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50" onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
