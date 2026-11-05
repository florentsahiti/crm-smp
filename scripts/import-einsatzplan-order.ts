/**
 * Takes the employee order, groups and language skills from the old Einsatzplan template
 * (data/source/Vorlage_Einsatzplan KSL.xlsx, gitignored — real HR data) and stores them on the
 * Employee rows, matched by short code (Kürzel).
 *
 * In the template the people are listed group by group (Gruppe 1 = French, 2 = English,
 * 3 = Italian), each group closed by an "Anwesend Gruppe N" row. Skill columns hold E / F / I.
 * Everyone is assumed to speak German (DE) as well.
 *
 * Usage:
 *   npx tsx scripts/import-einsatzplan-order.ts          # apply
 *   npx tsx scripts/import-einsatzplan-order.ts --dry    # only show what would change
 */
import "dotenv/config";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SOURCE_PATH = resolve(__dirname, "../data/source/Vorlage_Einsatzplan KSL.xlsx");
const SKILL_LETTERS: Record<string, string> = { E: "EN", F: "FR", I: "IT" };
const SKILL_COLUMNS = [3, 4, 5]; // C, D, E
const FIRST_ROW = 5;

type Row = { shortCode: string; firstName: string; group: number; position: number; skills: string[] };

function text(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in value) return value.richText.map((t) => t.text).join("").trim();
  if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
  return String(value).trim();
}

async function readTemplate(): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SOURCE_PATH);
  const ws = wb.worksheets[0];
  const rows: Row[] = [];
  let group = 1;
  for (let r = FIRST_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const a = text(row.getCell(1).value);
    if (a.startsWith("Anwesend gesamt")) break;
    if (a.startsWith("Anwesend Gruppe")) {
      group += 1;
      continue;
    }
    if (!/^[A-Z]{2,5}$/.test(a)) continue;
    const skills = ["DE", ...SKILL_COLUMNS.map((c) => SKILL_LETTERS[text(row.getCell(c).value).toUpperCase()]).filter(Boolean)];
    rows.push({ shortCode: a, firstName: text(row.getCell(2).value), group, position: rows.length + 1, skills });
  }
  return rows;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const rows = await readTemplate();
  console.log(`Template: ${rows.length} people in ${new Set(rows.map((r) => r.group)).size} groups.`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const employees = await prisma.employee.findMany();
    const missing: string[] = [];
    for (const r of rows) {
      const employee = employees.find((e) => e.shortCode === r.shortCode);
      if (!employee) {
        missing.push(`${r.shortCode} (${r.firstName})`);
        continue;
      }
      const data = { sortOrder: r.position * 10, groupNumber: r.group, skills: r.skills.join(",") };
      console.log(`${String(r.position).padStart(2)}. ${r.shortCode} ${employee.name} → Gruppe ${r.group}, ${data.skills}`);
      if (!dry) await prisma.employee.update({ where: { id: employee.id }, data });
    }
    // People not in the template (e.g. the managers) go after everyone who is.
    const listed = new Set(rows.map((r) => r.shortCode));
    const rest = employees.filter((e) => !listed.has(e.shortCode)).sort((a, b) => a.name.localeCompare(b.name));
    for (const [i, e] of rest.entries()) {
      if (!dry) await prisma.employee.update({ where: { id: e.id }, data: { sortOrder: 1000 + i * 10 } });
    }
    if (missing.length) console.log(`\nNot in the database (add them on the Team page first): ${missing.join(", ")}`);
    if (rest.length) console.log(`Not in the template, placed at the end: ${rest.map((e) => e.name).join(", ")}`);
    console.log(dry ? "\nDry run — nothing changed." : "\nDone.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
