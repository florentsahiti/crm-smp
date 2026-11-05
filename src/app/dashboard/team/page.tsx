import { requireRole } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { withDisplayNames } from "@/lib/names";
import { SCHEDULER_ROLES, type Role } from "@/lib/constants";
import { AddEmployeeForm } from "./add-employee-form";
import { EmployeeRow } from "./employee-row";
import { getT } from "@/lib/i18n/server";

export default async function TeamPage() {
  const session = await requireRole(SCHEDULER_ROLES);
  const canManage = session.role === "manager";
  const t = await getT();

  const employees = withDisplayNames(
    await prisma.employee.findMany({
      where: canManage ? {} : { active: true },
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    })
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">
            {t("{n} aktive Personen", { n: employees.filter((e) => e.active).length })}
            {canManage ? ` – ${t("hier können Sie Personen hinzufügen, Rollen ändern und die Reihenfolge im Einsatzplan festlegen (Pos.).")}` : "."}
          </p>
        </div>
        {canManage && <AddEmployeeForm />}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium" title={t("Position im Einsatzplan")}>{t("Pos.")}</th>
              <th className="px-4 py-3 font-medium">{t("Kürzel")}</th>
              <th className="px-4 py-3 font-medium">{t("Name")}</th>
              <th className="px-4 py-3 font-medium">{t("Rolle")}</th>
              <th className="px-4 py-3 font-medium">{t("Sprachen")}</th>
              <th className="px-4 py-3 font-medium">{t("Gruppe")}</th>
              {canManage && <th className="px-4 py-3 font-medium">{t("Status")}</th>}
              {canManage && <th className="px-4 py-3 text-right font-medium">{t("Aktionen")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {employees.map((employee) => (
              <EmployeeRow
                key={employee.id}
                id={employee.id}
                name={employee.name}
                username={employee.username}
                shortCode={employee.shortCode}
                role={employee.role as Role}
                skills={employee.skills ? employee.skills.split(",").filter(Boolean) : []}
                groupNumber={employee.groupNumber}
                sortOrder={employee.sortOrder}
                birthDay={employee.birthDay}
                birthMonth={employee.birthMonth}
                active={employee.active}
                isSelf={employee.id === session.userId}
                canManage={canManage}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
