"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/** The detailed per-hour capacity table, folded away by default so the page stays like the design. */
export function DetailsToggle({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="card p-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-2xl px-5 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
      >
        {title}
        <span className="flex items-center gap-1 text-xs font-medium text-brand-700">
          {open ? t("Details ausblenden") : t("Details anzeigen")}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && <div className="border-t border-zinc-100 p-5">{children}</div>}
    </div>
  );
}
