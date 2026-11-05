import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "./login-form";
import { getT } from "@/lib/i18n/server";
import { LanguageSwitch } from "@/components/language-switch";

export default async function LoginPage() {
  const t = await getT();
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-brand-100/60 px-4 py-12">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-brand-300/30 blur-3xl" />

      <LanguageSwitch className="absolute right-4 top-4 sm:right-6 sm:top-6" />
      <div className="relative w-full max-w-md">
        <div className="rounded-3xl border border-white/80 bg-white/90 p-8 shadow-[0_20px_60px_-20px_rgba(137,19,80,0.25)] backdrop-blur sm:p-10">
          <BrandMark label={t("Einsatzplanung")} size="lg" />
          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-zinc-900">{t("Willkommen zurück")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("Melden Sie sich an, um den Teamplan zu sehen.")}</p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-zinc-400">{t("Internes System – nur für autorisierte Mitarbeitende.")}</p>
      </div>
    </div>
  );
}
