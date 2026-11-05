"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarDays, Cake, CalendarOff, Info, Lock, Pencil, Plus, Users, X } from "lucide-react";
import { createEvent, deleteEvent, updateEvent, type EventInput } from "@/lib/actions/events";
import { unwrap } from "@/lib/action-result";
import { DUTY_TYPE_LABELS, EVENT_TYPES, EVENT_TYPE_LABELS, type EventType } from "@/lib/constants";
import { minutesToTime, parseDateKey } from "@/lib/dates";
import { matchesFilter, type AgendaFilter, type AgendaItem } from "@/lib/events";
import { INTL_LOCALE, type T } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";

const FILTERS: { value: AgendaFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "events", label: "Ereignisse" },
  { value: "birthdays", label: "Geburtstage" },
  { value: "holidays", label: "Feiertage" },
  { value: "appointments", label: "Termine" },
  { value: "info", label: "Mitteilungen" },
];

/** Icon, icon colours and the coloured type label on the right of each item. */
function look(item: AgendaItem, t: T) {
  switch (item.kind) {
    case "birthday":
      return { Icon: Cake, icon: "bg-pink-50 text-pink-600", badge: "bg-green-100 text-green-700", label: t("Geburtstag") };
    case "holiday":
      return { Icon: CalendarOff, icon: "bg-amber-50 text-amber-600", badge: "bg-amber-100 text-amber-800", label: t("Feiertag") };
    case "appointment":
      return { Icon: Lock, icon: "bg-tone-rosa-60 text-tone-wine", badge: "bg-tone-rosa text-tone-wine", label: t(DUTY_TYPE_LABELS[item.dutyType]) };
    case "event":
      if (item.event.type === "info") return { Icon: Info, icon: "bg-zinc-100 text-zinc-600", badge: "bg-zinc-100 text-zinc-700", label: t(EVENT_TYPE_LABELS.info) };
      if (item.event.type === "meeting") return { Icon: Users, icon: "bg-blue-50 text-blue-600", badge: "bg-blue-100 text-blue-700", label: t(EVENT_TYPE_LABELS.meeting) };
      return { Icon: CalendarDays, icon: "bg-brand-50 text-brand-700", badge: "bg-brand-100 text-brand-800", label: t(EVENT_TYPE_LABELS.event) };
  }
}

function titleOf(item: AgendaItem, t: T, dayLabel: string) {
  switch (item.kind) {
    case "birthday":
      if (item.daysAway === 0) return t("Geburtstag – {name}", { name: item.name });
      if (item.daysAway === 1) return t("Geburtstag morgen – {name}", { name: item.name });
      return t("Geburtstag in {n} Tagen – {name}, {date}", { n: item.daysAway, name: item.name, date: dayLabel });
    case "holiday":
      return t(item.name);
    case "appointment": {
      const label = t(DUTY_TYPE_LABELS[item.dutyType]);
      const base = item.people.length === 1 ? `${label} – ${item.people[0]}` : `${label} (${t("{n} Mitarbeitende", { n: item.people.length })})`;
      return item.note ? `${base}: ${item.note}` : base;
    }
    case "event":
      return item.event.title;
  }
}

type Draft = { id: string | null; date: string; start: string; end: string; title: string; type: EventType; note: string };

const TIMES = Array.from({ length: (20 - 6) * 4 + 1 }, (_, i) => 6 * 60 + i * 15);

/**
 * "Ereignisse": the selected day's special dates and the next 7 days ("Demnächst") — manual events,
 * birthdays, public holidays and fixed appointments. Everyone reads it; managers add/edit/delete
 * manual events.
 */
