import { Component, type ReactNode } from "react";
import { getMapProvider, type MapSurfaceProps } from "@/services/maps/mapProvider";
import { FallbackMap } from "@/services/maps/FallbackMap";

/**
 * The map every screen renders.
 *
 * Which implementation draws it is decided by `services/maps/mapProvider.ts`,
 * not here, and not by the screens: swapping MapLibre for another renderer is
 * a one-file change that no screen ever notices.
 */

class MapErrorBoundary extends Component<{ fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function MapView(props: MapSurfaceProps) {
  const { MapSurface } = getMapProvider();
  return (
    <MapErrorBoundary fallback={<FallbackMap {...props} />}>
      <MapSurface {...props} />
    </MapErrorBoundary>
  );
}
