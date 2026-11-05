/**
 * Imports the daily call / CRM numbers from the Ferien-plan into DailyCallStat.
 *
 * Run with: npx tsx scripts/import-call-stats.ts [--dry-run]
 *
 * Each week sheet carries two blocks of numbers per weekday:
 *   - "2025" rows  = last year's figures for the equivalent week
 *   - "2026" rows  = this year's actuals (filled in up to the current week)
 * Last year's number sits under the 2026 date, so it is stored on the date
 * 364 days earlier — the same weekday of the same week-of-year. That is an
 * assumption (the sheet never says which 2025 date it means); it is the
 * standard alignment and it lands on the right weekday.
 *
 * The first sheet ("1. - 2. Januar", a holiday-shortened week) is skipped:
 * both of its days carry identical numbers, which looks like one combined
 * figure copied into two cells rather than two real days.
 */
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SOURCE_PATH = resolve(__dirname, "../data/source/Ferien- und Weiterbildungsplan 2026.xlsx");
const DAY_LABELS = ["Mo.", "Di.", "Mi.", "Do.", "Fr."];
const SKIP_SHEETS = new Set(["Jahresrückblick CRM-Komm.", "Abgeschlossene Tasks 2025_2026"]);
const GERMAN_MONTHS: Record<string, number> = {
  Januar: 1, Februar: 2, März: 3, April: 4, Mai: 5, Juni: 6,
  Juli: 7, August: 8, September: 9, Oktober: 10, November: 11, Dezember: 12,
};

// label prefix -> which field of which year it fills
const ROWS: { prefix: string; year: "this" | "last"; field: "callsReceived" | "callsAnswered" | "crmCompleted" }[] = [
  { prefix: "Anzahl Anrufe 2025", year: "last", field: "callsReceived" },
  { prefix: "effektiv angenommene Anrufe 2025", year: "last", field: "callsAnswered" },
  { prefix: "abgeschlossene CRM-Kommunikationen 2025", year: "last", field: "crmCompleted" },
  { prefix: "Anzahl Anrufe 2026", year: "this", field: "callsReceived" },
  { prefix: "angenommene Anrufe:", year: "this", field: "callsAnswered" },
  { prefix: "abgeschlossene CRM-Kommunikationen 2026", year: "this", field: "crmCompleted" },
];

type Stat = { callsReceived?: number; callsAnswered?: number; crmCompleted?: number };

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in value) {
    return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "").trim();
  return String(value).trim();
}

function numeric(value: ExcelJS.CellValue): number | null {
  const raw = typeof value === "object" && value !== null && "result" in value ? (value as { result: unknown }).result : value;
  return typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : null;
}

function parseStartFromSheetName(name: string): { day: number; month: number } | null {
  const parts = name.trim().split(" - ");
  if (parts.length !== 2) return null;
  const right = parts[1].match(/^(\d+)\.\s*(\p{L}+)/u);
  const left = parts[0].match(/^(\d+)\.\s*(\p{L}+)?/u);
  if (!right || !left) return null;
  const month = left[2] ? GERMAN_MONTHS[left[2]] : GERMAN_MONTHS[right[2]];
  const day = Number(left[1]);
  return day && month ? { day, month } : null;
}

// Each day = 2 columns (AM, PM); some sheets repeat the label in both, so jump by 2 after a hit.
function dayColumns(row: ExcelJS.Row): number[] {
  const cols: number[] = [];
  for (let c = 2; c <= 30; ) {
    if (DAY_LABELS.includes(cellText(row.getCell(c).value))) {
      cols.push(c);
      c += 2;
    } else c += 1;
  }
  return cols;
}

const key = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SOURCE_PATH);

  const stats = new Map<string, Stat>();
  const put = (date: Date, field: keyof Stat, value: number) => {
    const k = key(date);
    stats.set(k, { ...stats.get(k), [field]: value });
  };

  for (const ws of workbook.worksheets) {
    if (SKIP_SHEETS.has(ws.name)) continue;
    if (ws.name.trim() === "1. - 2. Januar") continue;

    const start = parseStartFromSheetName(ws.name);
    const year = Number(cellText(ws.getCell("A1").value));
    if (!start || !year) {
      console.warn(`Skipping "${ws.name}" — could not read its date.`);
      continue;
    }
    const weekStart = new Date(Date.UTC(year, start.month - 1, start.day));
    const cols = dayColumns(ws.getRow(3));

    for (let r = 30; r <= 60; r++) {
      const label = cellText(ws.getRow(r).getCell(1).value);
      const spec = ROWS.find((s) => label.startsWith(s.prefix));
      if (!spec) continue;
      cols.forEach((col, i) => {
        const value = numeric(ws.getRow(r).getCell(col).value);
        if (value === null) return;
        const date = new Date(weekStart);
        date.setUTCDate(date.getUTCDate() + i - (spec.year === "last" ? 364 : 0));
        put(date, spec.field, value);
      });
    }
  }

  const dates = [...stats.keys()].sort();
  const withCalls = dates.filter((d) => stats.get(d)!.callsReceived != null);
  console.log(`Parsed ${dates.length} days (${withCalls.length} with call numbers): ${dates[0]} … ${dates[dates.length - 1]}`);

  const bad = withCalls.filter((d) => {
    const s = stats.get(d)!;
    return s.callsAnswered != null && s.callsAnswered > s.callsReceived!;
  });
  if (bad.length) console.warn(`${bad.length} day(s) where answered > received (kept as-is): ${bad.slice(0, 5).join(", ")}…`);

  if (dryRun) {
    console.log("--dry-run: nothing written.");
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  await prisma.$transaction(
    dates.map((d) => {
      const data = stats.get(d)!;
      const date = new Date(`${d}T00:00:00.000Z`);
      return prisma.dailyCallStat.upsert({ where: { date }, update: { ...data, source: "import" }, create: { date, ...data, source: "import" } });
    })
  );
  console.log(`Upserted ${dates.length} DailyCallStat rows.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
