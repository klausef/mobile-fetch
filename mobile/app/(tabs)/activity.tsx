import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  api,
  formatPeso,
  isOngoingStatus,
  ridesInGroup,
  serviceLabel,
  shortAddress,
  titleCase,
} from "@/lib/shared";
import { whenLabel } from "@/lib/format";
import {
  Loading,
  Screen,
  ScreenHeader,
  EmptyState,
} from "@/components/ui";
import { StatusPill } from "@/components/ride";
import {
  colors,
  font,
  scroll,
  space,
} from "@/lib/theme";

/**
 * Every trip this account has taken or carried.
 *
 * One list in two sections, split by `ridesInGroup` — the same rule the web
 * activity page uses, so "ongoing" means the same thing on both. An ongoing
 * trip opens the live screen; a finished one opens the same screen as a
 * receipt, because that is what it is: the fare, the route and the rider.
 */
export default function ActivityScreen() {
  const rides = useQuery(api.rides.listMyRides);

  if (rides === undefined) return <Loading label="Loading your trips…" />;

  const ongoing = ridesInGroup(rides, "ongoing");
  const past = ridesInGroup(rides, "past");

  return (
    <Screen contentStyle={{ gap: scroll.cardGap }}>
      <ScreenHeader
        title="Activity"
        subtitle={
          rides.length === 0
            ? "Nothing yet."
            : `${rides.length} trip${rides.length === 1 ? "" : "s"} on this account.`
        }
      />

      {ongoing.length > 0 ? (
        <>
          <Text style={[font.tiny, { color: colors.textFaint, textTransform: "uppercase" }]}>
            Ongoing
          </Text>
          {ongoing.map((ride) => (
            <RideRow
              key={ride._id}
              id={ride._id}
              code={ride.code}
              status={ride.status}
              bookingType={ride.bookingType}
              pickup={ride.pickup.address}
              destination={ride.destination.address}
              fare={ride.fare}
              at={ride.requestedAt}
              live
            />
          ))}
        </>
      ) : null}

      {past.length > 0 ? (
        <>
          <Text style={[font.tiny, { color: colors.textFaint, textTransform: "uppercase" }]}>
            Past
          </Text>
          {past.map((ride) => (
            <RideRow
              key={ride._id}
              id={ride._id}
              code={ride.code}
              status={ride.status}
              bookingType={ride.bookingType}
              pickup={ride.pickup.address}
              destination={ride.destination.address}
              fare={ride.fare}
              at={ride.completedAt ?? ride.requestedAt}
            />
          ))}
        </>
      ) : null}

      {rides.length === 0 ? (
        <EmptyState
          icon="car-sport-outline"
          title="No trips yet"
          body="Book your first ride from the Book tab — it will show up here with its fare."
          action={undefined}
        />
      ) : null}
    </Screen>
  );
}

function RideRow({
  id,
  code,
  status,
  bookingType,
  pickup,
  destination,
  fare,
  at,
  live = false,
}: {
  id: string;
  code: string;
  status: string;
  bookingType?: string | null;
  pickup?: string;
  destination?: string;
  fare: number;
  at: number;
  live?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        live ? router.push("/ride") : router.push(`/ride?rideId=${id}`)
      }
      style={({ pressed }) => [
        styles.row,
        { opacity: pressed ? 0.75 : 1 },
      ]}
      accessibilityLabel={`${serviceLabel(bookingType, "commuter")} to ${shortAddress(destination)}, ${formatPeso(fare)}, ${whenLabel(at)}`}
    >
      <View style={{ flex: 1, gap: space.xs }}>
        <View style={styles.headline}>
          <Text style={[font.bodyStrong, { color: colors.ink }]}>
            {serviceLabel(bookingType, "commuter")}
          </Text>
          <Text style={[font.small, { color: colors.textFaint }]}>{code}</Text>
          <StatusPill status={status} />
        </View>
        <Text
          numberOfLines={1}
          style={[font.small, { color: colors.textMuted }]}
        >
          {shortAddress(pickup)} → {shortAddress(destination)}
        </Text>
        <View style={styles.headline}>
          <Text style={[font.small, { color: colors.textFaint }]}>
            {live ? titleCase(status) : whenLabel(at)}
          </Text>
          <Text style={[font.bodyStrong, { color: colors.ink }]}>
            {formatPeso(fare)}
          </Text>
        </View>
        {isOngoingStatus(status) ? (
          <Text style={[font.small, { color: colors.red }]}>View live trip</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: 0,
    minHeight: 66,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headline: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flexWrap: "wrap",
  },
});
