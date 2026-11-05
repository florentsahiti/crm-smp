import type { Activity } from "@/lib/constants";

export type ScheduleView = "day" | "week";

/** Link to the Einsatzplan: `?d=` day (or a day of the week), `view=week`, `a=` activity filter. */
export function scheduleHref({ d, view = "day", a = null }: { d: string; view?: ScheduleView; a?: Activity | null }): string {
  const params = new URLSearchParams({ d });
  if (view === "week") params.set("view", "week");
  if (a) params.set("a", a);
  return `/dashboard/schedule?${params}`;
}
