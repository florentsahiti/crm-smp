"use server";

import { tr } from "@/lib/i18n/server";
import * as z from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/session";
import type { Role } from "@/lib/constants";

const LoginSchema = z.object({
  username: z.string().trim().min(1, { error: "Benutzername ist erforderlich." }),
  password: z.string().min(1, { error: "Passwort ist erforderlich." }),
});

export type LoginState =
  | { error: string }
  | undefined;

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const validated = LoginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { error: await tr("Bitte Benutzername und Passwort eingeben.") };
  }

  const { username, password } = validated.data;

  const employee = await prisma.employee.findUnique({
    where: { username: username.toLowerCase() },
  });

  if (!employee || !employee.active) {
    return { error: await tr("Benutzername oder Passwort ist ungültig.") };
  }

  const passwordMatches = await bcrypt.compare(password, employee.passwordHash);
  if (!passwordMatches) {
    return { error: await tr("Benutzername oder Passwort ist ungültig.") };
  }

  await createSession({
    userId: employee.id,
    role: employee.role as Role,
    name: employee.name,
  });

  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
