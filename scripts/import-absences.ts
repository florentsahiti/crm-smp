/**
 * One-time import of the 2026 absence data from the original
 * "Ferien- und Weiterbildungsplan" Excel file into AbsenceEntry rows.
 *
 * Run with: npx tsx scripts/import-absences.ts [--reset] [--dry-run]
 *   --dry-run  parse and report, but write nothing to the database
 *   --reset    delete any previously-imported rows first (safe to re-run)
 *
 * Requires the real roster to already be applied (see scripts/apply-roster.ts)
 * — employee names are matched exactly against the Employee table.
 */
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { AbsenceType } from "../src/lib/constants";

const SOURCE_PATH = resolve(__dirname, "../data/source/Ferien- und Weiterbildungsplan 2026.xlsx");
const IMPORT_NOTE = "Imported from Ferien-plan 2026";
const DAY_LABELS = ["Mo.", "Di.", "Mi.", "Do.", "Fr."];
const NON_EMPLOYEE_PREFIXES = [
  "Forecast", "Anzahl", "erwartete", "abgeschlossene", "angenommene",
  "CRM-Kommunikationen", "effektiv",
];
const SKIP_SHEETS = new Set(["Jahresrückblick CRM-Komm.", "Abgeschlossene Tasks 2025_2026"]);

const GERMAN_MONTHS: Record<string, number> = {
  Januar: 1, Februar: 2, März: 3, April: 4, Mai: 5, Juni: 6,
  Juli: 7, August: 8, September: 9, Oktober: 10, November: 11, Dezember: 12,
};

// Absence codes actually found in the source sheet -> our vocabulary.
// "T" (Ticketdienst) is a duty assignment, not an absence, and is skipped
// on purpose — it belongs to Phase 3's shift planner, not here.
const CODE_MAP: Record<string, { type: AbsenceType; status: "approved" | "pending" }> = {
  "F": { type: "vacation", status: "approved" },
  "(F)": { type: "vacation", status: "pending" },
  "KR": { type: "sick", status: "approved" },
  "FT": { type: "holiday", status: "approved" },
  "P": { type: "reduced_workload", status: "approved" },
  "W": { type: "training", status: "approved" },
  "S": { type: "training", status: "approved" },
  "UN": { type: "accident", status: "approved" },
  "M": { type: "military", status: "approved" },
};
const KNOWN_NON_ABSENCE_CODES = new Set(["T"]);

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in value) {
    return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  return String(value).trim();
}

/** Parses a tab name like "5. - 9. Januar" or "30. März - 3. April" -> the Monday's {day, month}. */
function parseMondayFromSheetName(sheetName: string): { day: number; month: number } | null {
  const trimmed = sheetName.trim();
  const parts = trimmed.split(" - ");
  if (parts.length !== 2) return null;

  const rightMatch = parts[1].match(/^(\d+)\.\s*(\p{L}+)/u);
  if (!rightMatch) return null;
  const rightMonth = GERMAN_MONTHS[rightMatch[2]];

  const leftMatch = parts[0].match(/^(\d+)\.\s*(\p{L}+)?/u);
  if (!leftMatch) return null;
  const day = Number(leftMatch[1]);
  const month = leftMatch[2] ? GERMAN_MONTHS[leftMatch[2]] : rightMonth;

  if (!day || !month) return null;
  return { day, month };
}

