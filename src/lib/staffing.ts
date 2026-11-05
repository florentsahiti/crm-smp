import "server-only";
import { prisma } from "@/lib/prisma";
import { keyOf, type CallHistory } from "@/lib/forecast";
import { holidayOn } from "@/lib/holidays";
import { BACKOFFICE } from "@/lib/constants";

/** People who take calls. Managers don't, so they are left out of capacity and auto-scheduling. */
export async function loadAgents() {
  const rows = await prisma.employee.findMany({
    where: { active: true, role: { not: "manager" } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    skills: e.skills ? e.skills.split(",").filter(Boolean) : [],
  }));
}

export async function loadCallHistory(): Promise<CallHistory> {
  const rows = await prisma.dailyCallStat.findMany({ where: { callsReceived: { not: null } } });
  return new Map(rows.map((r) => [keyOf(r.date), r.callsReceived as number]));
}

/** present = not absent; ticket/backoffice = present but not on the phone that half-day */
export type DayStaffing = {
  presentAM: number;
  presentPM: number;
  ticketAM: number;
  ticketPM: number;
  backofficeAM: number;
  backofficePM: number;
};

/**
 * Who is available on each day, per half-day (AM before noon, PM after), and how many of
 * them are tied up on ticket duty or on a backoffice day (e-mail only). Draft suggestions are
 * only counted when asked for.
 */
export async function staffingFor(dates: Date[], opts: { includeDrafts?: boolean } = {}): Promise<Map<string, DayStaffing>> {
  const agents = await loadAgents();
  const ids = new Set(agents.map((a) => a.id));
  const [absences, tickets] = await Promise.all([
    prisma.absenceEntry.findMany({ where: { date: { in: dates } } }),
    prisma.shiftBlock.findMany({
      where: { date: { in: dates }, dutyType: { in: ["ticket_duty", BACKOFFICE] }, ...(opts.includeDrafts ? {} : { draft: false }) },
    }),
  ]);

  const result = new Map<string, DayStaffing>();
  for (const date of dates) {
    const k = keyOf(date);
    // public holiday: the office is closed, nobody takes calls
    if (holidayOn(k)) {
      result.set(k, { presentAM: 0, presentPM: 0, ticketAM: 0, ticketPM: 0, backofficeAM: 0, backofficePM: 0 });
      continue;
    }
    const absentAM = new Set<string>();
    const absentPM = new Set<string>();
    for (const a of absences.filter((x) => keyOf(x.date) === k && ids.has(x.employeeId))) {
      if (a.halfDay === "AM" || a.halfDay === "FULL") absentAM.add(a.employeeId);
      if (a.halfDay === "PM" || a.halfDay === "FULL") absentPM.add(a.employeeId);
    }
    const dayBlocks = tickets.filter((t) => keyOf(t.date) === k && ids.has(t.employeeId));
    const backoffice = new Set(dayBlocks.filter((t) => t.dutyType === BACKOFFICE).map((t) => t.employeeId));
    const count = (dutyType: string, from: number, to: number, absent: Set<string>) =>
      new Set(
        dayBlocks
          .filter((t) => t.dutyType === dutyType && t.startMinute < to && t.endMinute > from && !absent.has(t.employeeId))
          // someone on a backoffice day is counted there, not again as ticket duty
          .filter((t) => dutyType === BACKOFFICE || !backoffice.has(t.employeeId))
          .map((t) => t.employeeId)
      ).size;

    result.set(k, {
      presentAM: agents.length - absentAM.size,
      presentPM: agents.length - absentPM.size,
      ticketAM: count("ticket_duty", 0, 12 * 60, absentAM),
      ticketPM: count("ticket_duty", 12 * 60, 24 * 60, absentPM),
      backofficeAM: count(BACKOFFICE, 0, 12 * 60, absentAM),
      backofficePM: count(BACKOFFICE, 12 * 60, 24 * 60, absentPM),
    });
  }
  return result;
}

/** People on the phone per half-day: present, minus ticket duty and backoffice. */
export function onPhone(s: DayStaffing): { am: number; pm: number } {
  return {
    am: Math.max(0, s.presentAM - s.ticketAM - s.backofficeAM),
    pm: Math.max(0, s.presentPM - s.ticketPM - s.backofficePM),
  };
}

/** Phone-taking capacity for the day: people on the phone × calls per half-day. */
export function dayCapacity(s: DayStaffing, callsPerPersonHalfDay: number): number {
  const p = onPhone(s);
  return (p.am + p.pm) * callsPerPersonHalfDay;
}
