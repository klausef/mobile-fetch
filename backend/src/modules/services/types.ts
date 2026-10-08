export type ServiceCategory = "ride" | "delivery" | "errand";

export type ServiceIcon = "car" | "bike" | "package" | "shopping";

export interface Service {
  id: string;
  name: string;
  description: string;
  category: ServiceCategory;
  icon: ServiceIcon;
  baseFare: number;
  perKmFare: number;
  etaMinutes: number;
  active: boolean;
}

export const MOCK_SERVICES: Service[] = [
  { id: "svc-tricycle", name: "Tricycle", description: "Short local trips.", category: "ride", icon: "bike", baseFare: 40, perKmFare: 12, etaMinutes: 4, active: true },
  { id: "svc-motorcycle", name: "Motorcycle", description: "Quick rides across town.", category: "ride", icon: "bike", baseFare: 45, perKmFare: 15, etaMinutes: 3, active: true },
  { id: "svc-car", name: "Car", description: "Covered seating, luggage space.", category: "ride", icon: "car", baseFare: 70, perKmFare: 18, etaMinutes: 3, active: true },
];

export const MOCK_SERVICES: Service[] = [
  { id: "svc-tricycle", name: "Tricycle", description: "Short local trips.", category: "ride", icon: "bike", baseFare: 40, perKmFare: 12, etaMinutes: 4, active: true },
  { id: "svc-motorcycle", name: "Motorcycle", description: "Quick rides across town.", category: "ride", icon: "bike", baseFare: 45, perKmFare: 15, etaMinutes: 3, active: true },
  { id: "svc-car", name: "Car", description: "Covered seating, luggage space.", category: "ride", icon: "car", baseFare: 70, perKmFare: 18, etaMinutes: 3, active: true },
];
