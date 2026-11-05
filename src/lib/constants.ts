// Two roles only.
// manager: plans schedules, enters absences and forecasts, manages employees.
//          Managers are not counted as call-takers in capacity.
// employee: views schedules, enters their own breaks and HO / BO days.
export const ROLES = ["employee", "manager"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  employee: "Mitarbeitende/r",
  manager: "Manager/in",
};

/** Roles that can plan schedules and edit absences. */
export const SCHEDULER_ROLES: Role[] = ["manager"];
export function isScheduler(role: Role): boolean {
  return SCHEDULER_ROLES.includes(role);
}

export const HALF_DAYS = ["AM", "PM", "FULL"] as const;
export type HalfDay = (typeof HALF_DAYS)[number];

export const HALF_DAY_LABELS: Record<HalfDay, string> = {
  AM: "VM",
  PM: "NM",
  FULL: "Ganzer Tag",
};

export const ABSENCE_TYPES = [
  "vacation",
  "sick",
  "training",
  "holiday",
  "accident",
  "military",
  "reduced_workload",
] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  vacation: "Ferien",
  sick: "Krank",
  training: "Weiterbildung",
  holiday: "Feiertag",
  accident: "Unfall",
  military: "Militär / Zivildienst",
  reduced_workload: "Reduziertes Pensum",
};

// Short codes shown in the compact grid cells — mirrors the codes used in
// the original Ferien-plan spreadsheet so the vocabulary stays familiar.
export const ABSENCE_TYPE_CODES: Record<AbsenceType, string> = {
  vacation: "F",
  sick: "KR",
  training: "W",
  holiday: "FT",
  accident: "UN",
  military: "M",
  reduced_workload: "P",
};

// "break" is the lunch break (kept as the stored value so existing rows stay valid).
export const DUTY_TYPES = [
  "ticket_duty",
  "crm",
  "backoffice",
  "meeting",
  "bila",
  "training_lock",
  "internal",
  "coaching",
  "case_review",
  "tech_issue",
  "other",
  "break_am",
  "break",
  "break_pm",
] as const;
export type DutyType = (typeof DUTY_TYPES)[number];

export const DUTY_TYPE_LABELS: Record<DutyType, string> = {
  ticket_duty: "Ticketdienst",
  crm: "CRM",
  backoffice: "Backoffice (nur E-Mail)",
  meeting: "Teammeeting",
  bila: "BILA",
  training_lock: "Schulung",
  internal: "Interner Termin",
  coaching: "Coaching",
  case_review: "Fallbesprechung",
  tech_issue: "Technisches Problem",
  other: "Sonstiges",
  break_am: "Pause Vormittag",
  break: "Mittagspause",
  break_pm: "Pause Nachmittag",
};

/** The only blocks employees may add, move or remove themselves. */
export const BREAK_TYPES = ["break_am", "break", "break_pm"] as const;
export type BreakType = (typeof BREAK_TYPES)[number];
export const isBreak = (t: string): t is BreakType => (BREAK_TYPES as readonly string[]).includes(t);

/**
 * When each break may lie and how long it is — mirrors the old Einsatzplan:
 * 15 min in the morning (08–12), lunch 30–60 min (12–14), 15 min in the afternoon (14–17).
 */
export const BREAK_RULES: Record<BreakType, { from: number; to: number; durations: number[] }> = {
  break_am: { from: 8 * 60, to: 12 * 60, durations: [15] },
  break: { from: 12 * 60, to: 14 * 60, durations: [30, 45, 60] },
  break_pm: { from: 14 * 60, to: 17 * 60, durations: [15] },
};

/**
 * Team rule: at most this many employees on a break at the same time (any break type, whole team).
 * Managers' breaks don't count — managers are not call-takers.
 */
export const MAX_CONCURRENT_BREAKS = 4;

/** "Sonstiges": a manager-only block whose label is free text, stored in the block's note. */
export const OTHER = "other" satisfies DutyType;
export const OTHER_LABEL_MAX = 40;

/** Fixed appointments: they lock the time slot — the person counts as unavailable. */
export const FIXED_TYPES = ["meeting", "bila", "training_lock", "internal", "coaching", "case_review"] as const satisfies readonly DutyType[];
export const isFixed = (t: string) => (FIXED_TYPES as readonly string[]).includes(t);

