import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  type ViewStyle,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage, type Id } from "@/shared";
import { Loading } from "@/components/ui";
import { colors, font, radius, scroll, space, touch } from "@/theme";

/**
 * The thread attached to one trip.
 *
 * A chat is scoped to a ride rather than to a person on purpose: two strangers
 * with a common number would keep a channel open long after the fare was paid,
 * and everything either side needs to say — "I'm at the blue gate", "please
 * bring change" — is about the trip in front of them.
 */
export default function ChatScreen() {
  const params = useLocalSearchParams<{ rideId?: string }>();
  const rideId = (params.rideId ?? "") as Id<"rides">;

  const thread = useQuery(
    api.chat.listForRide,
    rideId ? { rideId } : "skip",
  );
  const send = useMutation(api.chat.send);
  const markRead = useMutation(api.chat.markRead);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = { current: null as FlatList | null };

  // Opening the thread is reading it; the badge on the tab clears from here
  // rather than from a separate "seen" tap nobody would make.
  useEffect(() => {
    if (rideId) void markRead({ rideId });
  }, [markRead, rideId]);

  if (thread === undefined)
    return <Loading label="Opening the chat…" />;

  const submit = async (body: string) => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await send({ rideId, body: text });
      setDraft("");
    } catch (err) {
      setError(errorMessage(err, "Could not send that message."));
    } finally {
      setBusy(false);
    }
  };

  const quickReplies =
    thread.myRole === "commuter"
      ? [
          "I'm at the pick-up point.",
          "Please wait a moment.",
          "Thank you!",
        ]
      : ["I'm on my way.", "I've arrived.", "Please meet me at the gate."];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ChatBody
        thread={thread}
        draft={draft}
        setDraft={setDraft}
        submit={submit}
        busy={busy}
        error={error}
        quickReplies={quickReplies}
        listRef={listRef}
      />
    </KeyboardAvoidingView>
  );
}

/**
 * The thread, in the shape this screen paints.
 *
 * Structural rather than inferred from the query hook: a helper that *calls*
 * `useQuery` to borrow its return type is a hook called outside a component,
 * which is exactly the sort of thing that renders fine once and then breaks on
 * a re-mount.
 */
interface ThreadShape {
  rideId: string;
  cancelled: boolean;
  counterpartyName: string;
  /** "commuter" or "rider" — the server's answer, used only to pick replies. */
  myRole: string;
  messages: Array<{
    _id: string;
    body: string;
    kind: "user" | "system";
    mine: boolean;
    senderName: string;
  }>;
}

function ChatBody({
  thread,
  draft,
  setDraft,
  submit,
  busy,
  error,
  quickReplies,
  listRef,
}: {
  thread: ThreadShape;
  draft: string;
  setDraft: (next: string) => void;
  submit: (body: string) => Promise<void>;
  busy: boolean;
  error: string | null;
  quickReplies: string[];
  listRef: { current: FlatList | null };
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={thread.messages}
        keyExtractor={(message) => message._id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: space.lg,
          paddingBottom: space.xxl,
          gap: space.sm,
        }}
        renderItem={({ item: message }) => <Message message={message} />}
        ListEmptyComponent={
          <View style={{ height: 120 }} />
        }
      />

      {thread.messages.length === 0 ? null : (
        <View style={styles.dateStamp}>
          <Text style={[font.tiny, { color: colors.textFaint }]}>
            {thread.myRole === "commuter" ? "You" : thread.counterpartyName} joined the chat
          </Text>
        </View>
      )}

      {error ? (
        <Text style={[font.small, { color: colors.danger }]}>{error}</Text>
      ) : null}

      {!thread.cancelled && thread.messages.length > 0 ? (
        <View
          style={[
            styles.inputBar,
            { paddingBottom: insets.bottom + 4 },
          ]}
        >
          <QuickReplies quickReplies={quickReplies} onPick={submit} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message about this trip…"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => {
              if (draft.trim()) {
                submit(draft);
              }
            }}
          />
          <Pressable
            onPress={() => {
              if (draft.trim()) submit(draft);
            }}
            disabled={busy || draft.trim().length === 0}
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  busy || draft.trim().length === 0
                    ? colors.muted
                    : colors.red,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Ionicons
              name="send"
              size={18}
              color={colors.ink}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Message({ message }: { message: ThreadShape["messages"][0] }) {
  return (
    <View
      style={[
        styles.bubble,
        message.mine ? styles.mine : styles.their,
      ]}
    >
      {message.kind === "system" ? (
        <Text style={[font.small, { color: colors.textFaint }]}>
          {message.body}
        </Text>
      ) : (
        <>
          <Text style={[font.tiny, { color: colors.textFaint }]}>
            {message.senderName}
          </Text>
          <View style={{ gap: 2 }}>
            <Text
              style={[
                font.body,
                {
                  color: message.mine ? colors.ink : colors.ink,
                },
              ]}
              numberOfLines={4}
            >
              {message.body}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function QuickReplies({
  quickReplies,
  onPick,
}: {
  quickReplies: string[];
  onPick: (text: string) => void;
}) {
  if (quickReplies.length === 0) return null;
  return (
    <View style={styles.quickReplies}>
      {quickReplies.map((reply) => (
        <Pressable
          key={reply}
          onPress={() => onPick(reply)}
          style={({ pressed }) => [
            styles.quickReply,
            { opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Text
            style={[font.small, { color: colors.ink }]}
            numberOfLines={1}
          >
            {reply}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dateStamp: {
    alignSelf: "center",
    marginVertical: space.sm,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    minHeight: touch.minHeight,
    maxHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    color: colors.ink,
    fontSize: 15,
    textAlignVertical: "top",
  },
  sendButton: {
    width: touch.tapTarget,
    height: touch.tapTarget,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  quickReplies: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  quickReply: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    maxWidth: "50%",
    minHeight: touch.tapTarget,
    alignItems: "center",
  },
  bubble: {
    maxWidth: "82%",
    padding: space.md,
    borderRadius: radius.lg,
    gap: 2,
  },
  mine: {
    backgroundColor: colors.ink,
    alignSelf: "flex-end",
  },
  their: {
    backgroundColor: colors.muted,
    alignSelf: "flex-start",
  },
});
