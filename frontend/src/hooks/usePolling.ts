import { useEffect } from "react";

/**
 * Refetch on an interval while `active`.
 *
 * Mock data changes only when someone acts on it, so the rider's request list
 * and a passenger's tracking screen poll — a stand-in for the push updates a
 * real backend would send.
 */
export function usePolling(refetch: () => void, intervalMs: number, active = true): void {
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      void refetch();
    }, intervalMs);
    return () => clearInterval(id);
  }, [refetch, intervalMs, active]);
}
