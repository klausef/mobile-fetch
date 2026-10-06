/**
 * Turning a tariff edit into something a commuter or rider can act on.
 *
 * Dependency-free so the wording can be asserted in tests instead of only
 * checked by reading a notification in the app.
 */

/** The dials that make up a tariff version. */
export type TariffValues = {
  minFare: number;
  includedDistanceKm: number;
  ratePerKm: number;
  /** Optional: absent on tariff versions published before long trips banded. */
  longTripThresholdKm?: number;
  longTripRatePerKm?: number;
  errandMinFare: number;
  stopFee: number;
};

/** Which roles a broadcast is addressed to. */
export type BroadcastAudience = "all" | "commuters" | "riders";

/** Human labels, kept beside the comparisons so the two cannot drift. */
/**
 * The dials this notice can diff.
 *
 * The long-trip pair is deliberately not listed yet: they are optional on a
 * tariff row, and `format` takes a `number`. Adding them means teaching this
 * file to print "none" for an absent band, which is a separate piece of copy —
 * the numbers themselves are already saved and already priced.
 */
type DiffableTariffKey = Exclude<
  keyof TariffValues,
  "longTripThresholdKm" | "longTripRatePerKm"
>;

const LABELS: { key: DiffableTariffKey; label: string; unit: "" | "km" }[] = [
  { key: "minFare", label: "Minimum fare", unit: "" },
  { key: "includedDistanceKm", label: "Included distance", unit: "km" },
  { key: "ratePerKm", label: "Rate per km", unit: "" },
  { key: "errandMinFare", label: "Pabili/padala minimum", unit: "" },
  { key: "stopFee", label: "Store stop fee", unit: "" },
];

/** Peso amounts are whole numbers to anyone reading them on a phone. */
function peso(value: number): string {
  return `₱${Math.round(value * 100) / 100}`;
}

function format(value: number, unit: "" | "km"): string {
  return unit === "km" ? `${value} km` : peso(value);
}

/**
 * One clause per dial that actually moved, e.g.
 * "Minimum fare ₱60 → ₱65, Rate per km ₱12 → ₱13".
 *
 * Returning only the diffs is the point: five lines of unchanged numbers would
 * bury the reason the rider was woken up.
 */
export function describeTariffChanges(
  before: TariffValues | null,
  after: TariffValues,
): string {
  // Nothing published before: there is no "from" to report, so list the dials as
  // set. Rendering them as "₱60 → ₱60" would read as a change that never happened.
  if (!before) {
    return (
      "New fares: " +
      LABELS.map(
        (field) => `${field.label} ${format(after[field.key], field.unit)}`,
      ).join(", ") +
      "."
    );
  }

  const changes = LABELS.filter((field) => before[field.key] !== after[field.key]).map(
    (field) =>
      `${field.label} ${format(before[field.key], field.unit)} → ${format(after[field.key], field.unit)}`,
  );

  // The admin form can be submitted without edits; claiming fares moved when
  // they did not would teach riders to ignore these messages.
  if (changes.length === 0) return "No dials changed.";
  return changes.join(", ") + ".";
}

/** Title for the notification a tariff change produces. */
export function tariffNoticeTitle(): string {
  return "Fares updated";
}