"use client";

import { useEffect, useState } from "react";
import { zurichDateKey, zurichMinute } from "./dates";

/**
 * Current Swiss date and minute, refreshed every 30 seconds. `null` until mounted, so the
 * server render and the first client render match (no hydration mismatch on the clock).
 */
export function useZurichNow(): { dateKey: string; minute: number } | null {
  const [now, setNow] = useState<{ dateKey: string; minute: number } | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow({ dateKey: zurichDateKey(d), minute: zurichMinute(d) });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
