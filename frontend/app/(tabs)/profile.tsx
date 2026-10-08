import { Ionicons } from "@expo/vector-icons";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";import {
  api,
  countLabel,
  durationFromMs,
  errorMessage,
  formatPeso,
  initials,
  isValidPassengerPhone,
  roleLabel,
} from "@/shared";
import {
  Button,
  Card,
  Divider,
  Loading,
  Row,
  Screen,
  ScreenHeader,
  TextField,
} from "@/components/ui";
import {
  colors,
  font,
  radius,
  scroll,
  space,
} from "@/theme";

/**
 * The account, and the two things only this screen can do.
 *
 * `updateMyProfile` writes the name and number a rider reads out at a junction,
 * and `setEmergencyContact` writes who to call if the person in the car cannot
 * answer their phone. Both are worth a real form rather than a settings list,
 * because both are read by a stranger at the worst possible moment.
 */
export default function ProfileScreen() {
  const profile = useQuery(api.profiles.getMyProfile);
  const guest = useQuery(api.profiles.isGuest);
  const rider = useQuery(api.riders.getMyRider);
  const earnings = useQuery(api.rides.riderEarnings);
  const driverStats = useQuery(api.riders.getDriverStats);

  const updateMyProfile = useMutation(api.profiles.updateMyProfile);
  const setEmergencyContact = useMutation(api.profiles.setEmergencyContact);
  const { signOut } = useAuthActions();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState<"profile" | "emergency" | "signout" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Seed the forms once the profile arrives, without fighting the person typing.
  useEffect(() => {
    if (!profile || editOpen) return;
    setName(profile.name);
    setPhone(profile.phone);
  }, [profile, editOpen]);

  useEffect(() => {
    if (!profile) return;
    setEmergencyName(profile.emergencyName ?? "");
    setEmergencyPhone(profile.emergencyPhone ?? "");
  }, [profile]);

  if (profile === undefined) return <Loading label="Loading your profile…" />;
  if (profile === null) return <Redirect href="/onboarding" />;

  const phoneOk = isValidPassengerPhone(phone);
  const nameOk = name.trim().length >= 2;
  const emergencyPair =
    emergencyName.trim().length > 0 && emergencyPhone.trim().length > 0;

  const saveProfile = async () => {
    setBusy("profile");
    setError(null);
    try {
      await updateMyProfile({ name: name.trim(), phone: phone.trim() });
      setSaved("Details saved.");
      setEditOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Could not save your details."));
    } finally {
      setBusy(null);
    }
  };

  const saveEmergency = async () => {
    setBusy("emergency");
    setError(null);
    try {
      await setEmergencyContact({
        name: emergencyName.trim() || undefined,
        phone: emergencyPhone.trim() || undefined,
      });
      setSaved("Emergency contact saved.");
    } catch (err) {
      setError(errorMessage(err, "Could not save the emergency contact."));
    } finally {
      setBusy(null);
    }
  };

  const leave = async () => {
    setBusy("signout");
    setError(null);
    try {
      await signOut();
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err, "Could not sign out."));
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen contentStyle={{ gap: scroll.cardGap }}>
        <ScreenHeader title="Profile" subtitle={roleLabel(profile.role)} />

        <Card>
          <Row gap={space.md}>
            <View style={styles.avatar}>
              <Text style={[font.title, { color: "#ffffff" }]}>
                {initials(profile.name)}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[font.heading, { color: colors.ink }]}>{profile.name}</Text>
              <Text style={[font.small, { color: colors.textMuted }]}>
                {profile.phone || "No number on file"}
              </Text>
              {guest ? (
                <Text style={[font.small, { color: colors.warning }]}>
                  Guest session — add an email and password to keep this account.
                </Text>
              ) : null}
            </View>
          </Row>
          <Divider />
          {editOpen ? (
            <>
              <TextField
                label="Full name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                error={nameOk ? null : "Enter at least two characters."}
              />
              <TextField
                label="Mobile number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                error={phoneOk ? null : "Use a number a rider can dial, e.g. 09XX XXX XXXX."}
              />
              <Row gap={space.sm}>
                <Button
                  label="Save"
                  onPress={() => void saveProfile()}
                  disabled={!nameOk || !phoneOk || busy !== null}
                  loading={busy === "profile"}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={() => {
                    setEditOpen(false);
                    setName(profile.name);
                    setPhone(profile.phone);
                  }}
                />
              </Row>
            </>
          ) : (
            <Button
              label="Edit my details"
              variant="secondary"
              icon="create"
              onPress={() => setEditOpen(true)}
            />
          )}
        </Card>

        <Card>
          <Text style={[font.label, { color: colors.textMuted }]}>
            Emergency contact
          </Text>
          <Text style={[font.small, { color: colors.textMuted }]}>
            Given to your rider during a trip only. Leave both blank to remove
            it — a name with no number is not a contact.
          </Text>
          <TextField
            label="Name"
            value={emergencyName}
            onChangeText={setEmergencyName}
            autoCapitalize="words"
            placeholder="Ate Lina"
          />
          <TextField
            label="Mobile number"
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
            keyboardType="phone-pad"
            placeholder="09XX XXX XXXX"
          />
          <Button
            label="Save contact"
            variant="secondary"
            onPress={() => void saveEmergency()}
            disabled={
              busy !== null ||
              (emergencyName.trim().length > 0) !== (emergencyPhone.trim().length > 0) ||
              (emergencyPair && !isValidPassengerPhone(emergencyPhone))
            }
            loading={busy === "emergency"}
          />
        </Card>

        {profile.role === "rider" ? (
          <Card>
            <Text style={[font.label, { color: colors.textMuted }]}>Driving</Text>
            <Row gap={space.sm}>
              <Text style={[font.bodyStrong, { color: colors.ink }]}>
                {rider?.vehicle.make && rider.vehicle.make !== "—"
                  ? `${rider.vehicle.make} ${rider.vehicle.model} · ${rider.vehicle.plate}`
                  : "No vehicle yet"}
              </Text>
            </Row>
            {driverStats ? (
              <Row gap={space.lg}>
                <Stat
                  label="Rating"
                  value={
                    driverStats.rating
                      ? `${driverStats.rating.avg.toFixed(1)} ★`
                      : "—"
                  }
                />
                <Stat
                  label="Trips"
                  value={String(driverStats.completedCount)}
                />
                <Stat
                  label="Online today"
                  value={durationFromMs(driverStats.onlineMsToday)}
                />
              </Row>
            ) : null}
            {earnings ? (
              <Text style={[font.small, { color: colors.textMuted }]}>
                Earned today {formatPeso(earnings.today)} from{" "}
                {countLabel(earnings.todayCount, "trip")} · this week{" "}
                {formatPeso(earnings.week)}
              </Text>
            ) : null}
            <Row gap={space.sm}>
              <Button
                label="Open driver screen"
                variant="secondary"
                onPress={() => router.push("/rider")}
                style={{ flex: 1 }}
              />
              <Button
                label="Vehicle"
                variant="ghost"
                onPress={() => router.push("/vehicle")}
              />
            </Row>
          </Card>
        ) : null}

        {profile.role === "admin" ? (
          <Card tone="warm">
            <Text style={[font.bodyStrong, { color: colors.ink }]}>
              Fetch team account
            </Text>
            <Text style={[font.small, { color: colors.textMuted }]}>
              The console is on the web dashboard — riders, tariffs, tickets and
              broadcasts all live there.
            </Text>
          </Card>
        ) : null}

        {saved ? (
          <Row gap={space.sm}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={[font.small, { color: colors.success }]}>{saved}</Text>
          </Row>
        ) : null}
        {error ? (
          <Text style={[font.small, { color: colors.danger }]}>{error}</Text>
        ) : null}

        <Button
          label="Sign out"
          variant="danger"
          icon="log-out"
          onPress={() => void leave()}
          loading={busy === "signout"}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={[font.tiny, { color: colors.textFaint, textTransform: "uppercase" }]}>
        {label}
      </Text>
      <Text style={[font.bodyStrong, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
});
