import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, errorMessage, isValidPassengerPhone } from "@/shared";
import { Wordmark } from "@/components/brand";
import { Button, Card, Row, Screen, TextField } from "@/components/ui";
import {
  colors,
  font,
  radius,
  scroll,
  space,
  touch,
} from "@/theme";

/**
 * The one screen between a session and a usable account.
 *
 * The role is asked *here* rather than inferred, because the two answers lead
 * to genuinely different apps: a commuter books, a rider drives, and a phone
 * cannot show both to someone who has not said which they are. It is asked once
 * — the profile row is written on submit and every later screen reads it.
 */
export default function OnboardingScreen() {
  const profile = useQuery(api.profiles.getMyProfile);
  const createProfile = useMutation(api.profiles.createProfile);

  const [role, setRole] = useState<"commuter" | "rider">("commuter");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A profile already exists — a guest who just signed up, or a second visit
  // to this screen. There is nothing to create, so the gate sends them on.
  if (profile) {
    return (
      <Screen>
        <Wordmark size={48} />
        <Card>
          <Text style={[font.heading, { color: colors.ink }]}>
            Your account is ready, {profile.name.split(" ")[0]}.
          </Text>
          <Text
            style={[font.small, { color: colors.textMuted }]}
            numberOfLines={2}
          >
            You are signed in as{" "}
            {profile.role === "rider" ? "a rider" : "a commuter"}.
          </Text>
          <Button label="Continue" onPress={() => router.replace("/")} />
        </Card>
      </Screen>
    );
  }

  const nameOk = name.trim().length >= 2;
  const phoneOk = isValidPassengerPhone(phone);
  const canSubmit = nameOk && phoneOk && !busy;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await createProfile({
        role,
        name: name.trim(),
        phone: phone.trim(),
      });
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err, "Could not save your details."));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen
        scroll={false}
        contentStyle={{ gap: scroll.cardGap, paddingTop: scroll.cardGap * 2 }}
      >
        <View style={{ alignItems: "center", gap: space.sm }}>
          <Wordmark size={48} />
          <Text
            style={[font.small, { color: colors.textMuted, textAlign: "center" }]}
            numberOfLines={3}
          >
            Two details and you are riding. The rider who picks you up sees the
            name and number you give here.
          </Text>
        </View>

        <Card>
          <Text style={[font.label, { color: colors.textMuted }]}>I am</Text>
          <Row gap={space.sm}>
            <RoleCard
              active={role === "commuter"}
              icon="person"
              title="Riding"
              body="Book tricycles, motorcycles and cars."
              onPress={() => setRole("commuter")}
            />
            <RoleCard
              active={role === "rider"}
              icon="car-sport"
              title="Driving"
              body="Take trips and carry passengers."
              onPress={() => setRole("rider")}
            />
          </Row>
          {role === "rider" ? (
            <Text
              style={[font.small, { color: colors.textMuted }]}
              numberOfLines={2}
            >
              Riders add a vehicle next and, while FETCH is in trial, start
              carrying passengers right away.
            </Text>
          ) : null}
        </Card>

        <Card>
          <TextField
            label="Full name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="Juan dela Cruz"
            hint="Shown to the rider carrying you."
          />
          <TextField
            label="Mobile number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="09XX XXX XXXX"
            hint="Used for calls about a trip, never shown publicly."
          />
          {error ? (
            <Text style={[font.small, { color: colors.danger }]}>{error}</Text>
          ) : null}
          <Button
            label={role === "rider" ? "Start driving" : "Start riding"}
            onPress={() => void submit()}
            disabled={!canSubmit}
            loading={busy}
            fullWidth
          />
        </Card>

        <Text
          style={[font.small, { color: colors.textFaint, textAlign: "center" }]}
          numberOfLines={2}
        >
          You can switch to driving later from your profile.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function RoleCard({
  active,
  icon,
  title,
  body,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.role,
        {
          backgroundColor: active ? colors.ink : colors.muted,
          borderColor: active ? colors.ink : colors.border,
          opacity: pressed ? 0.86 : 1,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={active ? colors.gold : colors.red}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[
            font.bodyStrong,
            { color: active ? "#ffffff" : colors.ink },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[
            font.small,
            { color: active ? colors.textFaint : colors.textMuted },
          ]}
          numberOfLines={2}
        >
          {body}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  role: {
    flex: 1,
    minHeight: touch.tapTarget + 8,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    gap: 4,
    alignItems: "flex-start",
  },
});
