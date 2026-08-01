import { useEffect, useState } from "react";
import { formatClock, msUntilNextMinute } from "../lib/clock";

/* The effectful half of the header's live clock — ports `startClock`
 * (js/main.js:2664-2683). Renders immediately, then aligns the first tick to
 * the next minute boundary before settling into a once-a-minute interval,
 * the same two-stage schedule the vanilla used. */
export function useLiveClock(): string {
  const [time, setTime] = useState(() => formatClock());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const alignToMinute = setTimeout(() => {
      setTime(formatClock());
      interval = setInterval(() => setTime(formatClock()), 60_000);
    }, msUntilNextMinute());

    return () => {
      clearTimeout(alignToMinute);
      if (interval) clearInterval(interval);
    };
  }, []);

  return time;
}
