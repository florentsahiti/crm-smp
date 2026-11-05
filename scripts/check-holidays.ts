/**
 * Prints the Basel-Stadt public holidays for a year, with weekdays, to compare with the
 * official calendar:  npx tsx scripts/check-holidays.ts 2027
 */
import { holidaysFor } from "../src/lib/holidays";

const year = Number(process.argv[2]) || new Date().getUTCFullYear();
for (const h of holidaysFor(year)) {
  const weekday = new Date(`${h.dateKey}T00:00:00Z`).toLocaleDateString("de-CH", { weekday: "short", timeZone: "UTC" });
  console.log(`${weekday} ${h.dateKey}  ${h.name}`);
}
