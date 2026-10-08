import { describe, expect, test } from "bun:test";
import { canTransition } from "../modules/bookings/services/booking.service";

describe("the booking status machine", () => {
  test("canTransition", () => {
    expect(canTransition("pending", "accepted")).toBe(true);
    expect(canTransition("pending", "cancelled")).toBe(true);
    expect(canTransition("pending", "driver_arriving")).toBe(false);
    expect(canTransition("accepted", "driver_arriving")).toBe(true);
    expect(canTransition("accepted", "in_progress")).toBe(false);
    expect(canTransition("driver_arriving", "in_progress")).toBe(true);
    expect(canTransition("driver_arriving", "completed")).toBe(false);
    expect(canTransition("accepted", "cancelled")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
    expect(canTransition("in_progress", "cancelled")).toBe(true);
    expect(canTransition("completed", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "pending")).toBe(false);
  });
});
