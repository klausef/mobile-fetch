import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api, serviceLabel, titleCase } from "@/shared";
import { whenLabel } from "@/utils/format";
import { EmptyState, Loading, Screen, ScreenHeader } from "@/components/ui";
import { colors, font, scroll, space } from "@/theme";

/**
 * The conversations a trip produced.
 *
 * A thread only exists once somebody has written in it — a ride with no
 * messages is not a conversation yet — so an empty list here is the normal
 * state of an account that has never needed to ask its rider anything.
 */
export default function ChatsScreen() {
  const threads = useQuery(api.chat.listThreads);

  if (threads === undefined)
    return <Loading label="Loading your chats…" />;

  return (
    <Screen contentStyle={{ gap: scroll.cardGap }}>
      <ScreenHeader
        title="Chats"
        subtitle={
          threads.length === 0
            ? "Talk to your rider on any trip."
            : `${threads.length} conversation${threads.length === 1 ? "" : "s"}.`
        }
      />

      {threads.map((thread) => (
        <Pressable
          key={thread.rideId}
          accessibilityRole="button"
          onPress={() => router.push(`/chat?rideId=${thread.rideId}`)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed ? colors.muted : colors.card,
            },
          ]}
          accessibilityLabel={`${thread.counterpartyName}, ${thread.lastMessage ?? ""}, ${whenLabel(thread.lastMessageAt)}`}
        >
          <View style={styles.avatar}>
            <Ionicons name="chatbubble-ellipses" size={18} color={colors.red} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.headline}>
              <Text
                numberOfLines={1}
                style={[
                  font.bodyStrong,
                  { color: colors.ink, flexShrink: 1 },
                ]}
              >
                {thread.counterpartyName}
              </Text>
              {thread.unread ? <View style={styles.unreadDot} /> : null}
              <View style={{ flex: 1 }} />
              <Text style={[font.small, { color: colors.textFaint }]}>
                {whenLabel(thread.lastMessageAt)}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={[font.small, { color: colors.textMuted }]}
            >
              {thread.lastMessageMine ? "You: " : ""}
              {thread.lastMessage}
            </Text>
            <Text style={[font.small, { color: colors.textFaint }]}>
              {serviceLabel(thread.bookingType, "commuter")} · {thread.code} ·{" "}
              {titleCase(thread.status)}
            </Text>
          </View>
        </Pressable>
      ))}

      {threads.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No conversations yet"
          body="Once you or your rider sends a message about a trip, the thread appears here."
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 74,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headline: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
  },
});
