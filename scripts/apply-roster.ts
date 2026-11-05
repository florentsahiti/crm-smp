/**
 * Reads data/roster.csv and upserts each row into the Employee table.
 * Run with: npx tsx scripts/apply-roster.ts
 *
 * This replaces/extends whatever is currently in the Employee table with
 * the CSV's contents — safe to re-run after editing the CSV further.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ROLES, SKILL_CODES } from "../src/lib/constants";

const CSV_PATH = resolve(__dirname, "../data/roster.csv");
const DEV_PASSWORD = "password123"; // TODO(deploy): force real per-person passwords before go-live.

type Row = {
  username: string;
  name: string;
  shortCode: string;
  role: string;
  skills: string;
  groupNumber: string;
};

function validateRow(row: Row, lineNumber: number): string[] {
  const errors: string[] = [];
  if (!row.username) errors.push("username is empty");
  if (!row.name) errors.push("name is empty");
  if (!ROLES.includes(row.role as (typeof ROLES)[number])) {
    errors.push(`role "${row.role}" must be one of: ${ROLES.join(", ")}`);
  }
  const skills = row.skills
    ? row.skills.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  for (const skill of skills) {
    if (!SKILL_CODES.includes(skill as (typeof SKILL_CODES)[number])) {
      errors.push(`skill "${skill}" must be one of: ${SKILL_CODES.join(", ")}`);
    }
  }
  if (row.groupNumber && Number.isNaN(Number(row.groupNumber))) {
    errors.push(`groupNumber "${row.groupNumber}" is not a number`);
  }
  if (errors.length > 0) {
    console.error(`Row ${lineNumber} (${row.name || row.username}): ${errors.join("; ")}`);
  }
  return errors;
}

async function main() {
  const csvContent = readFileSync(CSV_PATH, "utf-8");
  const rows: Row[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const allErrors: string[] = [];
  rows.forEach((row, i) => {
    allErrors.push(...validateRow(row, i + 2)); // +2: header row + 1-index
  });

  if (allErrors.length > 0) {
    console.error(
      `\n${allErrors.length} problem(s) found in data/roster.csv — fix them and re-run. No changes were made.`
    );
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  // shortCode is unique but low-stakes — auto-fill a placeholder for blank
  // rows instead of blocking the whole import on it.
  const usedCodes = new Set(
    rows.map((r) => r.shortCode).filter(Boolean).map((c) => c.toUpperCase())
  );
  const placeholders: string[] = [];
  for (const row of rows) {
    if (row.shortCode) continue;
    const base = row.username.slice(0, 3).toUpperCase().padEnd(3, "X");
    let candidate = base;
    let suffix = 1;
    while (usedCodes.has(candidate)) {
      candidate = `${base.slice(0, 2)}${suffix}`;
      suffix += 1;
    }
    usedCodes.add(candidate);
    row.shortCode = candidate;
    placeholders.push(`${row.name} -> ${candidate}`);
  }
  if (placeholders.length > 0) {
    console.log(`Auto-filled placeholder short codes (edit data/roster.csv to set real ones):\n  ${placeholders.join("\n  ")}`);
  }

  for (const row of rows) {
    await prisma.employee.upsert({
      where: { username: row.username },
      update: {
        name: row.name,
        shortCode: row.shortCode,
        role: row.role,
        skills: row.skills,
        groupNumber: row.groupNumber ? Number(row.groupNumber) : null,
      },
      create: {
        username: row.username,
        passwordHash,
        name: row.name,
        shortCode: row.shortCode,
        role: row.role,
        skills: row.skills,
        groupNumber: row.groupNumber ? Number(row.groupNumber) : null,
      },
    });
  }

  console.log(`Applied ${rows.length} rows from data/roster.csv. Password for any newly-created account: "${DEV_PASSWORD}"`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
