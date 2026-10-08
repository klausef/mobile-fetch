import { create } from "zustand";
import type { Location } from "@/types";

/**
 * The booking being composed.
 *
 * Pickup and destination are chosen on a different screen from the one that
 * prices the trip, so the half-finished booking lives here rather than in
 * navigation params — a re-mount or a deep link cannot lose it.
 */

interface BookingDraftState {
  serviceId: string | null;
  pickup: Location | null;
  destination: Location | null;
  setService: (serviceId: string | null) => void;
  setPickup: (pickup: Location | null) => void;
  setDestination: (destination: Location | null) => void;
  clear: () => void;
}

export const useBookingDraftStore = create<BookingDraftState>((set) => ({
  serviceId: null,
  pickup: null,
  destination: null,
  setService: (serviceId) => set({ serviceId }),
  setPickup: (pickup) => set({ pickup }),
  setDestination: (destination) => set({ destination }),
  clear: () => set({ serviceId: null, pickup: null, destination: null }),
}));
