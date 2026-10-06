import {
  useCurrentLocation,
  type CurrentLocation,
} from "@/hooks/use-current-location";
import { createContext, useContext, type ReactNode } from "react";

/** The one current-location fix, shared by every screen. */
const CurrentLocationContext = createContext<CurrentLocation | null>(null);

export function CurrentLocationProvider({ children }: { children: ReactNode }) {
  return (
    <CurrentLocationContext.Provider value={useCurrentLocation()}>
      {children}
    </CurrentLocationContext.Provider>
  );
}

export function useCurrentLocationContext(): CurrentLocation {
  const value = useContext(CurrentLocationContext);
  if (!value) {
    throw new Error(
      "useCurrentLocationContext must be used inside <CurrentLocationProvider>.",
    );
  }
  return value;
}
