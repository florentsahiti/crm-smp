import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { HOURS, splitDaily } from "../src/lib/capacity";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Placeholder test accounts — not the real roster. Same password for all,
// for local testing and the client demo only. Replace with real employees before go-live.
const DEV_PASSWORD = "password123";

// sortOrder, group and languages follow the old Einsatzplan (grouped by language: 1 French,
// 2 English, 3 Italian); the managers come after the agents (managers are not counted as call-takers).
const employees = [
  { username: "arlette", name: "Arlette", shortCode: "ARZ", role: "employee", skills: "DE,FR,IT", groupNumber: 1, sortOrder: 10 },
  { username: "estelle", name: "Estelle", shortCode: "WEE", role: "employee", skills: "DE,FR", groupNumber: 1, sortOrder: 20 },
  { username: "leonie", name: "Leonie", shortCode: "DRL", role: "employee", skills: "DE,EN", groupNumber: 2, sortOrder: 80 },
  { username: "cristina", name: "Cristina", shortCode: "LUC", role: "employee", skills: "DE,EN", groupNumber: 2, sortOrder: 90 },
  { username: "tamara", name: "Tamara", shortCode: "LUT", role: "employee", skills: "DE,IT", groupNumber: 3, sortOrder: 160 },
  { username: "flavio", name: "Flavio", shortCode: "FLC", role: "employee", skills: "DE,EN,IT", groupNumber: 3, sortOrder: 170 },
  { username: "samanta", name: "Samanta", shortCode: "SOA", role: "employee", skills: "DE,IT", groupNumber: 3, sortOrder: 210 },
  { username: "leadone", name: "Thomas", shortCode: "TL1", role: "manager", skills: "DE,FR,EN", groupNumber: 1, sortOrder: 1000 },
  { username: "leadtwo", name: "Sandra", shortCode: "TL2", role: "manager", skills: "DE,EN,IT", groupNumber: 2, sortOrder: 1010 },
  { username: "manager", name: "Monika", shortCode: "MGR", role: "manager", skills: "DE,EN,FR", groupNumber: null, sortOrder: 1020 },
] as const;

type Username = (typeof employees)[number]["username"];

const DAY_MS = 86_400_000;
const todayUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const fmt = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join(".");
const hm = (h: number, m = 0) => h * 60 + m;

/** Small deterministic PRNG so the synthetic call numbers are the same on every deploy. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Synthetic daily call volumes (NOT real data) from 1 Jan 2025 up to yesterday, sized for the
 * 9 demo call-takers (~200 calls/day once breaks and appointments are taken out), with Mondays and
 * the autumn premium season busier.
 */
async function seedCallStats() {
  if ((await prisma.dailyCallStat.count()) > 0) return;
  const weekdayBase = [0, 212, 192, 184, 180, 164, 0]; // Sun..Sat
  const season = [1.2, 1.08, 1.0, 0.98, 0.97, 0.95, 0.85, 0.82, 1.0, 1.05, 1.18, 1.1]; // Jan..Dec
  const random = rng(42);
  const rows = [];
  for (let d = new Date(Date.UTC(2025, 0, 1)); d < todayUTC(); d = addDays(d, 1)) {
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const trend = d.getUTCFullYear() === 2026 ? 1.04 : 1;
    const noise = 0.94 + random() * 0.12;
    const received = Math.round(weekdayBase[wd] * season[d.getUTCMonth()] * trend * noise);
    rows.push({
      date: d,
      callsReceived: received,
      callsAnswered: Math.round(received * (0.86 + random() * 0.1)),
      crmCompleted: Math.round(received * (0.12 + random() * 0.05)),
      source: "demo",
    });
  }
  await prisma.dailyCallStat.createMany({ data: rows });
  console.log(`Seeded ${rows.length} days of synthetic call statistics.`);
}

/**
 * A believable current week: absences, a planned schedule (ticket duty, lunch breaks, a meeting,
 * coaching) and two open break-swap offers.
 * Next Monday is left unplanned so the "Plan vorschlagen" button can be shown live.
 * Runs only when there are no shift blocks yet, or when DEMO_RESET=1 (wipes the demo activity first).
 */
