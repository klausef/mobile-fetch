import type { Location } from "@/types";

/** Searchable mock places, all within a ride of each other. */
export const MOCK_LOCATIONS: Location[] = [
  { id: "loc-1", name: "Central Terminal", address: "Rizal Ave, Old Town", lat: 14.5995, lng: 120.9842 },
  { id: "loc-2", name: "Riverside Apartments", address: "Block 3, Riverside", lat: 14.6042, lng: 120.9822 },
  { id: "loc-3", name: "Maple Public Market", address: "Maple District", lat: 14.5964, lng: 120.9887 },
  { id: "loc-4", name: "Hillview Campus", address: "Hillview Road", lat: 14.5932, lng: 120.9784 },
  { id: "loc-5", name: "Northgate Mall", address: "Northgate, Highway 7", lat: 14.6088, lng: 120.9905 },
  { id: "loc-6", name: "St. Anne's Hospital", address: "P. Burgos St", lat: 14.6013, lng: 120.9866 },
  { id: "loc-7", name: "Bayside Park", address: "Bay Boulevard", lat: 14.5917, lng: 120.9928 },
  { id: "loc-8", name: "Old Town Plaza", address: "Plaza Drive, Old Town", lat: 14.5981, lng: 120.9834 },
];

export const findLocation = (id: string): Location | undefined =>
  MOCK_LOCATIONS.find((location) => location.id === id);