function findDayColumns(row: ExcelJS.Row): number[] {
  // Each day occupies exactly 2 columns (AM, PM). Most sheets only put the
  // label in the first (merged) cell, but a couple of sheets ("30. November
  // - 4. Dezember", "28. Dezember - 1. Januar") repeat the label in both —
  // so once a day label is found, always advance by 2 regardless of what's
  // in the second column, rather than re-testing it as its own day.
  const columns: number[] = [];
  let col = 2;
  while (col <= 30) {
    const value = cellText(row.getCell(col).value);
    if (DAY_LABELS.includes(value)) {
      columns.push(col);
      col += 2;
    } else {
      col += 1;
    }
  }
  return columns;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const reset = process.argv.includes("--reset");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const existingImported = await prisma.absenceEntry.count({ where: { note: IMPORT_NOTE } });
  if (existingImported > 0 && !reset && !dryRun) {
    console.error(
      `${existingImported} rows from a previous import already exist. Re-run with --reset to replace them, or --dry-run to just preview.`
    );
    process.exit(1);
  }

  const employees = await prisma.employee.findMany();
  if (employees.length === 0) {
    console.error("No employees in the database. Run scripts/apply-roster.ts first.");
    process.exit(1);
  }
  const employeeByName = new Map(employees.map((e) => [e.name.trim(), e]));

  const importer = employees.find((e) => e.role === "manager");
  if (!importer) {
    console.error("No manager account found to attribute the import to. Run scripts/apply-roster.ts first.");
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SOURCE_PATH);

  const unmatchedNames = new Set<string>();
  const unmappedCodes = new Map<string, number>();
  const weekdaySanityIssues: string[] = [];
  let processedSheetCount = 0;
  const rowsToInsert: {
    employeeId: string;
    date: Date;
    halfDay: "AM" | "PM";
    type: AbsenceType;
    status: "approved" | "pending";
  }[] = [];

  for (const worksheet of workbook.worksheets) {
    if (SKIP_SHEETS.has(worksheet.name)) continue;

    const monday = parseMondayFromSheetName(worksheet.name);
    if (!monday) {
      console.warn(`Could not parse a date from sheet name "${worksheet.name}" — skipped.`);
      continue;
    }

    const yearCell = cellText(worksheet.getCell("A1").value);
    const year = Number(yearCell);
    if (!year) {
      console.warn(`Sheet "${worksheet.name}": cell A1 isn't a year ("${yearCell}") — skipped.`);
      continue;
    }

    const weekStartDate = new Date(Date.UTC(year, monday.month - 1, monday.day));
    processedSheetCount += 1;

    const headerRow = worksheet.getRow(3);
    const dayColumns = findDayColumns(headerRow); // one column per day = VM; NM is dayColumn + 1

    // Sanity check: the left-hand date isn't always a Monday (the first and
    // last sheets of the year are short weeks, e.g. "1. - 2. Januar" is
    // Thu-Fri) — so validate against whatever the first day column's own
    // label says, not a hardcoded Monday assumption.
    if (dayColumns.length > 0) {
      const firstLabel = cellText(headerRow.getCell(dayColumns[0]).value);
      const expectedWeekday = DAY_LABELS.indexOf(firstLabel) + 1; // Mo.=1 ... Fr.=5
      if (expectedWeekday > 0 && weekStartDate.getUTCDay() !== expectedWeekday) {
        weekdaySanityIssues.push(
          `"${worksheet.name}" -> ${weekStartDate.toISOString().slice(0, 10)} should be "${firstLabel}" but is weekday ${weekStartDate.getUTCDay()}`
        );
      }
    }

    for (let rowNumber = 5; rowNumber <= 40; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const name = cellText(row.getCell(1).value);
      if (!name) continue;
      if (NON_EMPLOYEE_PREFIXES.some((prefix) => name.startsWith(prefix))) break;

      const employee = employeeByName.get(name);
      if (!employee) {
        unmatchedNames.add(name);
        continue;
      }

      dayColumns.forEach((vmCol, dayIndex) => {
        const date = new Date(weekStartDate);
        date.setUTCDate(date.getUTCDate() + dayIndex);

        (["AM", "PM"] as const).forEach((half, halfIndex) => {
          const raw = cellText(row.getCell(vmCol + halfIndex).value);
          if (!raw) return;
          if (KNOWN_NON_ABSENCE_CODES.has(raw)) return;

          const mapped = CODE_MAP[raw];
          if (!mapped) {
            unmappedCodes.set(raw, (unmappedCodes.get(raw) ?? 0) + 1);
            return;
          }

          rowsToInsert.push({
            employeeId: employee.id,
            date,
            halfDay: half,
            type: mapped.type,
            status: mapped.status,
          });
        });
      });
    }
  }

  console.log(`Parsed ${rowsToInsert.length} absence half-days across ${processedSheetCount} week sheets.`);
  if (unmatchedNames.size > 0) {
    console.warn(`\n${unmatchedNames.size} name(s) in the Excel didn't match any Employee in the database (skipped):`);
    console.warn("  " + [...unmatchedNames].join("\n  "));
  }
  if (unmappedCodes.size > 0) {
    console.warn(`\nUnrecognized codes found (skipped) — review if these matter:`);
    for (const [code, count] of unmappedCodes) console.warn(`  "${code}": ${count} occurrence(s)`);
  }
  if (weekdaySanityIssues.length > 0) {
    console.warn(`\nDate sanity check failed for some sheets:`);
    console.warn("  " + weekdaySanityIssues.join("\n  "));
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing written to the database.");
    await prisma.$disconnect();
    return;
  }

  if (reset) {
    const { count } = await prisma.absenceEntry.deleteMany({ where: { note: IMPORT_NOTE } });
    console.log(`\nDeleted ${count} previously-imported row(s).`);
  }

  // Dedupe on (employeeId, date, halfDay) — the source sheet shouldn't have
  // conflicts, but guard against it rather than letting the unique
  // constraint abort the whole batch.
  const seen = new Set<string>();
  const deduped = rowsToInsert.filter((r) => {
    const key = `${r.employeeId}|${r.date.toISOString()}|${r.halfDay}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const { count } = await prisma.absenceEntry.createMany({
    data: deduped.map((r) => ({
      employeeId: r.employeeId,
      date: r.date,
      halfDay: r.halfDay,
      type: r.type,
      status: r.status,
      note: IMPORT_NOTE,
      createdById: importer.id,
    })),
  });

  console.log(`\nInserted ${count} AbsenceEntry rows (attributed to ${importer.name}).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
