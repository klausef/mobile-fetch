import { useEffect, useState } from "react";

/**
 * A wall clock that re-renders on an interval.
 *
 * For readouts that have to move on their own — a trip's elapsed time, a
 * countdown — as opposed to anything derived from a location fix. Screens used
 * to grow their own `setInterval` for this, which is exactly the shape that
 * made a screen-local GPS stream look innocent; keeping the one legitimate timer
 * here means a screen importing it is unmistakably asking for a display clock
 * and not for a stream.
 *
 * `intervalMs` is a dependency rather than read once, so a caller that changes
 * granularity does not keep the old cadence until it remounts.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
