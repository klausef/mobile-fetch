/**
 * The domain models. Screens and features import from here; nothing in the app
 * redefines these shapes.
 */

export type Role = "passenger" | "rider";

/** The lifecycle of every booking, in the order it moves. */
export type BookingStatus =
  | "pending"
  | "accepted"
  | "driver_arriving"
  | "in_progress"
  | "completed"
  | "cancelled";

export type ServiceCategory = "ride" | "delivery" | "errand";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Passenger extends User {
  role: "passenger";
  phone: string;
  homeAddress?: string;
}

export interface Vehicle {
  make: string;
  model: string;
  color: string;
  plate: string;
}

export interface Rider extends User {
  role: "rider";
  phone: string;
  vehicle: Vehicle;
  online: boolean;
  rating: number;
  completedTrips: number;
  /** Mock earnings, in pesos, across completed trips. */
  totalEarnings: number;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  category: ServiceCategory;
  icon: "car" | "bike" | "package" | "shopping";
  /** Flat base fare in pesos. */
  baseFare: number;
  /** Pesos per kilometre between pickup and destination. */
  perKmFare: number;
  etaMinutes: number;
  active: boolean;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface BookingEvent {
  status: BookingStatus;
  /** ISO timestamp. */
  at: string;
  by?: string;
}

export interface Booking {
  id: string;
  passengerId: string;
  passengerName: string;
  serviceId: string;
  serviceName: string;
  status: BookingStatus;
  pickup: Location;
  destination: Location;
  distanceKm: number;
  /** Quoted fare in pesos. */
  fare: number;
  riderId?: string;
  riderName?: string;
  createdAt: string;
  updatedAt: string;
  timeline: BookingEvent[];
}

export interface CreateBookingInput {
  passengerId: string;
  passengerName: string;
  serviceId: string;
  pickup: Location;
  destination: Location;
}

export interface EarningsSummary {
  total: number;
  trips: number;
  todayTotal: number;
  todayTrips: number;
}
