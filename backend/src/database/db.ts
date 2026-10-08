import type { Passenger } from "../modules/passengers/types";
import type { Rider } from "../modules/riders/types";
import type { Service } from "../modules/services/types";
import type { Booking, BookingStatus, BookingEvent, EarningsSummary } from "../modules/bookings/types";

/** The one data store. Replace this file with a real DB to change the backend. */
export const db = {
  passengers: new Map<string, Passenger>(),
  riders: new Map<string, Rider>(),
  services: new Map<string, Service>(),
  bookings: new Map<string, Booking>(),
  bookingCounter: 0,

  nextBookingId() {
    this.bookingCounter += 1;
    return `bk-${Date.now().toString(36)}-${this.bookingCounter}`;
  },

  addBooking(booking: Booking) {
    this.bookings.set(booking.id, booking);
    return booking;
  },

  getBooking(id: string): Booking | undefined {
    return this.bookings.get(id);
  },

  updateBooking(id: string, booking: Booking) {
    this.bookings.set(id, booking);
    return booking;
  },

  addPassenger(passenger: Passenger) {
    this.passengers.set(passenger.id, passenger);
  },
  getPassenger(id: string): Passenger | undefined {
    return this.passengers.get(id);
  },

  addRider(rider: Rider) {
    this.riders.set(rider.id, rider);
  },
  getRider(id: string): Rider | undefined {
    return this.riders.get(id);
  },

  addService(service: Service) {
    this.services.set(service.id, service);
  },
  getServices(): Service[] {
    return Array.from(this.services.values());
  },

  myBookings(passengerId: string): Booking[] {
    return Array.from(this.bookings.values()).filter((b) => b.passengerId === passengerId);
  },

  availableRequestsForRider(riderId: string): Booking[] {
    return Array.from(this.bookings.values()).filter(
      (b) => b.status === "pending" && !b.riderId && b.riderId !== riderId,
    );
  },

  myTrips(riderId: string): Booking[] {
    return Array.from(this.bookings.values()).filter((b) => b.riderId === riderId);
  },

  settleTrip(riderId: string, fare: number) {
    const rider = this.getRider(riderId);
    if (rider) {
      rider.completedTrips += 1;
      rider.totalEarnings = (rider.totalEarnings ?? 0) + fare;
      this.riders.set(rider.id, rider);
    }
  },

  earningsSummary(riderId: string): EarningsSummary {
    const rider = this.getRider(riderId);
    const mine = Array.from(this.bookings.values()).filter(
      (b) => b.riderId === riderId && (b.status === "completed" || b.status === "cancelled"),
    );
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todays = mine.filter((b) => new Date(b.updatedAt) >= startOfDay);
    return {
      total: (rider?.totalEarnings ?? 0),
      trips: (rider?.completedTrips ?? 0),
      todayTotal: todays.reduce((s, b) => s + b.fare, 0),
      todayTrips: todays.length,
    };
  },
};
