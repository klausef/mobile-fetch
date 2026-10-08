/** Every screen is reached through these paths (Expo Router file routes). */
export const routes = {
  roleSelect: "/",
  passengerDashboard: "/passenger/dashboard",
  passengerServices: "/passenger/services",
  passengerBooking: "/passenger/booking",
  passengerTracking: "/passenger/tracking",
  riderDashboard: "/rider/dashboard",
  riderServices: "/rider/services",
  riderActiveTrip: "/rider/active-trip",
  riderHistory: "/rider/history",
} as const;

export const bookingDetailRoute = (id: string): string => `/passenger/booking/${id}`;

export const trackingRoute = (id: string): string => `/passenger/tracking/${id}`;
