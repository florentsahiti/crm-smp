"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { periodHref, type PeriodView } from "./period";

/** Date field of the absences page: jumps to the chosen date in the current view (Tag / Woche / Monat). */
export function PeriodDateInput({ view, dateKey }: { view: PeriodView; dateKey: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <input
      type="date"
      aria-label={t("Datum wählen")}
      className="input w-auto px-2 py-1 text-xs"
      value={dateKey}
      onChange={(e) => {
        if (e.target.value) router.push(periodHref(view, e.target.value));
      }}
    />
  );
}