export function EventsPanel({ dateKey, isToday, items, canEdit }: { dateKey: string; isToday: boolean; items: AgendaItem[]; canEdit: boolean }) {
  const t = useT();
  const locale = useLocale();
  const [filter, setFilter] = useState<AgendaFilter>("all");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = items.filter((i) => matchesFilter(i, filter));
  const today = shown.filter((i) => i.daysAway === 0);
  const upcoming = shown.filter((i) => i.daysAway > 0);
  const newCount = isToday ? items.filter((i) => i.daysAway === 0).length : 0;
  const dayLabel = (key: string) =>
    parseDateKey(key).toLocaleDateString(INTL_LOCALE[locale], { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

  function open(d: Draft) {
    setDraft(d);
    setError(null);
    dialogRef.current?.showModal();
  }

  function save(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        dialogRef.current?.close();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Konnte nicht gespeichert werden."));
      }
    });
  }

  function renderItem(item: AgendaItem) {
    const { Icon, icon, badge, label } = look(item, t);
    const time = item.startMinute !== null ? `${minutesToTime(item.startMinute)}${item.endMinute !== null ? `–${minutesToTime(item.endMinute)}` : ""}` : null;
    const sub = [
      item.daysAway === 0 ? (isToday ? t("Heute") : null) : item.kind === "birthday" && item.daysAway > 1 ? null : dayLabel(item.dateKey),
      time,
      item.kind === "appointment" && item.people.length > 1 ? item.people.join(", ") : null,
      item.kind === "event" ? item.event.note : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <li key={item.key} className="flex items-start gap-3 py-2">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${icon}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900">{titleOf(item, t, dayLabel(item.dateKey))}</p>
          {sub && <p className="truncate text-xs text-zinc-500" title={sub}>{sub}</p>}
        </div>
        <span className={`badge shrink-0 text-[10px] ${badge}`}>{label}</span>
        {canEdit && item.kind === "event" && (
          <button
            type="button"
            className="btn-ghost btn-sm -mr-1 px-1.5"
            aria-label={t("Bearbeiten")}
            onClick={() =>
              open({
                id: item.event.id,
                date: item.dateKey,
                start: item.startMinute?.toString() ?? "",
                end: item.endMinute?.toString() ?? "",
                title: item.event.title,
                type: item.event.type,
                note: item.event.note ?? "",
              })
            }
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </li>
    );
  }

  const input = (d: Draft): EventInput => ({
    date: d.date,
    startMinute: d.start === "" ? null : Number(d.start),
    endMinute: d.end === "" ? null : Number(d.end),
    title: d.title,
    type: d.type,
    note: d.note || null,
  });

  return (
    <div className="card flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-title mb-0 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-brand-700" /> {t("Ereignisse & Mitteilungen")}
        </h2>
        <div className="flex items-center gap-2">
          {newCount > 0 && <span className="badge bg-red-600 text-white">{t("{n} Neu", { n: newCount })}</span>}
          {canEdit && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => open({ id: null, date: dateKey, start: "", end: "", title: "", type: "event", note: "" })}
            >
              <Plus className="h-3.5 w-3.5" /> {t("Ereignis")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-0.5 overflow-x-auto border-b border-zinc-100 text-xs [scrollbar-width:none]" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`-mb-px shrink-0 border-b-2 px-1.5 py-1.5 ${filter === f.value ? "border-blue-600 font-medium text-blue-700" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
          >
            {t(f.label)}
          </button>
        ))}
      </div>

      <div className="max-h-96 overflow-y-auto">
        <ul className="divide-y divide-zinc-100">{today.map(renderItem)}</ul>
        {today.length === 0 && <p className="py-3 text-sm text-zinc-400">{isToday ? t("Heute nichts Besonderes.") : t("An diesem Tag nichts Besonderes.")}</p>}

        {upcoming.length > 0 && (
          <>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{t("Demnächst")}</p>
            <ul className="divide-y divide-zinc-100">{upcoming.map(renderItem)}</ul>
          </>
        )}
      </div>

      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-zinc-900/40 backdrop:backdrop-blur-[2px]"
      >
        {draft && (
          <form
            className="flex flex-col gap-4 p-6"
            onSubmit={(e) => {
              e.preventDefault();
              save(() => unwrap(draft.id ? updateEvent(draft.id, input(draft)) : createEvent(input(draft))));
            }}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">{draft.id ? t("Ereignis bearbeiten") : t("Ereignis erfassen")}</h2>
              <button type="button" className="btn-ghost btn-sm" onClick={() => dialogRef.current?.close()} aria-label={t("Schliessen")}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 flex flex-col gap-1.5">
                <span className="label">{t("Titel")}</span>
                <input
                  required
                  maxLength={120}
                  className="input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder={t("z. B. Teammeeting")}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label">{t("Art")}</span>
                <select className="input" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as EventType })}>
                  {EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(EVENT_TYPE_LABELS[type])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label">{t("Datum")}</span>
                <input type="date" required className="input" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label">{t("Von (optional)")}</span>
                <select className="input" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value, end: e.target.value === "" ? "" : draft.end })}>
                  <option value="">–</option>
                  {TIMES.map((m) => (
                    <option key={m} value={m}>
                      {minutesToTime(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label">{t("Bis (optional)")}</span>
                <select className="input" value={draft.end} disabled={draft.start === ""} onChange={(e) => setDraft({ ...draft, end: e.target.value })}>
                  <option value="">–</option>
                  {TIMES.filter((m) => m > Number(draft.start)).map((m) => (
                    <option key={m} value={m}>
                      {minutesToTime(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 flex flex-col gap-1.5">
                <span className="label">{t("Notiz (optional)")}</span>
                <textarea className="input" rows={2} maxLength={500} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              </label>
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              {draft.id ? (
                <button
                  type="button"
                  className="btn-ghost text-red-600 hover:bg-red-50"
                  disabled={pending}
                  onClick={() => save(() => unwrap(deleteEvent(draft.id!)))}
                >
                  {t("Löschen")}
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => dialogRef.current?.close()}>
                  {t("Abbrechen")}
                </button>
                <button type="submit" className="btn-primary" disabled={pending}>
                  {pending ? t("Wird gespeichert…") : t("Speichern")}
                </button>
              </div>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
