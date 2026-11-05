import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { verifySession } from "@/lib/dal";
import { addDays, dayLabel, fullDayLabel, nearestWeekday, parseDateKey, toDateKey, weekOf, zurichDateKey } from "@/lib/dates";
import { ACTIVITIES, isActivity, isBackoffice, isScheduler, type Activity } from "@/lib/constants";
import { getLocale } from "@/lib/i18n/server";
import { makeT } from "@/lib/i18n";
import { holidayOn } from "@/lib/holidays";
import { ManualChangeMenu, ScheduleActionsProvider } from "./schedule-actions";
import { ActivityFilter } from "./activity-filter";
import { DatePicker, MoreMenu, NowButton } from "./header-controls";
import { DayView, loadDay } from "./day-view";
import { WeekView, loadWeek } from "./week-view";
import { scheduleHref, type ScheduleView } from "./schedule-url";

export default async function SchedulePage(props: PageProps<"/dashboard/schedule">) {
  const session = await verifySession();
  const scheduler = isScheduler(session.role);
  const locale = await getLocale();
  const t = makeT(locale);

  // ?d=YYYY-MM-DD (the day, or a day of the shown week) · ?view=week · ?a=<activity filter>
  const searchParams = await props.searchParams;
  const requestedDate = typeof searchParams.d === "string" ? searchParams.d : null;
  const view: ScheduleView = searchParams.view === "week" ? "week" : "day";
  const activity: Activity | null = isActivity(searchParams.a) ? searchParams.a : null;
  const todayKey = zurichDateKey();
  const date = requestedDate ? parseDateKey(requestedDate) : nearestWeekday(parseDateKey(todayKey));
  const dateKey = toDateKey(date);
  const isToday = dateKey === todayKey;
  const week = weekOf(date);

  const step = view === "week" ? 7 : 1;
  const href = (d: string, v: ScheduleView = view, a: Activity | null = activity) => scheduleHref({ d, view: v, a });
  const activityHrefs = Object.fromEntries([["all", href(dateKey, view, null)], ...ACTIVITIES.map((a) => [a, href(dateKey, view, a)])]) as Record<Activity | "all", string>;

  const [day, weekData] = await Promise.all([view === "day" ? loadDay(date, scheduler) : null, view === "week" ? loadWeek(date) : null]);

  const page = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h1 className="page-title">{t("Einsatzplan")}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={href(toDateKey(addDays(date, -step)))} className="btn-secondary btn-sm px-2" aria-label={view === "week" ? t("Vorherige Woche") : t("Vorheriger Tag")}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <DatePicker
            dateKey={dateKey}
            view={view}
            activity={activity}
            label={view === "week" ? `${dayLabel(week[0], locale)} – ${dayLabel(week[4], locale)}` : fullDayLabel(date, locale)}
          />
          <Link href={href(toDateKey(addDays(date, step)))} className="btn-secondary btn-sm px-2" aria-label={view === "week" ? t("Nächste Woche") : t("Nächster Tag")}>
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link href={href(todayKey)} className="btn-secondary btn-sm">
            {t("Heute")}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
          <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs" role="group" aria-label={t("Ansicht")}>
            {(
              [
                ["day", "Tag"],
                ["week", "Woche"],
              ] as const
            ).map(([v, label]) => (
              <Link
                key={v}
                href={href(dateKey, v)}
                aria-current={view === v ? "page" : undefined}
                className={`rounded-md px-3 py-1 ${view === v ? "bg-white font-medium text-blue-700 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
              >
                {t(label)}
              </Link>
            ))}
          </div>
          <NowButton href={`${href(todayKey, "day")}#now`} />
          <ActivityFilter current={activity} hrefs={activityHrefs} />
          {scheduler && view === "day" && !holidayOn(dateKey) && <ManualChangeMenu />}
          <MoreMenu
            help={
              view === "week"
                ? t("Die Woche auf einen Blick. Tag oder Zelle anklicken, um den Tag zu öffnen und zu bearbeiten.")
                : scheduler
                  ? t("Über eine Zeile ziehen oder klicken, um einen Eintrag zu erfassen. Block anklicken zum Verschieben oder Ändern, Namen anklicken für kurzfristige Abwesenheiten. Uhrzeit anklicken: wer ist aktiv?")
                  : t("Der Tag des ganzen Teams im 15-Minuten-Raster. Ihre Pausen tragen Sie in Ihrer (hervorgehobenen) Zeile ein: Vormittag 15 Min., Mittag, Nachmittag 15 Min.")
            }
            links={[
              { href: "/dashboard/absences", label: t("Abwesenheiten") },
              ...(scheduler ? [{ href: "/dashboard/forecast", label: t("Prognose") }] : [{ href: "/dashboard/my-schedule", label: t("Mein Plan") }]),
            ]}
          />
        </div>
      </div>

      {day && <DayView data={day} isToday={isToday} scheduler={scheduler} currentUserId={session.userId} activity={activity} locale={locale} />}
      {weekData && <WeekView data={weekData} scheduler={scheduler} activity={activity} locale={locale} />}
    </div>
  );

  // Managers get the "Manuelle Änderung" dialogs (header menu + "BILA planen" in the name popup).
  return scheduler && day ? (
    <ScheduleActionsProvider
      dateKey={dateKey}
      people={day.employees.map((e) => ({ id: e.id, name: e.name, groupNumber: e.groupNumber }))}
      currentUserId={session.userId}
      backofficeIds={day.shiftBlocks.filter((b) => isBackoffice(b.dutyType)).map((b) => b.employeeId)}
    >
      {page}
    </ScheduleActionsProvider>
  ) : (
    page
  );
}
