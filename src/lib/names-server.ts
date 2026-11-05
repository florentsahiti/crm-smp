import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { displayNames } from "@/lib/names";

/** `displayNames` for everyone in the database, once per request (for single names: session, messages). */
export const loadDisplayName = cache(async () => {
  const people = await prisma.employee.findMany({ select: { name: true } });
  return displayNames(people.map((p) => p.name));
});
