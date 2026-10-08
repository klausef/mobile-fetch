import type { PassengerApi } from "./passengerApi";
import type { RiderApi, RiderProfileApi } from "./riderApi";
import { mockPassengerApi } from "@/services/mock/mockPassengerApi";
import { mockRiderApi, mockRiderProfileApi } from "@/services/mock/mockRiderApi";

/**
 * The one place an implementation is chosen.
 *
 * Every screen and feature imports `passengerApi` / `riderApi` from here and
 * programs against the interfaces in this folder. The app ships with the mock
 * implementations, so it runs with no backend at all; pointing it at a real
 * one means writing an HTTP version of `PassengerApi` / `RiderApi` and
 * changing these two lines.
 */
export const passengerApi: PassengerApi = mockPassengerApi;

export const riderApi: RiderApi = mockRiderApi;

export const riderProfileApi: RiderProfileApi = mockRiderProfileApi;
