import type { ReactNode } from "react";
import { getMapProvider, type MapSurfaceProps } from "@/services/maps/mapProvider";
import { FallbackMap } from "@/services/maps/FallbackMap";

/**
 * The map every screen renders.
 *
 * Which implementation draws it is decided by `services/maps/mapProvider.ts`,
 * not by screens, and not here. Swapping MapLibre for another renderer is a
 * one-file change in that module; this component stays the same.
 */

function MapViewWithFallback({
  children,
  fallback,
  kind,
  surface,
}: {
  children?: ReactNode;
  fallback: ReactNode;
  kind: "live" | "error";
  surface: ReactNode;
}) {
  return kind === "error" ? fallback : surface;
}

export function MapView(props: MapSurfaceProps) {
  const { MapSurface } = getMapProvider();
  const live = <MapSurface {...props} />;
  return (
    <MapViewWithFallback fallback={<FallbackMap {...props} />} kind="live" surface={live}>
      {null}
    </MapViewWithFallback>
  );
}
