"use server";

import { tr } from "@/lib/i18n/server";
import * as z from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dal";
import { ROLES, SKILL_CODES } from "@/lib/constants";
import { isValidBirthday } from "@/lib/birthday";

const SkillsSchema = z.array(z.enum(SKILL_CODES)).default([]);

const INVALID_BIRTHDAY = "Ungültiger Geburtstag – bitte als TT.MM eingeben, z. B. 13.10.";

/** Day + month only (never the year); both set or both empty. 29.02 is allowed. */
const BirthdaySchema = z
  .object({
    birthDay: z.number().int().nullable().default(null),
    birthMonth: z.number().int().nullable().default(null),
  })
  .refine((b) => (b.birthDay === null && b.birthMonth === null) || (b.birthDay !== null && b.birthMonth !== null && isValidBirthday(b.birthDay, b.birthMonth)), {
    error: INVALID_BIRTHDAY,
  });

const CreateEmployeeSchema = z.object({
  name: z.string().trim().min(2, { error: "Name ist erforderlich." }).max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,30}$/, { error: "Benutzername: 3–30 Buchstaben, Zahlen, Punkte, Binde- oder Unterstriche." }),
  shortCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,5}$/, { error: "Kürzel: 2–5 Buchstaben oder Zahlen." }),
  role: z.enum(ROLES),
  skills: SkillsSchema,
  groupNumber: z.number().int().min(1).max(9).nullable(),
  password: z.string().min(8, { error: "Das Passwort muss mindestens 8 Zeichen lang sein." }).max(100),
}).and(BirthdaySchema);

export type CreateEmployeeInput = z.input<typeof CreateEmployeeSchema>;
export type ActionResult = { ok: true } | { ok: false; error: string };

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Ungültige Eingabe.";
}

export async function createEmployee(input: CreateEmployeeInput): Promise<ActionResult> {
  await requireRole(["manager"]);
  const parsed = CreateEmployeeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: await tr(firstIssue(parsed.error)) };
  const { password, skills, ...data } = parsed.data;

  const clash = await prisma.employee.findFirst({
    where: { OR: [{ username: data.username }, { shortCode: data.shortCode }] },
  });
  if (clash) {
    return {
      ok: false,
      error: clash.username === data.username ? "Dieser Benutzername ist bereits vergeben." : "Dieses Kürzel wird bereits verwendet.",
    };
  }

  // New people go to the end of the schedule; the manager can move them on the Team page.
  const last = await prisma.employee.aggregate({ _max: { sortOrder: true } });
  await prisma.employee.create({
    data: {
      ...data,
      skills: skills.join(","),
      sortOrder: (last._max.sortOrder ?? 0) + 10,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  revalidatePath("/dashboard/team");
  return { ok: true };
}

const UpdateEmployeeSchema = z.object({
  id: z.string().min(1),
  role: z.enum(ROLES),
  skills: SkillsSchema,
  groupNumber: z.number().int().min(1).max(9).nullable(),
  sortOrder: z.number().int().min(0).max(9999),
  active: z.boolean(),
}).and(BirthdaySchema);

export type UpdateEmployeeInput = z.input<typeof UpdateEmployeeSchema>;

export async function updateEmployee(input: UpdateEmployeeInput): Promise<ActionResult> {
  const session = await requireRole(["manager"]);
  const parsed = UpdateEmployeeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: await tr(firstIssue(parsed.error)) };
  const { id, skills, ...data } = parsed.data;

  if (id === session.userId && (data.role !== "manager" || !data.active)) {
    return { ok: false, error: await tr("Sie können Ihr eigenes Konto weder herabstufen noch deaktivieren.") };
  }

  await prisma.employee.update({ where: { id }, data: { ...data, skills: skills.join(",") } });

  revalidatePath("/dashboard/team");
  return { ok: true };
}

const ResetPasswordSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(8, { error: "Das Passwort muss mindestens 8 Zeichen lang sein." }).max(100),
});

export async function resetEmployeePassword(input: z.input<typeof ResetPasswordSchema>): Promise<ActionResult> {
  await requireRole(["manager"]);
  const parsed = ResetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: await tr(firstIssue(parsed.error)) };

  await prisma.employee.update({
    where: { id: parsed.data.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
  });
  return { ok: true };
}
