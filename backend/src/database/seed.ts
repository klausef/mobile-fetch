import { db } from "./db";
import { MOCK_PASSENGERS } from "../modules/passengers/types";
import { MOCK_RIDERS } from "../modules/riders/types";
import { MOCK_SERVICES } from "../modules/services/types";
import { hoursAgo } from "./time";

MOCK_PASSENGERS.forEach((p) => db.addPassenger(p));

MOCK_RIDERS.forEach((r) => {
  if (r.id === "rider-1") {
    r.online = false;
  } else {
    r.online = true;
  }
  db.addRider(r);
});

MOCK_SERVICES.forEach((s) => db.addService(s));

const rider0 = db.getRider(MOCK_RIDERS[0].id);
const rider1 = db.getRider(MOCK_RIDERS[1].id);

db.addBooking({
  id: "bk-seed-1",
  passengerId: MOCK_PASSENGERS[0].id,
  passengerName: MOCK_PASSENGERS[0].name,
  serviceId: MOCK_SERVICES[0].id,
  serviceName: MOCK_SERVICES[0].name,
  status: "accepted",
  pickup: { name: "Central", address: "Town Square" },
  destination: { name: "Maple Market", address: "Maple St" },
  distanceKm: 1.2,
  fare: 82,
  riderId: rider0?.id ?? rider1?.id,
  riderName: rider0 ? rider0.name : rider1 ? rider1.name : "",
  createdAt: hoursAgo(0.25),
  updatedAt: hoursAgo(0.1),
  timeline: [
    { status: "pending", at: hoursAgo(0.25), by: (rider0 ?? rider1 as any)?.name ?? "" },
    { status: "accepted", at: hoursAgo(0.1), by: (rider0 ?? rider1 as any)?.name ?? "" },
  ],
});
