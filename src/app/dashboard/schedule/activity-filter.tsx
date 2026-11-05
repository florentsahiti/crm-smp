"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { ACTIVITIES, ACTIVITY_LABELS, type Activity } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";

/** "Alle Tätigkeiten ▾": highlights one activity in the plan (kept in the URL as `a=`). */
export function ActivityFilter({ current, hrefs }: { current: Activity | null; hrefs: Record<Activity | "all", string> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const options: (Activity | "all")[] = ["all", ...ACTIVITIES];
  const label = (a: Activity | "all") => (a === "all" ? t("Alle Tätigkeiten") : t(ACTIVITY_LABELS[a]));
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        className={`btn-secondary btn-sm ${current ? "border-brand-300 text-brand-800" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {label(current ?? "all")} <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl" role="menu">
            {options.map((a) => (
              <Link
                key={a}
                href={hrefs[a]}
                scroll={false}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                {label(a)}
                {(current ?? "all") === a && <Check className="h-3.5 w-3.5 text-brand-700" />}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
