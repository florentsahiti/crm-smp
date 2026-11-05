"use client";

import { SKILL_COLORS, SKILL_LABELS, isSkillCode } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";

/** One small coloured badge per language code, e.g. DE,FR -> two badges. Unknown codes stay grey. */
export function LanguageBadges({ codes, size = "sm", className = "" }: { codes: string[]; size?: "xs" | "sm"; className?: string }) {
  const t = useT();
  const sizing = size === "xs" ? "rounded px-1 text-[9px] leading-[14px]" : "rounded-full px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex flex-wrap gap-0.5 ${className}`}>
      {codes.map((k) => (
        <span
          key={k}
          title={isSkillCode(k) ? t(SKILL_LABELS[k]) : k}
          className={`font-semibold whitespace-nowrap ${sizing} ${isSkillCode(k) ? SKILL_COLORS[k] : "bg-zinc-100 text-zinc-600"}`}
        >
          {k}
        </span>
      ))}
    </span>
  );
}
