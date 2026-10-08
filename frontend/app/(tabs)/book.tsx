import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Text } from "react-native";
import {
  api,
  canBookForPassenger,
  DEFAULT_RIDE_TYPE,
  DEFAULT_WHO_IS_RIDING,
  errorMessage,
  fareBreakdown,
  formatPeso,
  formatSurge,
  haversineKm,
  isSurgeActive,
  resolveBillableKm,
  serviceLabel,
  shortAddress,
  validatePassenger,
  type BookingType,
  type RideType,
  type WhoIsRidingValue,
} from "@/shared";
import { clearDraft, setDraftPoint, useBookingDraft } from "@/store/booking-draft";
import { drivingDistanceKm, hasRoadRouting } from "@/services/maps/routing";
import { FareCard, PointRow, RideTypePicker } from "@/components/ride";
import {
  Between,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Loading,
  Pill,
  Row,
  Screen,
  ScreenHeader,
  TextField,
} from "@/components/ui";
import { colors, font, scroll, space } from "@/theme";

/**
 * The booking screen: where a commuter turns two points into a request.
 *
 * Everything on it is one of three things — where you are going, what is
 * carrying you, and what it costs — and the fare shown is built by the same
 * `fareBreakdown` the server charges with, from the same road distance, so the
 * number under the button is the number on the receipt.
 */
