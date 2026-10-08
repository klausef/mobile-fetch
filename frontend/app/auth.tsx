import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { errorMessage } from "@/shared";
import { Wordmark } from "@/components/brand";
import {
  Button,
  Card,
  Divider,
  Row,
  Screen,
  TextField,
} from "@/components/ui";
import { colors, font, radius, scroll, space, touch } from "@/theme";

/**
 * Sign in, sign up, or continue as a guest.
 *
 * One screen for all three, because the only difference the person cares about
 * is which button they pressed. The web build splits the same logic across an
 * email-code form and a password form; the phone keeps both, since a rider on a
 * prepaid SIM with no email app open is a real user of this screen.
 */
export default function AuthScreen() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const [mode, setMode] = useState<"password" | "code">("password");
  const [pwFlow, setPwFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<
    "none" | "password" | "send" | "verify" | "guest"
  >("none");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The root route decides where a fresh session goes — rider home or
    // commuter home — so this screen only has to hand the session over.
    if (isAuthenticated) router.replace("/");
  }, [isAuthenticated]);

  const submitPassword = async () => {
    setBusy("password");
    setError(null);
    try {
      await signIn("password", {
        email: email.trim(),
        password,
        flow: pwFlow,
      });
    } catch (err) {
      setError(errorMessage(err, "Those sign-in details were not accepted."));
      setBusy("none");
    }
  };

  const sendCode = async () => {
    setBusy("send");
    setError(null);
    try {
      await signIn("email-otp", { email: email.trim() });
      setCodeSent(true);
    } catch (err) {
      setError(errorMessage(err, "Failed to send the verification code."));
    } finally {
      setBusy("none");
    }
  };

  const verifyCode = async () => {
    setBusy("verify");
    setError(null);
    try {
      await signIn("email-otp", { email: email.trim(), code: code.trim() });
    } catch {
      setError(
        "That code is not correct. Check your email and try again.",
      );
      setBusy("none");
    }
  };

  const continueAsGuest = async () => {
    setBusy("guest");
    setError(null);
    try {
      await signIn("anonymous");
    } catch (err) {
      setError(errorMessage(err, "Could not continue as guest."));
      setBusy("none");
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
          <Wordmark size={46} />
          <Text
            style={[font.small, { color: colors.textMuted, textAlign: "center" }]}
            numberOfLines={2}
          >
            Sign in to book a ride, or continue as a guest.
          </Text>
        </View>

        <View style={styles.tabRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode("password");
              setError(null);
            }}
            style={[
              styles.tab,
              mode === "password" && styles.tabActive,
            ]}
          >
            <Text
              style={[
                font.label,
                {
                  color:
                    mode === "password" ? "#ffffff" : colors.textMuted,
                },
              ]}
            >
              Password
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode("code");
              setError(null);
            }}
            style={[
              styles.tab,
              mode === "code" && styles.tabActive,
            ]}
          >
            <Text
              style={[
                font.label,
                {
                  color:
                    mode === "code" ? "#ffffff" : colors.textMuted,
                },
              ]}
            >
              Email code
            </Text>
          </Pressable>
        </View>

        <Card>
          {mode === "password" ? (
            <View style={{ gap: space.md }}>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="you@example.com"
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••••"
                hint={
                  pwFlow === "signUp"
                    ? "At least 10 characters, with a letter and a number."
                    : undefined
                }
              />
              {error ? (
                <Text style={[font.small, { color: colors.danger }]}>
                  {error}
                </Text>
              ) : null}
              <Button
                label={pwFlow === "signUp" ? "Create account" : "Sign in"}
                onPress={() => void submitPassword()}
                loading={busy === "password"}
                disabled={!email.trim() || password.length < 6}
                fullWidth
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPwFlow(
                    pwFlow === "signUp" ? "signIn" : "signUp",
                  );
                  setError(null);
                }}
                style={styles.switcher}
              >
                <Text
                  style={[font.small, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {pwFlow === "signUp"
                    ? "Already have an account? "
                    : "No account yet? "}
                  <Text
                    style={{
                      color: colors.red,
                      fontWeight: "600",
                    }}
                  >
                    {pwFlow === "signUp" ? "Sign in" : "Create one"}
                  </Text>
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="you@example.com"
                editable={!codeSent}
              />
              {codeSent ? (
                <>
                  <TextField
                    label="6-digit code"
                    value={code}
                    onChangeText={(next) =>
                      setCode(next.replace(/\D/g, "").slice(0, 6))
                    }
                    keyboardType="number-pad"
                    placeholder="000000"
                    hint={`Sent to ${email.trim()}.`}
                  />
                  {error ? (
                    <Text style={[font.small, { color: colors.danger }]}>
                      {error}
                    </Text>
                  ) : null}
                  <Button
                    label="Verify and continue"
                    onPress={() => void verifyCode()}
                    loading={busy === "verify"}
                    disabled={code.length < 6}
                    fullWidth
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setCodeSent(false);
                      setCode("");
                      setError(null);
                    }}
                    style={styles.switcher}
                  >
                    <Text
                      style={[font.small, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      Use a different email
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {error ? (
                    <Text style={[font.small, { color: colors.danger }]}>
                      {error}
                    </Text>
                  ) : null}
                  <Button
                    label="Send code"
                    onPress={() => void sendCode()}
                    loading={busy === "send"}
                    disabled={!email.trim().includes("@")}
                    fullWidth
                  />
                </>
              )}
            </View>
          )}
        </Card>

        <Row gap={space.md} style={styles.orRow}>
          <Divider style={{ flex: 1 }} />
          <Text style={[font.small, { color: colors.textFaint }]}>or</Text>
          <Divider style={{ flex: 1 }} />
        </Row>

        <Button
          label="Continue as guest"
          variant="secondary"
          onPress={() => void continueAsGuest()}
          loading={busy === "guest"}
          fullWidth
        />
        <Text
          style={[
            font.small,
            { color: colors.textMuted, textAlign: "center" },
          ]}
          numberOfLines={2}
        >
          A guest session books rides immediately and can be upgraded to a full
          account later.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    gap: space.sm,
  },
  tab: {
    flex: 1,
    minHeight: touch.tapTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  switcher: {
    paddingVertical: space.xs,
    alignItems: "center",
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
