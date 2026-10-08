import type { Service } from "../services/types";

export interface Passenger {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface CreatePassengerInput {
  name: string;
  email: string;
  phone: string;
}

export const MOCK_PASSENGERS: Passenger[] = [
  { id: "passenger-1", name: "Ana Reyes", email: "ana@fetch.app", phone: "0917 555 0142" },
];
