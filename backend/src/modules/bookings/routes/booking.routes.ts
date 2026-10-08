import { Router } from "express";
import {
  getMyBookings,
  getBooking,
  createBooking,
  cancelBooking,
  getAvailableRequests,
  acceptBooking,
  updateBookingStatus,
  getMyTrips,
  getEarnings,
} from "../services/booking.service";
import type { BookingStatus } from "../types";

const bookings = Router();

// Passenger-facing
bookings.get("/passenger/bookings", (req, res) => {
  const passengerId = req.query.passengerId as string;
  if (!passengerId) return res.status(400).json({ error: "passengerId required" });
  return res.json(getMyBookings(passengerId));
});

bookings.get("/passenger/bookings/:id", (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  return res.json(booking);
});

bookings.post("/passenger/bookings", (req, res) => {
  const data = req.body ?? {};
  const booking = createBooking(data as Booking).catch((err) => {
    return res.status(400).json({ error: String(err) });
  });
  if (!booking) return;
  return res.status(201).json(booking);
});

bookings.post("/passenger/bookings/:id/cancel", (req, res) => {
  const passengerId = req.body.passengerId as string;
  if (!passengerId) return res.status(400).json({ error: "passengerId required" });
  try {
    const booking = cancelBooking(req.params.id, passengerId);
    return res.json(booking);
  } catch (err: unknown) {
    return res.status(400).json({ error: String(err) });
  }
});

// Rider-facing
bookings.get("/rider/requests", (req, res) => {
  const riderId = req.query.riderId as string;
  if (!riderId) return res.status(400).json({ error: "riderId required" });
  return res.json(getAvailableRequests(riderId));
});

bookings.post("/rider/bookings/:id/accept", (req, res) => {
  const riderId = req.body.riderId as string;
  const riderName = req.body.riderName as string;
  if (!riderId || !riderName) return res.status(400).json({ error: "riderId and riderName required" });
  try {
    const booking = acceptBooking(req.params.id, riderId, riderName);
    return res.json(booking);
  } catch (err: unknown) {
    return res.status(400).json({ error: String(err) });
  }
});

bookings.post("/rider/bookings/:id/status", (req, res) => {
  const riderId = req.body.riderId as string;
  const status = req.body.status as BookingStatus;
  if (!riderId || !status) return res.status(400).json({ error: "riderId and status required" });
  try {
    const booking = updateBookingStatus(req.params.id, riderId, status);
    return res.json(booking);
  } catch (err: unknown) {
    return res.status(400).json({ error: String(err) });
  }
});

bookings.get("/rider/trips", (req, res) => {
  const riderId = req.query.riderId as string;
  if (!riderId) return res.status(400).json({ error: "riderId required" });
  return res.json(getMyTrips(riderId));
});

bookings.get("/rider/earnings", (req, res) => {
  const riderId = req.query.riderId as string;
  if (!riderId) return res.status(400).json({ error: "riderId required" });
  return res.json(getEarnings(riderId));
});

export default bookings;
export { bookings };