async function seedDemoActivity(ids: Record<Username, string>) {
  if (process.env.DEMO_RESET === "1") {
    await prisma.$transaction([
      prisma.notification.deleteMany(),
      prisma.taskCount.deleteMany(),
      prisma.forecastDay.deleteMany(),
      prisma.swapRequest.deleteMany(),
      prisma.shiftBlock.deleteMany(),
      prisma.leaveRequest.deleteMany(),
      prisma.absenceEntry.deleteMany(),
    ]);
    console.log("DEMO_RESET=1: cleared absences, shifts, old leave requests, swaps and notifications.");
  } else if ((await prisma.shiftBlock.count()) > 0) {
    return;
  }

  const today = todayUTC();
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const monday = addDays(today, -daysSinceMonday);
  const week = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  const [mon, tue, wed, thu, fri] = week;
  const lead1 = ids.leadone;

  // Absences: Estelle on approved vacation Thu–Fri, Tamara in training Tuesday morning.
  const absences: { who: Username; date: Date; halfDay: "AM" | "PM"; type: string; note?: string }[] = [
    ...[thu, fri].flatMap((date) =>
      (["AM", "PM"] as const).map((halfDay) => ({ who: "estelle" as const, date, halfDay, type: "vacation", note: "Genehmigter Abwesenheitsantrag" }))
    ),
    { who: "tamara", date: tue, halfDay: "AM", type: "training", note: "Produktschulung Spitalzusatz" },
  ];
  await prisma.absenceEntry.createMany({
    data: absences.map((a) => ({
      employeeId: ids[a.who],
      date: a.date,
      halfDay: a.halfDay,
      type: a.type,
      status: "approved",
      note: a.note ?? null,
      createdById: lead1,
    })),
  });
  const isAbsent = (who: Username, date: Date) => absences.some((a) => a.who === who && a.date.getTime() === date.getTime());

  // Ticket duty rotation (AM 08:00–12:00, PM 13:00–17:00) and lunch breaks for everyone else.
  const agents: Username[] = ["arlette", "estelle", "leonie", "cristina", "tamara", "flavio", "samanta", "leadone", "leadtwo"];
  const ticketPlan: Record<number, [Username, Username]> = {
    0: ["arlette", "flavio"],
    1: ["leonie", "samanta"],
    2: ["cristina", "arlette"],
    3: ["tamara", "leonie"],
    4: ["samanta", "flavio"],
  };
  type Block = { who: Username; date: Date; start: number; end: number; dutyType: string; location?: "HO" | "O" };
  const blocks: Block[] = [];

  // Fixed appointments (locked): team meeting, BILA, training, coaching, case review.
  for (const who of ["leadone", "arlette", "estelle"] as Username[]) {
    blocks.push({ who, date: tue, start: hm(9), end: hm(10), dutyType: "meeting", location: "O" });
  }
  blocks.push({ who: "leadone", date: mon, start: hm(15), end: hm(16, 30), dutyType: "case_review" });
  for (const who of ["leadtwo", "leonie"] as Username[]) {
    blocks.push({ who, date: wed, start: hm(10), end: hm(10, 30), dutyType: "bila", location: "O" });
  }
  blocks.push({ who: "leadtwo", date: wed, start: hm(14), end: hm(15), dutyType: "coaching", location: "O" });
  blocks.push({ who: "flavio", date: wed, start: hm(14), end: hm(15), dutyType: "coaching", location: "O" });
  for (const who of ["tamara", "samanta"] as Username[]) {
    blocks.push({ who, date: thu, start: hm(14), end: hm(15, 30), dutyType: "training_lock", location: "O" });
  }
  const isFixedAt = (who: Username, date: Date, start: number, end: number) =>
    blocks.some(
      (b) => b.who === who && b.date.getTime() === date.getTime() && b.dutyType !== "ticket_duty" && b.start < end && start < b.end
    );

  week.forEach((date, i) => {
    const [am, pm] = ticketPlan[i];
    blocks.push({ who: am, date, start: hm(8), end: hm(12), dutyType: "ticket_duty", location: "HO" });
    blocks.push({ who: pm, date, start: hm(13), end: hm(17), dutyType: "ticket_duty", location: "O" });
    const present = agents.filter((who) => !isAbsent(who, date));
    // Lunch 12–13 or 13–14 with at most 4 employees per hour (team rule; managers don't count).
    // The PM ticket person and Friday's swap claimant eat early, the rest fill up to 4.
    const staff: Username[] = present.filter((who) => who !== "leadone" && who !== "leadtwo");
    const earlyLunch = new Set<Username>(staff.filter((who) => who === pm || (i === 4 && who === "cristina")));
    for (const who of staff) if (earlyLunch.size < 4) earlyLunch.add(who);
    present.forEach((who, n) => {
        // 15-minute breaks staggered so the phones stay covered, as in the old Einsatzplan.
        const amSlots = [hm(10), hm(10, 15), hm(10, 30), hm(10, 45), hm(9, 45), hm(11)];
        const pmSlots = [hm(15), hm(15, 15), hm(15, 30), hm(15, 45), hm(14, 45), hm(16)];
        const pick = (slots: number[]) =>
          [...slots.slice(n % 4), ...slots.slice(0, n % 4)].find((s) => !isFixedAt(who, date, s, s + 15));
        const amBreak = pick(amSlots);
        if (amBreak !== undefined) blocks.push({ who, date, start: amBreak, end: amBreak + 15, dutyType: "break_am" });
        const early = staff.includes(who) ? earlyLunch.has(who) : n % 2 === 0;
        blocks.push({ who, date, start: early ? hm(12) : hm(13), end: early ? hm(13) : hm(14), dutyType: "break" });
        const pmBreak = pick(pmSlots);
        if (pmBreak !== undefined) blocks.push({ who, date, start: pmBreak, end: pmBreak + 15, dutyType: "break_pm" });
      });
  });

  for (const b of blocks) {
    await prisma.shiftBlock.create({
      data: {
        employeeId: ids[b.who],
        date: b.date,
        startMinute: b.start,
        endMinute: b.end,
        dutyType: b.dutyType,
        location: b.location ?? null,
        createdById: b.dutyType.startsWith("break") ? ids[b.who] : lead1,
      },
    });
  }

  // Break swaps (employees only, applied at once when a colleague accepts): two open offers on Friday.
  const findBreak = (who: Username, date: Date, dutyType: string) =>
    prisma.shiftBlock.findFirstOrThrow({ where: { employeeId: ids[who], date, dutyType } });
  const samantaLunch = await findBreak("samanta", fri, "break");
  const leonieAfternoon = await findBreak("leonie", fri, "break_pm");
  await prisma.swapRequest.createMany({
    data: [
      { shiftBlockId: samantaLunch.id, fromEmployeeId: ids.samanta, status: "open", note: "Würde gerne früher in die Mittagspause" },
      { shiftBlockId: leonieAfternoon.id, fromEmployeeId: ids.leonie, status: "open", note: "Kann jemand tauschen? Danke!" },
    ],
  });

  // Completed tasks per hour for the days of this week that are over, so the plan-vs-actual
  // comparison has something to show (around the forecast, ±8%).
  const random = rng(7);
  const past = week.filter((d) => d < today);
  const stats = await prisma.dailyCallStat.findMany({ where: { date: { in: past } } });
  await prisma.taskCount.createMany({
    data: stats.flatMap((st) => {
      const crm = splitDaily(st.crmCompleted ?? 0);
      return splitDaily(st.callsReceived ?? 0).map((v, i) => ({
        date: st.date,
        hour: HOURS[i],
        done: Math.round(v * (0.92 + random() * 0.16)),
        crmDone: crm[i],
        updatedById: lead1,
      }));
    }),
  });

  console.log(`Seeded demo week of ${fmt(mon)}: ${absences.length} absences, ${blocks.length} shift blocks, 2 break swap offers.`);
}

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  const ids = {} as Record<Username, string>;

  for (const emp of employees) {
    const row = await prisma.employee.upsert({
      where: { username: emp.username },
      update: { name: emp.name, role: emp.role, skills: emp.skills, groupNumber: emp.groupNumber, sortOrder: emp.sortOrder },
      create: {
        username: emp.username,
        passwordHash,
        name: emp.name,
        shortCode: emp.shortCode,
        role: emp.role,
        skills: emp.skills,
        groupNumber: emp.groupNumber,
        sortOrder: emp.sortOrder,
      },
    });
    ids[emp.username] = row.id;
  }
  console.log(`Seeded ${employees.length} employees. Dev password for all: "${DEV_PASSWORD}"`);

  // A demo reset also regenerates the synthetic call history (it is demo data, never real numbers).
  if (process.env.DEMO_RESET === "1") await prisma.dailyCallStat.deleteMany({ where: { source: "demo" } });
  await seedCallStats();
  await seedDemoActivity(ids);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
