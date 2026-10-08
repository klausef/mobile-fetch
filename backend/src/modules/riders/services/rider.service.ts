import { db } from "../../database/db";
import type { Rider, EarningsSummary, Booking } from "../types";

export function getRider(id: string): Rider | undefined {
  return db.getRider(id);
}

export function setRiderOnline(riderId: string, online: boolean): Rider | undefined {
  const rider = db.getRider(riderId);
  if (!rider) return undefined;
  rider.online = online;
  return rider;
}

export function getRiderOrders(riderId: string): Booking[] {
  return db.availableRequestsForRider(riderId);
}

export function getRiderEarnings(riderId: string): EarningsSummary {
  return db.earningsSummary(riderId);
}