/**
 * Backoffice day: the person works but only does e-mail (e.g. can't talk) — not phone capacity.
 * Stored as one whole-day block (08:00–17:00) of this type rather than a separate table: the
 * capacity maths already goes through blocks (statusAt), so breaks and appointments on that day
 * still count as such, and it shows in the plan, "Mein Plan" and the week view for free.
 */
export const BACKOFFICE = "backoffice" satisfies DutyType;
export const isBackoffice = (t: string) => t === BACKOFFICE;

/** How a block is counted in the capacity view. Ticket duty, tech issues etc. = "other work". */
export type ActivityKind = "break" | "fixed" | "backoffice" | "work";
export const activityKind = (t: string): ActivityKind =>
  isBreak(t) ? "break" : isFixed(t) ? "fixed" : isBackoffice(t) ? "backoffice" : "work";

/** Manual special dates in the Einsatzplan's "Ereignisse" (birthdays/holidays/appointments are derived). */
export const EVENT_TYPES = ["event", "meeting", "info"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  event: "Ereignis",
  meeting: "Meeting",
  info: "Mitteilung",
};

/**
 * Activity filter of the Einsatzplan ("Alle Tätigkeiten ▾"): highlights one kind of activity and
 * dims the rest. "phone" = working time without another block (Telefonie).
 */
export const ACTIVITIES = ["phone", "crm", "ticket", "pause", "bila", "backoffice", "other", "absent"] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const ACTIVITY_LABELS: Record<Activity, string> = {
  phone: "Telefonie",
  crm: "CRM",
  ticket: "Ticketdienst",
  pause: "Pause",
  bila: "BILA / Termine",
  backoffice: "Backoffice",
  other: "Sonstiges",
  absent: "Abwesend",
};

export const isActivity = (v: unknown): v is Activity => typeof v === "string" && (ACTIVITIES as readonly string[]).includes(v);

/** Which filter activity a block belongs to (null = other work, e.g. a tech issue). */
export function activityOfDuty(t: string): Activity | null {
  if (t === "ticket_duty") return "ticket";
  if (t === "crm") return "crm";
  if (isBackoffice(t)) return "backoffice";
  if (isBreak(t)) return "pause";
  if (isFixed(t)) return "bila";
  if (t === OTHER) return "other";
  return null;
}

export const LOCATIONS = ["HO", "O"] as const;
export type Location = (typeof LOCATIONS)[number];

export const LOCATION_LABELS: Record<Location, string> = {
  HO: "Home Office",
  O: "Büro",
};

export const REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Offen",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
};

export const SKILL_CODES = ["DE", "FR", "IT", "EN"] as const;
export type SkillCode = (typeof SKILL_CODES)[number];

export const SKILL_LABELS: Record<SkillCode, string> = {
  DE: "Deutsch",
  FR: "Französisch",
  IT: "Italienisch",
  EN: "Englisch",
};

/** One badge colour per language, so the languages stand apart at a glance (badges only). */
export const SKILL_COLORS: Record<SkillCode, string> = {
  DE: "bg-blue-100 text-blue-800",
  FR: "bg-violet-100 text-violet-800",
  IT: "bg-emerald-100 text-emerald-800",
  EN: "bg-amber-100 text-amber-800",
};
export const isSkillCode = (k: string): k is SkillCode => (SKILL_CODES as readonly string[]).includes(k);

export const NOTIFICATION_TYPES = [
  "leave_decided",
  "leave_submitted",
  "swap_claimed",
  "swap_decided",
  "schedule_change",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** First year managers can enter past figures for on the Prognose page ("Ist-Werte vergangener Jahre"). */
export const HISTORY_FIRST_YEAR = 2024;

// Working-day bounds shared by the shift planner UI and its server actions.
export const DAY_START_MINUTE = 8 * 60; // 08:00
export const DAY_END_MINUTE = 17 * 60; // 17:00
export const SLOT_MINUTES = 15;
export const LUNCH_START_MINUTE = 12 * 60;
export const LUNCH_END_MINUTE = 14 * 60;

/** Business time zone — "now" for the live capacity view is Swiss local time. */
export const TIME_ZONE = "Europe/Zurich";
