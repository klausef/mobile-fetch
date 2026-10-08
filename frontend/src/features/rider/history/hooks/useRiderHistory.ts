import { useAsync } from "@/hooks/useAsync";
import { loadRiderHistory } from "../services/history.service";

/** Settled trips and the totals they paid. */
export function useRiderHistory() {
  return useAsync(loadRiderHistory, []);
}
