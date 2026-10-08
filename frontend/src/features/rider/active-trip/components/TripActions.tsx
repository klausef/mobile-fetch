import { Button } from "@/components/Button";
import type { ActiveTripView } from "../types";

/**
 * The one action that moves the trip forward, plus the escape hatches. Only
 * the next legal step is offered — the buttons are the transition table.
 */
import { View } from "react-native";

export function TripActions({
  view,
  busy,
  onAdvance,
  onCancelled,
}: {
  view: ActiveTripView;
  busy: boolean;
  onAdvance: () => void;
  onCancelled: () => void;
}) {
  return (
    <View className="gap-2">
      {view.nextAction ? (
        <Button label={view.nextAction.label} onPress={onAdvance} loading={busy} fullWidth />
      ) : null}
      {view.booking.status !== "completed" ? (
        <Button label="Cancel trip" variant="ghost" onPress={onCancelled} disabled={busy} fullWidth />
      ) : null}
    </View>
  );
}
