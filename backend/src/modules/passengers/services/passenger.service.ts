import { db } from "../../database/db";
import type { Passenger, CreatePassengerInput } from "../types";

export function getPassenger(id: string): Passenger | undefined {
  return db.getPassenger(id);
}

export function getPassengerByEmail(email: string): Passenger | undefined {
  return Array.from(db.passengers.values()).find((p) => (p as any).email === email);
}

export function createPassenger(input: CreatePassengerInput): Passenger {
  const passenger: Passenger = {
    id: `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    name: input.name,
    email: input.email,
    phone: input.phone,
  };
  db.addPassenger(passenger);
  return passenger;
}
