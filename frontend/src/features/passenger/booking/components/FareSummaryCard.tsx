import { Text, View } from "react-native";
import { Card } from "@/components/Card";
import { formatDistance, formatEta, formatPeso } from "@/utils/format";
import type { FareQuote } from "../types";

/** The quote: distance, base + per-km, and the ETA the rider promised. */
export function FareSummaryCard({ quote }: { quote: FareQuote }) {
  return (
    <Card className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold uppercase tracking-wide text-muted">
          Fare · {quote.service.name}
        </Text>
        <Text className="text-sm text-muted">{formatEta(quote.etaMinutes)} away</Text>
      </View>
      <Text className="text-3xl font-bold text-ink">{formatPeso(quote.fare)}</Text>
      <Text className="text-xs text-muted">
        {formatPeso(quote.service.baseFare)} base + {formatPeso(quote.service.perKmFare)}/km ·{" "}
        {formatDistance(quote.distanceKm)} by road
      </Text>
    </Card>
  );
}
