"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { deleteRefusedLeave, recordRefusedLeave } from "@/lib/actions/absences";
import { unwrap } from "@/lib/action-result";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatDateKey } from "@/lib/dates";

export type RefusedRow = { id: string; employee: string; from: string; to: string; note: string | null; decidedBy: string | null; decidedAt: string | null };

/**
 * "Abgelehnte Ferien": vacation days a manager had to refuse, with the person and the dates.
 * Managers add and remove rows; employees only see their own (filtered on the server).
 */
export function RefusedLeave({
  rows,
  employees,
  canEdit,
  defaultDate,
}: {
  rows: RefusedRow[];
  employees: { id: string; name: string }[];
  canEdit: boolean;
  defaultDate: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [from, setFrom] = useState(defaultDate);
  const [to, setTo] = useState(defaultDate);
  const [note, setNote] = useState("");
  const fmt = (k: string) => formatDateKey(k, locale);

  function run(action: () => Promise<unknown>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        after?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Etwas ist schiefgelaufen."));
      }
    });
  }

  return (
    <div className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title mb-0">{t("Abgelehnte Ferien")}</h2>
          <p className="text-xs text-zinc-500">
            {canEdit ? t("Ferientage, die nicht bewilligt werden konnten – wer und wann.") : t("Ihre Ferientage, die nicht bewilligt werden konnten.")}
          </p>
        </div>
        {canEdit && !open && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> {t("Ablehnung erfassen")}
          </button>
        )}
      </div>

      {canEdit && open && (
        <form
          className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-zinc-50 p-3 text-xs sm:grid-cols-[1.5fr_1fr_1fr_2fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => unwrap(recordRefusedLeave({ employeeId, from, to, note: note || undefined })),
              () => {
                setOpen(false);
                setNote("");
              }
            );
          }}
        >
          <label className="flex flex-col gap-0.5 text-[11px] text-zinc-500">
            {t("Mitarbeitende")}
            <select className="input py-1 text-xs" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-zinc-500">
            {t("Von")}
            <input
              type="date"
              className="input py-1 text-xs"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (to < e.target.value) setTo(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-zinc-500">
            {t("Bis")}
            <input type="date" className="input py-1 text-xs" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-zinc-500 sm:col-span-1">
            {t("Grund (optional)")}
            <input className="input py-1 text-xs" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("z. B. zu viele Personen abwesend")} />
          </label>
          <div className="col-span-2 flex items-end gap-1 sm:col-span-1">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>
              {t("Abbrechen")}
            </button>
            <button type="submit" disabled={pending || !employeeId} className="btn-primary btn-sm">
              {t("Speichern")}
            </button>
          </div>
        </form>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">{t("Keine abgelehnten Ferien in diesem Zeitraum.")}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 text-[11px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2 pr-3 font-medium">{t("Mitarbeitende")}</th>
                <th className="py-2 pr-3 font-medium">{t("Abgelehnte Tage")}</th>
                <th className="py-2 pr-3 font-medium">{t("Grund")}</th>
                <th className="py-2 pr-3 font-medium">{t("Abgelehnt von")}</th>
                <th className="py-2 pr-3 font-medium">{t("Am")}</th>
                {canEdit && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-zinc-800">{r.employee}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-zinc-700">
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">{r.from === r.to ? fmt(r.from) : `${fmt(r.from)} – ${fmt(r.to)}`}</span>
                  </td>
                  <td className="py-2 pr-3 text-zinc-600">{r.note ?? "–"}</td>
                  <td className="py-2 pr-3 text-zinc-600">{r.decidedBy ?? "–"}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-zinc-500">{r.decidedAt ? fmt(r.decidedAt) : "–"}</td>
                  {canEdit && (
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={t("Entfernen")}
                        title={t("Entfernen")}
                        onClick={() => run(() => unwrap(deleteRefusedLeave(r.id)))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
