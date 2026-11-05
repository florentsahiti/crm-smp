/**
 * Local development database: starts PGlite (PostgreSQL compiled to WebAssembly — nothing to
 * install) on port 55432 with its data in ./.pglite, runs the given command with DATABASE_URL
 * pointing at it, and shuts the database down when the command exits.
 *
 *   node scripts/local-db.mjs next dev
 *   node scripts/local-db.mjs "prisma migrate deploy && tsx prisma/seed.ts"
 *
 * Used by `npm run dev:local` and `npm run db:local:setup`.
 */
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PORT = 55432;
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`;

const command = process.argv.slice(2).join(" ");
if (!command) {
  console.error("Usage: node scripts/local-db.mjs <command>");
  process.exit(1);
}

const db = await PGlite.create(".pglite");
const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", maxConnections: 20 });
await server.start();
console.log(`Local database ready on port ${PORT} (data in ./.pglite)`);

const child = spawn(command, { shell: true, stdio: "inherit", env: { ...process.env, DATABASE_URL } });

let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  await server.stop();
  await db.close();
  process.exit(code ?? 0);
}
child.on("exit", (code) => stop(code));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
