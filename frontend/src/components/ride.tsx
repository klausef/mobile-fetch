import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { RIDE_TYPE_SPECS, RIDE_TYPES, fareBreakdown, formatEta, formatPeso, formatSurge, type FareTariff, type RideType } from "@/shared";
import { Between, Card, Divider, LineItem, Pill, Row } from "@/components/ui";
import { colors, font, radius, space } from "@/theme";

/** The glyph each vehicle gets. Strings, so no component registry is needed. */
const ICONS: Record<RideType, keyof typeof Ionicons.glyphMap> = {
  motorcycle: "bicycle",
  tricycle: "car-sport",
  car: "car",
  van: "bus",
};

export function RideTypePicker({ value, onChange }: { value: RideType; onChange: (rideType: RideType) => void }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[font.label, { color: colors.textMuted }]}>Vehicle</Text>
      <Row gap={space.sm}>
        {RIDE_TYPES.map((rideType) => {
          const spec = RIDE_TYPE_SPECS[rideType];
          const active = rideType === value;
          return (
            <Pressable
              key={rideType}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(rideType)}
              style={({ pressed }) => [
                styles.typeCard,
                {
                  backgroundColor: active ? colors.ink : colors.card,
                  borderColor: active ? colors.ink : colors.border,
                  opacity: pressed ? 0.86 : 1,
                },
              ]}
            >
              <Ionicons name={ICONS[rideType]} size={20} color={active ? colors.gold : colors.red} />
              <Text style={[font.label, { color: active ? "#ffffff" : colors.ink }]}>
                {spec.name}
              </Text>
              <Text style={[font.tiny, { color: active ? colors.gold : colors.textFaint }]}>
                {spec.seats} {spec.seats === 1 ? "SEAT" : "SEATS"}
              </Text>
            </Pressable>
          );
        })}
      </Row>
      <Text style={[font.small, { color: colors.textMuted }]}>
        {RIDE_TYPE_SPECS[value].blurb}
      </Text>
    </View>
  );
}

/** The receipt-shaped fare quote. */
export function FareCard({ distanceKm, rideType, tariff, surgeMultiplier = 1, isErrand = false, compact = false }: { distanceKm: number; rideType: RideType; tariff: FareTariff; surgeMultiplier?: number; isErrand?: boolean; compact?: boolean; }) {
  const fare = fareBreakdown({ distanceKm, rideType, tariff, surgeMultiplier, isErrand });
  const surge = formatSurge(fare.surgeMultiplier);
  const floored = fare.total <= tariff.minFare + 0.001;
  return (
    <Card>
      <Between>
        <Text style={[font.heading, { color: colors.ink }]}>{isErrand ? "Errand estimate" : "Fare estimate"}</Text>
        <Pill label={formatEta(fare.etaMinutes)} tone="neutral" />
      </Between>
      {!compact ? (
        <>
          <LineItem label={`Base fare · ${RIDE_TYPE_SPECS[rideType].name}`} value={formatPeso(fare.baseFare)} />
          {fare.distanceFee > 0 ? <LineItem label={`Distance beyond ${tariff.includedDistanceKm} km`} value={formatPeso(fare.distanceFee)} /> : null}
          {fare.stopFee > 0 ? <LineItem label="Store stop" value={formatPeso(fare.stopFee)} /> : null}
          {surge ? <LineItem label={`Demand ${surge}`} value={formatPeso(fare.surgeFee)} /> : null}
          {fare.tax > 0 ? <LineItem label={`VAT ${fare.taxRatePct}%`} value={formatPeso(fare.tax)} /> : null}
          <Divider />
        </>
      ) : null}
      <Between>
        <Text style={[font.bodyStrong, { color: colors.ink }]}>Total fare</Text>
        <Text style={[font.title, { color: colors.red }]}>{formatPeso(fare.total)}</Text>
      </Between>
      <Text style={[font.small, { color: colors.textMuted }]}>
        {floored ? `Minimum fare of ${formatPeso(tariff.minFare)} applies to this trip.` : `${fare.distanceKm.toFixed(1)} km · ${tariff.includedDistanceKm} km included, then ${formatPeso(tariff.ratePerKm)}/km.`}
      </Text>
    </Card>
  );
}

/** Status pill for the ride's lifecycle. */
export function StatusPill({ status }: { status: string }) {
  const table: Record<string, { label: string; tone: "neutral" | "live" | "good" | "warn" | "bad" }> = {
    SEARCHING: { label: "Finding a rider", tone: "warn" },
    ACCEPTED: { label: "Rider on the way", tone: "live" },
    RIDER_ARRIVING: { label: "Rider on the way", tone: "live" },
    RIDER_ARRIVED: { label: "Rider arrived", tone: "live" },
    IN_PROGRESS: { label: "On the trip", tone: "live" },
    COMPLETED: { label: "Completed", tone: "good" },
    CANCELLED: { label: "Cancelled", tone: "bad" },
  };
  const entry = table[status] ?? { label: status, tone: "neutral" as const };
  return <Pill label={entry.label} tone={entry.tone} />;
}

/** Pickup or destination, as one tappable row on the booking form. */
export function PointRow({ kind, caption, onPress, busy = false }: { kind: "pickup" | "destination"; caption: string; onPress: () => void; busy?: boolean }) {
  const isPickup = kind === "pickup";
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.pointRow, { opacity: pressed ? 0.75 : 1 }]}>
      <View style={[styles.pointDot, { borderColor: isPickup ? colors.gold : colors.red }]}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isPickup ? colors.gold : colors.red }} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[font.tiny, { color: colors.textFaint, textTransform: "uppercase" }]}>{isPickup ? "Pickup" : "Destination"}</Text>
        <Text numberOfLines={1} style={[font.bodyStrong, { color: caption === "Not set" ? colors.textFaint : colors.ink }]}>
          {busy ? "Locating…" : caption}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  typeCard: { flex: 1, borderRadius: radius.md, borderWidth: 1, paddingVertical: space.md, alignItems: "center", gap: 4 },
  pointRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  pointDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