export default function BookScreen() {
  const profile = useQuery(api.profiles.getMyProfile);
  const tariff = useQuery(api.tariffs.getActiveTariff);
  const surge = useQuery(api.rides.getSurge);
  const activeRide = useQuery(api.rides.getActiveRide);
  const saved = useQuery(api.savedPlaces.listMine);
  const requestRide = useMutation(api.rides.requestRide);

  const draft = useBookingDraft();
  const { pickup, destination } = draft;

  const [bookingType, setBookingType] = useState<BookingType>("ride");
  const [rideType, setRideType] = useState<RideType>(DEFAULT_RIDE_TYPE);
  const [who, setWho] = useState<WhoIsRidingValue>(DEFAULT_WHO_IS_RIDING);
  const [itemsText, setItemsText] = useState("");
  const [budgetText, setBudgetText] = useState("");
  const [notes, setNotes] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [roadKm, setRoadKm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeWarning, setStoreWarning] = useState(false);

  // The road distance, fetched after the two ends stop changing. A straight
  // line would understate a highway trip by a third, so the quote waits a beat
  // for the real one rather than pricing the ruler first and correcting after.
  useEffect(() => {
    if (!pickup || !destination) {
      setRoadKm(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void drivingDistanceKm(pickup, destination).then((km) => {
        if (!cancelled) setRoadKm(km);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickup, destination]);

  const isErrand = bookingType !== "ride";
  const straightKm = useMemo(
    () => (pickup && destination ? haversineKm(pickup, destination) : 0),
    [pickup, destination],
  );
  const billableKm = resolveBillableKm(straightKm, roadKm);
  const items = useMemo(() => parseItems(itemsText), [itemsText]);
  const passengerErrors = validatePassenger(who);

  const quote = useMemo(() => {
    if (!tariff) return null;
    return fareBreakdown({
      distanceKm: billableKm,
      rideType,
      tariff,
      surgeMultiplier: surge?.multiplier,
      isErrand,
    });
  }, [billableKm, isErrand, rideType, surge, tariff]);

  if (profile === undefined) return <Loading label="Opening Fetch…" />;
  if (profile === null) return <Redirect href="/onboarding" />;
  // A rider cannot request rides — the server would refuse it — so the booking
  // tab is their drive screen instead of a form that always fails.
  if (profile.role === "rider") return <Redirect href="/rider" />;

  // A pabili carries its shopping list as free text; a padala carries named
  // items. The server enforces the same split, and refusing here beats a
  // round trip that comes back as an error.
  const errandReady =
    bookingType === "ride"
      ? true
      : bookingType === "pabili"
        ? notes.trim().length > 0
        : items.length > 0;

  const ready =
    pickup !== null &&
    destination !== null &&
    canBookForPassenger(who) &&
    errandReady &&
    !busy;

  const submit = async (confirmStorePin = false) => {
    if (!pickup || !destination) return;
    setBusy(true);
    setError(null);
    setStoreWarning(false);
    try {
      const budget = Number.parseFloat(
        budgetText.replace(/[^\\d.]/g, ""),
      );
      await requestRide({
        pickup: {
          lat: pickup.lat,
          lng: pickup.lng,
          address: pickup.address,
        },
        destination: {
          lat: destination.lat,
          lng: destination.lng,
          address: destination.address,
        },
        bookingType,
        rideType,
        routeDistanceKm: roadKm ?? undefined,
        items: bookingType === "padala" || items.length > 0 ? items : undefined,
        itemBudget:
          isErrand &&
          Number.isFinite(budget) &&
          budget > 0
            ? Math.min(budget, 50000)
            : undefined,
        notes: notes.trim() || undefined,
        // The server refuses a store pin sitting on the drop-off unless the
        // commuter has seen the warning and said go ahead. This is that yes.
        storePinConfirmed: confirmStorePin || undefined,
        recipientName:
          bookingType === "padala" ? recipientName.trim() || undefined : undefined,
        recipientPhone:
          bookingType === "padala" ? recipientPhone.trim() || undefined : undefined,
        passengerType: who.passengerType,
        passengerName:
          who.passengerType === "other" ? who.passengerName.trim() : undefined,
        passengerPhone:
          who.passengerType === "other" ? who.passengerPhone.trim() : undefined,
      });
      clearDraft();
      // The request is live the moment it is written, so the screen hands over
      // to the trip rather than staying on a form that can no longer be used.
      router.push("/ride");
    } catch (err) {
      const message = errorMessage(err, "Could not send the request. Try again.");
      setError(message);
      setStoreWarning(/confirm to continue anyway/i.test(message));
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
          title="Book a ride"
          subtitle={`Hello, ${profile.name.split(" ")[0]}.`}
        />

        {activeRide ? (
          <Card tone="brand">
            <Between>
              <Text style={[font.heading, { color: "#ffffff" }]}>
                You have a trip in progress
              </Text>
              <Pill label={activeRide.ride.code} tone="gold" />
            </Between>
            <Text style={[font.small, { color: "#cfc6c5" }]}>
              {shortAddress(activeRide.ride.pickup.address)} →{" "}
              {shortAddress(activeRide.ride.destination.address)}
            </Text>
            <Button
              label="Track your ride"
              variant="gold"
              onPress={() => router.push("/ride")}
              fullWidth
            />
          </Card>
        ) : null}

        <Row gap={space.sm}>
          {(["ride", "pabili", "padala"] as BookingType[]).map((type) => (
            <Chip
              key={type}
              label={serviceLabel(type, "commuter")}
              active={bookingType === type}
              onPress={() => setBookingType(type)}
              icon={type === "ride" ? "car-sport" : "basket"}
            />
          ))}
        </Row>

        <Card>
          <PointRow
            kind="pickup"
            caption={pickup ? shortAddress(pickup.address) : "Not set"}
            onPress={() => router.push("/place?field=pickup")}
          />
          <Divider />
          <PointRow
            kind="destination"
            caption={destination ? shortAddress(destination.address) : "Not set"}
            onPress={() => router.push("/place?field=destination")}
          />
          {saved && saved.length > 0 && !destination ? (
            <>
              <Divider />
              <Text
                style={[
                  font.tiny,
                  { color: colors.textFaint, textTransform: "uppercase" },
                ]}
              >
                Saved places
              </Text>
              <Row gap={space.sm} wrap style={{ flexWrap: "wrap" }}>
                {saved.map((place) => (
                  <Chip
                    key={place._id}
                    label={place.label}
                    icon="bookmark"
                    onPress={() =>
                      setDraftPoint("destination", {
                        lat: place.lat,
                        lng: place.lng,
                        address: place.address,
                      })
                    }
                  />
                ))}
              </Row>
            </>
          ) : null}
        </Card>

        <RideTypePicker value={rideType} onChange={setRideType} />

        {isErrand ? (
          <Card>
            {bookingType === "pabili" ? (
              <>
                {/* Pabili's shopping list is free text: the rider reads it at
                    the market, and a structured form is the wrong shape for
                    "a kilo of tomatoes, ripe ones". */}
                <TextField
                  label="What to buy"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Bigas, eggs, and a kilo of tomatoes"
                  multiline
                  hint="Your rider shops from this list."
                  error={notes.trim().length > 0 ? null : "Tell your rider what to buy."}
                />
                <TextField
                  label="Item list (optional)"
                  value={itemsText}
                  onChangeText={setItemsText}
                  placeholder={"one item per line\nbigas x2\nsoftdrinks"}
                  multiline
                  hint="Add a quantity with ×, e.g. “eggs x12”."
                />
              </>
            ) : (
              <>
                <TextField
                  label="What to send"
                  value={itemsText}
                  onChangeText={setItemsText}
                  placeholder={"one item per line\npamphlet x2"}
                  multiline
                  hint="Add a quantity with ×, e.g. “boxes x3”."
                  error={items.length > 0 ? null : "Tell your rider what to pick up."}
                />
                <TextField
                  label="Who receives it"
                  value={recipientName}
                  onChangeText={setRecipientName}
                  autoCapitalize="words"
                  placeholder="Maria"
                />
                <TextField
                  label="Their mobile number"
                  value={recipientPhone}
                  onChangeText={setRecipientPhone}
                  keyboardType="phone-pad"
                  placeholder="09XX XXX XXXX"
                />
                <TextField
                  label="Notes for the rider (optional)"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Blue gate beside the sari-sari store"
                />
              </>
            )}
            <TextField
              label="Cash to hand the rider (optional)"
              value={budgetText}
              onChangeText={setBudgetText}
              keyboardType="decimal-pad"
              placeholder="500"
              hint="The rider spends up to this and reports back what it cost."
            />
          </Card>
        ) : null}

        <Card>
          <Text style={[font.label, { color: colors.textMuted }]}>Who is riding</Text>
          <Row gap={space.sm}>
            <Chip
              label="Me"
              active={who.passengerType === "self"}
              onPress={() => setWho({ ...who, passengerType: "self" })}
            />
            <Chip
              label="Someone else"
              active={who.passengerType === "other"}
              onPress={() => setWho({ ...who, passengerType: "other" })}
            />
          </Row>
          {who.passengerType === "other" ? (
            <>
              <TextField
                label="Passenger's name"
                value={who.passengerName}
                onChangeText={(text) =>
                  setWho({ ...who, passengerName: text })
                }
                autoCapitalize="words"
                placeholder="Juan dela Cruz"
                error={passengerErrors.name ?? null}
              />
              <TextField
                label="Passenger's mobile number"
                value={who.passengerPhone}
                onChangeText={(text) =>
                  setWho({ ...who, passengerPhone: text })
                }
                keyboardType="phone-pad"
                placeholder="09XX XXX XXXX"
                error={passengerErrors.phone ?? null}
              />
              <Text style={[font.small, { color: colors.textMuted }]}>
                Your rider calls this number at the pick-up, so it has to be the
                person actually getting in.
              </Text>
            </>
          ) : null}
        </Card>

        {surge && isSurgeActive(surge.multiplier) ? (
          <Card tone="warm">
            <Row gap={space.sm}>
              <Ionicons name="trending-up" size={18} color={colors.warning} />
              <Text style={[font.bodyStrong, { color: colors.warning }]}>
                Demand is high right now {formatSurge(surge.multiplier)}
              </Text>
            </Row>
            <Text style={[font.small, { color: colors.textMuted }]}>
              Fares are higher while few riders are free. Waiting a few minutes
              usually brings it back down.
            </Text>
          </Card>
        ) : null}

        {pickup && destination && quote && tariff ? (
          <FareCard
            distanceKm={billableKm}
            rideType={rideType}
            tariff={tariff}
            surgeMultiplier={surge?.multiplier}
            isErrand={isErrand}
          />
        ) : (
          <EmptyState
            icon="pin"
            title="Set both ends to see the fare"
            body={
              pickup
                ? "Now tap Destination."
                : hasRoadRouting
                  ? "Tap Pick-up to search, or use your current location."
                  : "Tap Pick-up to search, or use your current location. Road routing is off on this build, so trips are priced on the straight-line distance."
            }
          />
        )}

        {storeWarning ? (
          <Card tone="warm">
            <Text style={[font.bodyStrong, { color: colors.ink }]}>
              That pin is very close to the drop-off
            </Text>
            <Text style={[font.small, { color: colors.textMuted }]}>
              {error}
            </Text>
            <Button
              label="Book anyway"
              variant="secondary"
              onPress={() => void submit(true)}
              loading={busy}
              fullWidth
            />
          </Card>
        ) : error ? (
          <Text style={[font.small, { color: colors.danger }]}>{error}</Text>
        ) : null}

        <Button
          label={
            quote
              ? `Request ${serviceLabel(bookingType, "commuter")} · ${formatPeso(quote.total)}`
              : `Request ${serviceLabel(bookingType, "commuter")}`
          }
          onPress={() => void submit()}
          disabled={!ready}
          loading={busy}
          fullWidth
        />
        <Text
          style={[
            font.small,
            { color: colors.textFaint, textAlign: "center" },
          ]}
          numberOfLines={2}
        >
          Cash is paid directly to the rider. The fare you see here is the fare
          on the receipt.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

/**
 * One `name ×qty` line per item, clamped to what the server accepts.
 */
function parseItems(text: string): { name: string; qty: number }[] {
  return text
    .split("\\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 20)
    .map((line) => {
      const match = line.match(/^(.*?)(?:\\s*[x×]\\s*(\\d{1,3}))?$/);
      const name = (match?.[1] ?? line).trim() || line;
      const qty = Math.min(
        99,
        Math.max(1, Number.parseInt(match?.[2] ?? "1", 10) || 1),
      );
      return { name: name.slice(0, 80), qty };
    });
}
