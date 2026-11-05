import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ChartColumn, Users, type LucideIcon } from "lucide-react";
import { verifySession } from "@/lib/dal";
import { ROLE_LABELS, isScheduler } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";

type Tile = { href: string; title: string; description: string; icon: LucideIcon; count?: number; countLabel?: string };

export default async function DashboardHomePage() {
  const session = await verifySession();
  const scheduler = isScheduler(session.role);
  // Employees have no start page — the team schedule is their home.
  if (!scheduler) redirect("/dashboard/schedule");
  const t = await getT();


  const tiles: Tile[] = [
    {
      href: "/dashboard/schedule",
      title: "Einsatzplan",
      description: scheduler ? "Den Tag planen, Einsätze zuweisen und die Abdeckung prüfen." : "Den Tag des ganzen Teams sehen – und eigene Pausen erfassen.",
      icon: CalendarClock,
    },
  ];
  if (scheduler) {
    tiles.push({ href: "/dashboard/forecast", title: "Prognose", description: "Erwartete Anrufe, Kapazität und Erreichbarkeit für die Woche.", icon: ChartColumn });
    tiles.push({ href: "/dashboard/team", title: "Team", description: session.role === "manager" ? "Mitarbeitende hinzufügen und Rollen verwalten." : "Die Teamliste ansehen.", icon: Users });
  }

  return (
    <div>
      <p className="text-sm font-medium text-brand-700">{t(ROLE_LABELS[session.role])}</p>
      <h1 className="page-title mt-1">{t("Grüezi, {name}", { name: session.name.split(" ")[0] })}</h1>
      <p className="page-subtitle">{t("Das können Sie heute erledigen.")}</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="card group flex flex-col gap-3 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-100">
                <tile.icon className="h-5 w-5" />
              </span>
              {tile.count !== undefined && tile.count > 0 && (
                <span className="badge bg-brand-700 text-white">
                  {tile.count} {tile.countLabel ? t(tile.countLabel) : ""}
                </span>
              )}
            </div>
            <div>
              <h2 className="font-semibold text-zinc-900">{t(tile.title)}</h2>
              <p className="mt-0.5 text-sm text-zinc-500">{t(tile.description)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
