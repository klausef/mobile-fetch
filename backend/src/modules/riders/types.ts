export interface Rider {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehicle: { make: string; model: string; color: string; plate: string };
  online: boolean;
  rating: number;
  completedTrips: number;
  totalEarnings: number;
}

export interface RiderProfile {
  rider: Rider;
  setOnline(online: boolean): Rider;
}

export const MOCK_RIDERS: Rider[] = [
  { id: "rider-1", name: "Marco Villanueva", email: "marco@fetch.app", phone: "0918 555 0177",
    vehicle: { make: "Honda", model: "Beat", color: "Red", plate: "FH-1234" },
    online: false, rating: 4.8, completedTrips: 12, totalEarnings: 0 },
  { id: "rider-2", name: "Jong Diaz", email: "jong@fetch.app", phone: "0918 555 0190",
    vehicle: { make: "Nissan", model: "Day", color: "Silver", plate: "MM-4567" },
    online: true, rating: 4.9, completedTrips: 0, totalEarnings: 0 },
];
