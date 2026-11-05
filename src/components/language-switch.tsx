"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLocale } from "@/lib/actions/locale";
import { LOCALES } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";

/** DE | EN toggle — sits in the sidebar footer and on the login page. */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Languages className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
      <div role="group" aria-label={t("Sprache")} className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 text-xs font-semibold">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            disabled={pending}
            aria-pressed={l === locale}
            onClick={() =>
              startTransition(async () => {
                await setLocale(l);
                router.refresh();
              })
            }
            className={`rounded-md px-2.5 py-1 transition-colors ${
              l === locale ? "bg-white text-brand-800 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
