import type { Service } from "@/types";

/** A service with whether this rider serves it. */
export interface RiderService extends Service {
  enabled: boolean;
}
