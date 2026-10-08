import {
  useCurrentLocation,
  type CurrentLocation,
} from "@/hooks/use-current-location";
import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

/**
 * The one current-location fix, shared by every screen.
 *
 * `auto: false` means the browser is *not* asked when the app opens: a prompt
 * against a page that has not asked for anything is dismissed far more often
 * than it is answered, and a refusal is sticky. The booking screens ask
 * instead, from a tap — see `useAutoDetectOnBooking`.
 */
const CurrentLocationContext = createContext<CurrentLocation | null>(null);

export function CurrentLocationProvider({ children }: { children: ReactNode }) {
  return (
    <CurrentLocationContext.Provider value={useCurrentLocation({ auto: false })}>
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
