import type { Passenger } from "@/types";

/**
 * Demo people. The app has no authentication service, so "signing in" is
 * picking a role on the front door; these are the accounts behind it.
 */

export const MOCK_PASSENGERS: Passenger[] = [
  {
    id: "passenger-1",
    name: "Ana Reyes",
    email: "ana@fetch.app",
    role: "passenger",
    phone: "0917 555 0142",
    homeAddress: "Riverside Apartments, Block 3",
  },
];

export const DEFAULT_PASSENGER = MOCK_PASSENGERS[0];
