import { useCallback, useState } from "react";
import type { RiderService } from "../types";

/**
 * The on/off state of each service card. It starts from the vehicle-derived
 * defaults and lives for the screen's visit — mock data has nothing to
 * persist to, and the flow still demonstrates the control.
 */
export function useRiderServiceToggles(initial: RiderService[]) {
  const [services, setServices] = useState<RiderService[]>(initial);

  const toggle = useCallback((serviceId: string, enabled: boolean) => {
    setServices((current) =>
      current.map((service) =>
        service.id === serviceId ? { ...service, enabled } : service,
      ),
    );
  }, []);

  return { services, toggle };
}
