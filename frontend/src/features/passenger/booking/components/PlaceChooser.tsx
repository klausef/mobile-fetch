import { Pressable, Text, View } from "react-native";
import { MapPin } from "lucide-react-native";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { colors } from "@/theme/colors";
import { MOCK_LOCATIONS } from "@/data/mock/locations";
import type { Location } from "@/types";

/**
 * The place chooser: a search box over the mock catalogue. It is a plain list
 * on purpose — no map needed to pick a named place, and the map is still
 * there on the tracking screen.
 */
export function PlaceChooser({
  query,
  onQueryChange,
  onPick,
  excludeId,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onPick: (location: Location) => void;
  excludeId?: string | null;
}) {
  return (
    <Card className="gap-3">
      <Input
        label="Search places"
        value={query}
        onChangeText={onQueryChange}
        placeholder="Terminal, market, mall…"
        autoFocus
      />
      <View className="gap-2">
        {PLACE_OPTIONS(query, excludeId).map((location) => (
          <Pressable
            key={location.id}
            accessibilityRole="button"
            onPress={() => onPick(location)}
            className="flex-row items-center gap-3 rounded-xl border border-line p-3 active:bg-paper"
          >
            <MapPin size={16} color={colors.muted} />
            <View className="flex-1">
              <Text className="font-medium text-ink">{location.name}</Text>
              <Text className="text-xs text-muted">{location.address}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

/** Local filtering over the mock catalogue; a real app calls geocoding. */
function PLACE_OPTIONS(query: string, excludeId?: string | null): Location[] {
  const needle = query.trim().toLowerCase();
  return MOCK_LOCATIONS.filter(
    (location) =>
      location.id !== excludeId &&
      (needle === "" ||
        location.name.toLowerCase().includes(needle) ||
        location.address.toLowerCase().includes(needle)),
  ).slice(0, 5);
}
