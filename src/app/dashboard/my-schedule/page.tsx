import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { addDays, dayLabel, parseDateKey, todayUTC, toDateKey, weekOf, zurichDateKey } from "@/lib/dates";
import { holidayOn } from "@/lib/holidays";
import { DayCard } from "./day-card";
import { getLocale } from "@/lib/i18n/server";
import { makeT } from "@/lib/i18n";
import type { AbsenceType, DutyType, HalfDay, Location } from "@/lib/constants";

export default async function MySchedulePage(props: PageProps<"/dashboard/my-schedule">) {
  const session = await requireRole(["employee"]);
  const locale = await getLocale();
  const t = makeT(locale);

  const searchParams = await props.searchParams;
  const requestedMonday = typeof searchParams.w === "string" ? searchParams.w : null;
  const week = weekOf(requestedMonday ? parseDateKey(requestedMonday) : todayUTC());
  const [monday, , , , friday] = week;

  const [absences, shiftBlocks, homeOfficeDays] = await Promise.all([
    prisma.absenceEntry.findMany({
      where: { employeeId: session.userId, date: { gte: monday, lte: friday } },
    }),
    prisma.shiftBlock.findMany({
      where: { employeeId: session.userId, draft: false, date: { gte: monday, lte: friday } },
      orderBy: { startMinute: "asc" },
    }),
    prisma.homeOfficeDay.findMany({ where: { employeeId: session.userId, date: { gte: monday, lte: friday } } }),
  ]);
  const homeOffice = new Set(homeOfficeDays.map((h) => toDateKey(h.date)));
  const today = zurichDateKey();

  const absencesByDate = new Map<string, { halfDay: HalfDay; type: AbsenceType }[]>();
  for (const a of absences) {
    const key = toDateKey(a.date);
    const list = absencesByDate.get(key) ?? [];
    list.push({ halfDay: a.halfDay as HalfDay, type: a.type as AbsenceType });
    absencesByDate.set(key, list);
  }

  const blocksByDate = new Map<
    string,
    { id: string; startMinute: number; endMinute: number; dutyType: DutyType; location: Location | null; note: string | null }[]
  >();
  for (const b of shiftBlocks) {
    const key = toDateKey(b.date);
    const list = blocksByDate.get(key) ?? [];
    list.push({
      id: b.id,
      startMinute: b.startMinute,
      endMinute: b.endMinute,
      dutyType: b.dutyType as DutyType,
      location: b.location as Location | null,
      note: b.note,
    });
    blocksByDate.set(key, list);
  }

  const prevWeek = toDateKey(addDays(monday, -7));
  const nextWeek = toDateKey(addDays(monday, 7));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t("Mein Plan")}</h1>
          <p className="page-subtitle">{t("Ihre Woche. Ihre Pausen tragen Sie selbst ein (Vormittag 15 Min., Mittag, Nachmittag 15 Min.) – alles Weitere planen die Manager.")}</p>
        </div>
        <nav className="flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white p-1 text-sm shadow-sm">
          <Link href={`/dashboard/my-schedule?w=${prevWeek}`} className="btn-ghost btn-sm" aria-label={t("Vorherige Woche")}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-36 px-2 text-center font-medium text-zinc-900">
            {dayLabel(monday, locale)} – {dayLabel(friday, locale)}
          </span>
          <Link href={`/dashboard/my-schedule?w=${nextWeek}`} className="btn-ghost btn-sm" aria-label={t("Nächste Woche")}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </nav>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {week.map((day) => {
          const key = toDateKey(day);
          return (
            <DayCard
              key={key}
              dateKey={key}
              label={dayLabel(day, locale)}
              absences={absencesByDate.get(key) ?? []}
              blocks={blocksByDate.get(key) ?? []}
              employeeId={session.userId}
              homeOffice={homeOffice.has(key)}
              // HO / BO can be set from today on, not on a holiday
              canSetWorkMode={key >= today && !holidayOn(key)}
            />
          );
        })}
      </div>
    </div>
  );
}
