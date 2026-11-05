import type { DutyType } from "@/lib/constants";

/**
 * Block colours in the Einsatzplan (as in the design): Telefonie light blue, CRM light green,
 * Ticketdienst light violet, Pause yellow, Mittagspause grey, BILA/Teammeeting pink, Schulung
 * light grey, Backoffice teal, absent light red. Shared by the day timeline, the week view and the legend.
 */
export const DUTY_COLORS: Record<DutyType, string> = {
  ticket_duty: "bg-violet-200 text-violet-950",
  crm: "bg-green-200 text-green-950",
  backoffice: "bg-teal-200 text-teal-950",
  meeting: "bg-pink-200 text-pink-950",
  bila: "bg-pink-200 text-pink-950",
  training_lock: "bg-stone-200 text-stone-700",
  internal: "bg-pink-200 text-pink-950",
  coaching: "bg-tone-beige text-[#5c4630]",
  case_review: "bg-tone-violet-20 text-[#3b3270]",
  tech_issue: "bg-tone-red-20 text-[#9c0f1f]",
  other: "bg-zinc-200 text-zinc-900",
  break_am: "bg-yellow-200 text-yellow-900",
  break: "bg-zinc-300 text-zinc-700",
  break_pm: "bg-yellow-200 text-yellow-900",
};

/** Working time without another block (display only). */
export const PHONE_COLOR = "bg-blue-200 text-blue-950";

/** Absent time (day timeline and week view). */
export const ABSENT_COLOR = "bg-red-100 text-red-700";

/** Shorter labels inside the blocks (the full label is in the tooltip). */
export const SHORT_LABELS: Partial<Record<DutyType, string>> = {
  break_am: "Pause",
  break_pm: "Pause",
};

const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
];

/** A stable colour for a person's initials badge. */
export function avatarColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
