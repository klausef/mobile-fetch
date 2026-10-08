import type { RiderService } from "../types";
import type { Service } from "@/types";
import { passengerApi } from "@/services/api";

/**
 * The service categories this rider serves.
 *
 * Mock data has no rider-preference backend, so the choice is modelled as the
 * vehicle each mock service needs: a rider on a motorcycle serves motorcycle
 * and delivery work, a car serves car rides. That keeps the toggle honest
 * without inventing a persistence layer the spec does not have.
 */

export async function loadRiderServices(vehicle: string): Promise<RiderService[]> {
  const services = await passengerApi.getAvailableServices();
  return services.map((service) => ({ ...service, enabled: matchesVehicle(service, vehicle) }));
}

function matchesVehicle(service: Service, vehicle: string): boolean {
  const v = vehicle.toLowerCase();
  if (v.includes("wigo") || v.includes("car")) return service.category === "ride" && service.icon === "car";
  if (v.includes("beat") || v.includes("motor")) return service.icon !== "car";
  return true;
}
