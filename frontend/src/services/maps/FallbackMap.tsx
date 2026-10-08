import { Text, View } from "react-native";
import { MapPin } from "lucide-react-native";
import { colors } from "@/theme/colors";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  OSM_ATTRIBUTION,
  type MapMarker,
  type MapSurfaceProps,
} from "./mapProvider";

/**
 * The placeholder surface.
 *
 * It says what a real map would show — the pins and the line between them —
 * in plain rows, so a build without the native MapLibre SDK (Expo Go, a CI
 * bundle, a web preview) still demonstrates every screen end to end instead
 * of showing a grey rectangle.
 */

const PIN_LABELS: Record<MapMarker["kind"], string> = {
  pickup: "Pickup",
  destination: "Destination",
  rider: "Rider",
};

export function FallbackMap({
  markers = [],
  center = DEFAULT_CENTER,
  zoomLevel = DEFAULT_ZOOM,
  className,
}: MapSurfaceProps) {
  return (
    <View className={`rounded-2xl border border-line bg-infoSoft ${className ?? ""}`}>
      <View className="flex-row items-center justify-between px-4 pt-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-info">
          Map preview
        </Text>
        <Text className="text-[10px] text-muted">
          {center[1].toFixed(4)}, {center[0].toFixed(4)} · z{zoomLevel}
        </Text>
      </View>

      <View className="gap-2 p-4">
        {markers.length === 0 ? (
          <Text className="text-sm text-muted">
            No points set yet — the map draws pickup and destination once you choose them.
          </Text>
        ) : (
          markers.map((marker) => (
            <View key={marker.id} className="flex-row items-center gap-2">
              <MapPin size={16} color={colors.info} />
              <Text className="text-sm font-medium text-ink">
                {PIN_LABELS[marker.kind]}:
              </Text>
              <Text className="flex-1 text-sm text-muted" numberOfLines={1}>
                {marker.label}
              </Text>
            </View>
          ))
        )}
        {markers.length === 2 ? (
          <Text className="text-xs text-muted">
            Route line drawn between the two points on the native map.
          </Text>
        ) : null}
      </View>

      <Text className="px-4 pb-3 text-[10px] text-muted">
        Tiles from OpenStreetMap render here once the MapLibre native module is
        linked. {OSM_ATTRIBUTION}
      </Text>
    </View>
  );
}
