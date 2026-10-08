/** Money, distance and time formatting for the mock app. */

export const formatPeso = (amount: number): string =>
  `₱${amount.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

export const formatDistance = (km: number): string =>
  km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;

export const formatEta = (minutes: number): string =>
  minutes < 60 ? `${Math.round(minutes)} min` : `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

export const formatDateTime = (iso: string): string =>
  `${formatDate(iso)} · ${formatTime(iso)}`;
