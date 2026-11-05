"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import { UserError, guard } from "@/lib/action-result";
import { tr } from "@/lib/i18n/server";
import { ABSENCE_TYPES, HALF_DAYS, SCHEDULER_ROLES } from "@/lib/constants";

const SetAbsenceSchema = z.object({
  employeeId: z.string().min(1),
  date: z.iso.date(),
  halfDay: z.enum(HALF_DAYS),
  type: z.enum(ABSENCE_TYPES).nullable(),
});

export type SetAbsenceInput = z.infer<typeof SetAbsenceSchema>;

/** type = null clears the absence for that employee/date/half-day. */
export async function setAbsence(input: SetAbsenceInput) {
  const session = await requireRole(SCHEDULER_ROLES);
  const validated = SetAbsenceSchema.parse(input);
  const { employeeId, date, halfDay, type } = validated;
  const parsedDate = new Date(`${date}T00:00:00.000Z`);

  const key = { employeeId_date_halfDay: { employeeId, date: parsedDate, halfDay } };

  if (type === null) {
    await prisma.absenceEntry.deleteMany({ where: { employeeId, date: parsedDate, halfDay } });
  } else {
    await prisma.absenceEntry.upsert({
      where: key,
      update: { type, status: "approved" },
      create: {
        employeeId,
        date: parsedDate,
        halfDay,
        type,
        status: "approved",
        createdById: session.userId,
      },
    });
  }

  revalidatePath("/dashboard/absences");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/forecast");
}

const RefusedLeaveSchema = z.object({
  employeeId: z.string().min(1),
  from: z.iso.date(),
  to: z.iso.date(),
  note: z.string().trim().max(200).optional(),
});

/**
 * Records vacation days a manager had to refuse, so the person and the dates show in the
 * "Abgelehnte Ferien" table. Stored as a rejected LeaveRequest (vacation).
 */
export async function recordRefusedLeave(input: z.input<typeof RefusedLeaveSchema>) {
  return guard(async () => {
    const session = await requireRole(SCHEDULER_ROLES);
    const parsed = RefusedLeaveSchema.safeParse(input);
    if (!parsed.success) throw new UserError(await tr("Ungültige Eingabe."));
    const { employeeId, from, to, note } = parsed.data;
    if (to < from) throw new UserError(await tr("Das Enddatum darf nicht vor dem Startdatum liegen."));
    await prisma.leaveRequest.create({
      data: {
        employeeId,
        startDate: new Date(`${from}T00:00:00.000Z`),
        endDate: new Date(`${to}T00:00:00.000Z`),
        type: "vacation",
        note: note || null,
        status: "rejected",
        decidedById: session.userId,
        decidedAt: new Date(),
      },
    });
    revalidatePath("/dashboard/absences");
  });
}

/** Removes a row from "Abgelehnte Ferien" (e.g. entered by mistake). */
export async function deleteRefusedLeave(id: string) {
  return guard(async () => {
    await requireRole(SCHEDULER_ROLES);
    await prisma.leaveRequest.deleteMany({ where: { id: z.string().min(1).parse(id), status: "rejected" } });
    revalidatePath("/dashboard/absences");
  });
}
