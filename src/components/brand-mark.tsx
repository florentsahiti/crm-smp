import { CalendarClock } from "lucide-react";

/** Neutral wordmark used in place of a customer logo. */
export function BrandMark({ label, size = "md" }: { label: string; size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white ${lg ? "h-11 w-11" : "h-9 w-9"}`}>
        <CalendarClock className={lg ? "h-6 w-6" : "h-5 w-5"} aria-hidden />
      </span>
      <span className={`font-semibold tracking-tight text-zinc-900 ${lg ? "text-xl" : "text-base"}`}>{label}</span>
    </div>
  );
}
