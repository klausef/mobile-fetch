import { Text, View } from "react-native";
import type { BookingStatus } from "@/types";
import { STATUS_LABELS } from "@/utils/bookingStatus";

/**
 * Badges. A booking status has a fixed tone — colour carries meaning here, so
 * the mapping lives next to the words it stands for.
 */

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-paper text-muted",
  brand: "bg-brand-soft text-brand-dark",
  success: "bg-successSoft text-success",
  warning: "bg-warningSoft text-warning",
  danger: "bg-dangerSoft text-danger",
  info: "bg-infoSoft text-info",
};

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: BadgeTone;
}) {
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${TONES[tone]}`}>
      <Text className="text-xs font-semibold">{label}</Text>
    </View>
  );
}

const STATUS_TONES: Record<BookingStatus, BadgeTone> = {
  pending: "warning",
  accepted: "info",
  driver_arriving: "info",
  in_progress: "brand",
  completed: "success",
  cancelled: "danger",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge label={STATUS_LABELS[status]} tone={STATUS_TONES[status]} />;
}
