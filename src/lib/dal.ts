import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { decrypt, getSessionCookie, type SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants";

/**
 * The cookie only proves who signed in. Role and active status are re-read from the
 * database on every request, so deactivating or demoting someone takes effect at once
 * instead of when their cookie expires.
 */
export const verifySession = cache(async (): Promise<SessionPayload> => {
  const cookie = await getSessionCookie();
  const session = await decrypt(cookie);

  if (!session?.userId) {
    redirect("/login");
  }

  const employee = await prisma.employee.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, role: true, active: true },
  });

  if (!employee || !employee.active) {
    // Can't clear a cookie while rendering — hand off to a route handler that can.
    redirect("/api/session/expired");
  }

  return { userId: employee.id, role: employee.role as Role, name: employee.name };
});

export async function requireRole(allowed: Role[]) {
  const session = await verifySession();
  if (!allowed.includes(session.role)) {
    redirect("/dashboard");
  }
  return session;
}
