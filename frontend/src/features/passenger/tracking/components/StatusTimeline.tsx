import { Text, View } from "react-native";
import { BOOKING_STATUS_ORDER, STATUS_LABELS } from "@/utils/bookingStatus";
import { formatTime } from "@/utils/format";
import { colors } from "@/theme/colors";
import type { BookingEvent, BookingStatus } from "@/types";

/**
 * Where the booking has been, in the order the statuses move. The dot of the
 * most recent entry is the loudest thing on the list on purpose.
 */
export function StatusTimeline({ timeline }: { timeline: BookingEvent[] }) {
  const reached = new Set(timeline.map((event) => event.status));
  const cancelled = reached.has("cancelled");

  const steps: BookingStatus[] = cancelled
    ? ["pending", "accepted", "cancelled"]
    : BOOKING_STATUS_ORDER;

  return (
    <View className="rounded-2xl border border-line bg-card p-4">
      <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Trip history
      </Text>
      <View className="gap-0">
        {steps.map((status, index) => {
          const event = timeline.find((candidate) => candidate.status === status);
          const isDone = reached.has(status);
          const isCurrent = isDone && index === steps.length - 1;
          return (
            <View key={status} className="flex-row items-stretch gap-3">
              <View className="items-center">
                <View
                  className={`size-3 rounded-full ${
                    isDone ? "" : "bg-line"
                  }`}
                  style={isDone ? { backgroundColor: isCurrent ? colors.brand.DEFAULT : colors.success } : undefined}
                />
                {index < steps.length - 1 ? (
                  <View className={`w-px flex-1 ${reached.has(steps[index + 1]) ? "bg-success" : "bg-line"}`} />
                ) : null}
              </View>
              <View className="flex-1 pb-4">
                <Text className={`text-sm font-medium ${isDone ? "text-ink" : "text-subtle"}`}>
                  {STATUS_LABELS[status]}
                </Text>
                {event ? (
                  <Text className="text-xs text-muted">
                    {formatTime(event.at)}
                    {event.by ? ` · ${event.by}` : ""}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
