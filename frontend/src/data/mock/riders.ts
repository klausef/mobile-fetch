import type { Rider } from "@/types";

/** Demo riders. The signed-in rider is the first one; the rest appear in seeds. */
export const MOCK_RIDERS: Rider[] = [
  {
    id: "rider-1",
    name: "Marco Villanueva",
    email: "marco@fetch.app",
    role: "rider",
    phone: "0918 555 0177",
    vehicle: { make: "Honda", model: "Beat", color: "Red", plate: "NCT 4821" },
    online: false,
    rating: 4.9,
    completedTrips: 312,
    totalEarnings: 18_450,
  },
  {
    id: "rider-2",
    name: "Jong Diaz",
    email: "jong@fetch.app",
    role: "rider",
    phone: "0919 555 0190",
    vehicle: { make: "Toyota", model: "Wigo", color: "Silver", plate: "GAB 1103" },
    online: true,
    rating: 4.7,
    completedTrips: 154,
    totalEarnings: 9_120,
  },
];

export const DEFAULT_RIDER = MOCK_RIDERS[0];
