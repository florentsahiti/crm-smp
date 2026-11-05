"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import { UserError, guard } from "@/lib/action-result";
import { tr } from "@/lib/i18n/server";
import { EVENT_TYPES, SCHEDULER_ROLES } from "@/lib/constants";

const Minute = z.number().int().min(0).max(24 * 60).multipleOf(15);

const EventSchema = z.object({
  date: z.iso.date(),
  startMinute: Minute.nullable(),
  endMinute: Minute.nullable(),
  title: z.string().trim().min(1, { error: "Bitte einen Titel eingeben." }).max(120),
  type: z.enum(EVENT_TYPES),
  note: z.string().trim().max(500).nullable(),
});

export type EventInput = z.input<typeof EventSchema>;

const dayOf = (dateKey: string) => new Date(`${dateKey}T00:00:00.000Z`);

async function parse(input: EventInput) {
  const parsed = EventSchema.safeParse(input);
  if (!parsed.success) throw new UserError(await tr(parsed.error.issues[0]?.message ?? "Ungültige Eingabe."));
  const { startMinute, endMinute } = parsed.data;
  if (endMinute !== null && startMinute === null) throw new UserError(await tr("Bitte auch eine Startzeit wählen."));
  if (startMinute !== null && endMinute !== null && endMinute <= startMinute) {
    throw new UserError(await tr("Die Endzeit muss nach der Startzeit liegen."));
  }
  const { date, note, ...rest } = parsed.data;
  return { ...rest, date: dayOf(date), note: note || null };
}

/** Managers add special dates (team meeting, announcement …) to the Einsatzplan's Ereignisse. */
export async function createEvent(input: EventInput) {
  return guard(async () => {
    const session = await requireRole(SCHEDULER_ROLES);
    const data = await parse(input);
    await prisma.event.create({ data: { ...data, createdById: session.userId } });
    revalidatePath("/dashboard/schedule");
  });
}

export async function updateEvent(id: string, input: EventInput) {
  return guard(async () => {
    await requireRole(SCHEDULER_ROLES);
    const data = await parse(input);
    const { count } = await prisma.event.updateMany({ where: { id: z.string().min(1).parse(id) }, data });
    if (count === 0) throw new UserError(await tr("Dieser Eintrag existiert nicht mehr."));
    revalidatePath("/dashboard/schedule");
  });
}

export async function deleteEvent(id: string) {
  return guard(async () => {
    await requireRole(SCHEDULER_ROLES);
    await prisma.event.deleteMany({ where: { id: z.string().min(1).parse(id) } });
    revalidatePath("/dashboard/schedule");
  });
}
