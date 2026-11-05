/**
 * One-time copy of the local SQLite database (dev.db) into the PostgreSQL
 * database in DATABASE_URL — used to move the real roster, absences and call
 * statistics onto the deployed (Vercel) database without committing HR data.
 *
 * Usage (DATABASE_URL must point at the Postgres database):
 *   npx tsx scripts/copy-sqlite-to-postgres.ts
 *
 * WARNING: empties the Postgres tables first, then copies every row (IDs kept).
 * Notifications are skipped — old ones were stored in English.
 */
import "dotenv/config";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { Client } from "pg";

const SQLITE_PATH = resolve(__dirname, "../dev.db");

// Parent tables first so foreign keys resolve.
const TABLES = ["Employee", "DailyCallStat", "AbsenceEntry", "ShiftBlock", "LeaveRequest", "SwapRequest"];
const DATE_COLUMNS = new Set(["date", "startDate", "endDate", "decidedAt", "createdAt", "updatedAt"]);
const BOOLEAN_COLUMNS = new Set(["active", "draft", "read"]);

function convert(column: string, value: unknown) {
  if (value === null) return null;
  if (DATE_COLUMNS.has(column)) return new Date(typeof value === "number" ? value : String(value));
  if (BOOLEAN_COLUMNS.has(column)) return Boolean(value);
  return value;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) {
    throw new Error("DATABASE_URL must be a postgres:// connection string.");
  }

  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pg = new Client({ connectionString: url });
  await pg.connect();

  try {
    await pg.query("BEGIN");
    await pg.query(`TRUNCATE ${[...TABLES, "Notification"].map((t) => `"${t}"`).join(", ")} CASCADE`);

    for (const table of TABLES) {
      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map((c) => convert(c, row[c]));
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        await pg.query(
          `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
          values
        );
      }
      console.log(`${table}: ${rows.length} rows`);
    }

    await pg.query("COMMIT");
    console.log("Done.");
  } catch (e) {
    await pg.query("ROLLBACK");
    throw e;
  } finally {
    await pg.end();
    sqlite.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
