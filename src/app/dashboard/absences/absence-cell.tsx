"use client";

import { useTransition } from "react";
import { setAbsence } from "@/lib/actions/absences";
import { useT } from "@/lib/i18n/client";
import { ABSENCE_TYPES, ABSENCE_TYPE_CODES, ABSENCE_TYPE_LABELS, type AbsenceType, type HalfDay } from "@/lib/constants";

export function AbsenceCell({
  employeeId,
  date,
  halfDay,
  currentType,
  readOnly,
}: {
  employeeId: string;
  date: string;
  halfDay: HalfDay;
  currentType: AbsenceType | null;
  readOnly: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const t = useT();

  return (
    <select
      value={currentType ?? ""}
      disabled={readOnly || pending}
      title={currentType ? t(ABSENCE_TYPE_LABELS[currentType]) : t("Anwesend")}
      onChange={(event) => {
        const value = event.target.value;
        const type = value === "" ? null : (value as AbsenceType);
        startTransition(() => {
          setAbsence({ employeeId, date, halfDay, type });
        });
      }}
      className="w-full min-w-[2.25rem] cursor-pointer appearance-none rounded border-0 bg-transparent px-0.5 py-1 text-center text-[11px] font-medium text-zinc-700 outline-none hover:bg-zinc-100 focus:bg-white focus:ring-1 focus:ring-zinc-400 disabled:cursor-default disabled:opacity-60"
    >
      <option value=""></option>
      {ABSENCE_TYPES.map((type) => (
        <option key={type} value={type}>
          {ABSENCE_TYPE_CODES[type]}
        </option>
      ))}
    </select>
  );
}
