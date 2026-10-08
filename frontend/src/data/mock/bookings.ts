import type { Booking } from "@/types";
import { MOCK_SERVICES } from "./services";
import { findLocation } from "./locations";
import { estimateFare, roadDistanceKm } from "@/utils/geo";

/**
 * Seed bookings with a shape the demo can tell a story with: a trip in
 * progress, one waiting for a rider, and a finished history a rider gets paid
 * from. Timestamps and fares are computed at seed time so the lists always
 * look recent and the money adds up.
 */

const hoursAgo = (hours: number): string =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60 * 1000).toISOString();

interface SeedSpec {
  id: string;
  serviceId: string;
  pickupId: string;
  destinationId: string;
  riderId?: string;
  riderName?: string;
  status: Booking["status"];
  startedHoursAgo: number;
}

const SEED_SPECS: SeedSpec[] = [
  {
    id: "bk-seed-1",
    serviceId: "svc-car",
    pickupId: "loc-2",
    destinationId: "loc-1",
    riderId: "rider-1",
    riderName: "Marco Villanueva",
    status: "in_progress",
    startedHoursAgo: 0.25,
  },
  {
    id: "bk-seed-2",
    serviceId: "svc-tricycle",
    pickupId: "loc-3",
    destinationId: "loc-6",
    status: "pending",
    startedHoursAgo: 0.1,
  },
  {
    id: "bk-seed-3",
    serviceId: "svc-motorcycle",
    pickupId: "loc-4",
    destinationId: "loc-7",
    riderId: "rider-1",
    riderName: "Marco Villanueva",
    status: "completed",
    startedHoursAgo: 5,
  },
  {
    id: "bk-seed-4",
    serviceId: "svc-delivery",
    pickupId: "loc-5",
    destinationId: "loc-2",
    riderId: "rider-1",
    riderName: "Marco Villanueva",
    status: "completed",
    startedHoursAgo: 26,
  },
  {
    id: "bk-seed-5",
    serviceId: "svc-car",
    pickupId: "loc-1",
    destinationId: "loc-8",
    riderId: "rider-2",
    riderName: "Jong Diaz",
    status: "completed",
    startedHoursAgo: 30,
  },
  {
    id: "bk-seed-6",
    serviceId: "svc-errand",
    pickupId: "loc-3",
    destinationId: "loc-4",
    riderId: "rider-1",
    riderName: "Marco Villanueva",
    status: "cancelled",
    startedHoursAgo: 49,
  },
  {
    id: "bk-seed-7",
    serviceId: "svc-motorcycle",
    pickupId: "loc-8",
    destinationId: "loc-5",
    riderId: "rider-1",
    riderName: "Marco Villanueva",
    status: "completed",
    startedHoursAgo: 52,
  },
];

/** The path a seed booking walked to reach its status. */
const timelineFor = (spec: SeedSpec): Booking["timeline"] => {
  const order: Booking["status"][] = [
    "pending",
    "accepted",
    "driver_arriving",
    "in_progress",
    "completed",
  ];
  const reached =
    spec.status === "cancelled"
      ? ["pending", "accepted", "cancelled"]
      : order.slice(0, order.indexOf(spec.status) + 1);
  return reached.map((status, index) => ({
    status,
    at: minutesAgo(spec.startedHoursAgo * 60 - index * 4),
    ...(spec.riderName ? { by: spec.riderName } : {}),
  }));
};

export const SEED_BOOKINGS: Booking[] = SEED_SPECS.map((spec) => {
  const service = MOCK_SERVICES.find((candidate) => candidate.id === spec.serviceId);
  if (!service) throw new Error(`Unknown seed service: ${spec.serviceId}`);
  const pickup = findLocation(spec.pickupId);
  const destination = findLocation(spec.destinationId);
  if (!pickup || !destination) throw new Error("Unknown seed location");

  return {
    id: spec.id,
    passengerId: "passenger-1",
    passengerName: "Ana Reyes",
    serviceId: service.id,
    serviceName: service.name,
    status: spec.status,
    pickup,
    destination,
    distanceKm: roadDistanceKm(pickup, destination),
    fare: estimateFare(service, roadDistanceKm(pickup, destination)),
    ...(spec.riderId ? { riderId: spec.riderId } : {}),
    ...(spec.riderName ? { riderName: spec.riderName } : {}),
    createdAt: hoursAgo(spec.startedHoursAgo),
    updatedAt: hoursAgo(Math.max(spec.startedHoursAgo - 0.05, 0)),
    timeline: timelineFor(spec),
  };
});
