import { BrandMark } from "@/components/brand-mark";
import { LogOut } from "lucide-react";
import { verifySession } from "@/lib/dal";
import { logout } from "@/lib/actions/auth";
import { ROLE_LABELS, SCHEDULER_ROLES, type Role } from "@/lib/constants";
import { NavLinks, type NavItem } from "./nav-links";
import { getT } from "@/lib/i18n/server";
import { loadDisplayName } from "@/lib/names-server";
import { LanguageSwitch } from "@/components/language-switch";

const ALL: Role[] = ["employee", "manager"];

// Employees see the plan, coverage and absences (read-only) plus their own views; the rest is for managers.
const NAV_ITEMS: (NavItem & { roles: Role[] })[] = [
  { href: "/dashboard", label: "Startseite", icon: "home", roles: SCHEDULER_ROLES },
  { href: "/dashboard/schedule", label: "Einsatzplan", icon: "schedule", roles: ALL },
  { href: "/dashboard/my-schedule", label: "Mein Plan", icon: "mySchedule", roles: ["employee"] },
  { href: "/dashboard/absences", label: "Abwesenheiten", icon: "absences", roles: ALL },
  { href: "/dashboard/team", label: "Team", icon: "team", roles: SCHEDULER_ROLES },
  { href: "/dashboard/forecast", label: "Prognose", icon: "forecast", roles: SCHEDULER_ROLES },
];

/** Avatar letters: the first two letters of the (first) name, as in the Einsatzplan. */
function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const session = await verifySession();
  const t = await getT();
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(session.role));
  const name = (await loadDisplayName())(session.name);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col justify-between border-b border-zinc-200/70 bg-white p-4 md:sticky md:top-0 md:h-screen md:w-56 md:border-b-0 md:border-r">
        <div>
          <div className="mb-6 px-2 pt-1">
            <BrandMark label={t("Einsatzplanung")} />
          </div>
          <NavLinks items={visibleItems.map(({ href, label, icon }) => ({ href, label: t(label), icon }))} />
        </div>

        <div className="mt-6 border-t border-zinc-100 pt-4">
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
              {initials(name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900">{name}</p>
              <p className="text-xs text-zinc-500">{t(ROLE_LABELS[session.role])}</p>
            </div>
          </div>
          <LanguageSwitch className="mt-3 px-1" />
          <form action={logout} className="mt-2">
            <button type="submit" className="btn-ghost w-full justify-start px-3 text-zinc-500">
              <LogOut className="h-4 w-4" />
              {t("Abmelden")}
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
