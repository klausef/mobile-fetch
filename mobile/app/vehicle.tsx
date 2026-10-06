import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { api, errorMessage } from "@/lib/shared";
import {
  Button,
  Card,
  Loading,
  Row,
  Screen,
  ScreenHeader,
  TextField,
} from "@/components/ui";
import { colors, font, scroll, space } from "@/lib/theme";

/**
 * The vehicle a passenger is told to look for.
 *
 * Make, model, colour and plate, because those four are exactly what somebody
 * standing at a roadside uses to pick one tricycle out of nine — and they are
 * shown to the commuter while the rider is on their way, so they have to be
 * right before the switch that lets them take trips is allowed to turn on.
 */
export default function VehicleScreen() {
  const profile = useQuery(api.profiles.getMyProfile);
  const rider = useQuery(api.riders.getMyRider);
  const saveVehicle = useMutation(api.riders.saveVehicle);

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [color, setColor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rider || rider.vehicle.make === "—") return;
    setMake(rider.vehicle.make);
    setModel(rider.vehicle.model);
    setPlate(rider.vehicle.plate);
    setColor(rider.vehicle.color);
  }, [rider]);

  if (profile === undefined) return <Loading label="Loading…" />;
  if (profile === null) return <Redirect href="/onboarding" />;
  if (profile.role !== "rider") return <Redirect href="/(tabs)/book" />;

  const complete =
    make.trim().length > 0 &&
    model.trim().length > 0 &&
    plate.trim().length > 0 &&
    color.trim().length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveVehicle({
        make: make.trim(),
        model: model.trim(),
        plate: plate.trim().toUpperCase(),
        color: color.trim(),
      });
      router.back();
    } catch (err) {
      setError(errorMessage(err, "Could not save the vehicle."));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen contentStyle={{ gap: scroll.cardGap }}>
        <ScreenHeader
          title="Your vehicle"
          subtitle="What your passenger is told to look for."
        />

        <Card>
          <TextField
            label="Make"
            value={make}
            onChangeText={setMake}
            placeholder="Honda"
            autoCapitalize="words"
          />
          <TextField
            label="Model"
            value={model}
            onChangeText={setModel}
            placeholder="TMX 125"
            autoCapitalize="characters"
          />
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}>
              <TextField
                label="Colour"
                value={color}
                onChangeText={setColor}
                placeholder="Blue"
                autoCapitalize="words"
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label="Plate"
                value={plate}
                onChangeText={setPlate}
                placeholder="KAB 1234"
                autoCapitalize="characters"
              />
            </View>
          </Row>
          {error ? (
            <Text style={[font.small, { color: colors.danger }]}>{error}</Text>
          ) : null}
          <Button
            label="Save vehicle"
            onPress={() => void submit()}
            disabled={!complete || busy}
            loading={busy}
            fullWidth
          />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
