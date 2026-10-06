import { ConvexReactClient } from "convex/react";

/**
 * The one Convex client for the app.
 *
 * The provider and a one-shot query have to be talking to the same deployment,
 * so the client is created once here rather than in two places. The console's
 * CSV export is the one caller that is not a component: it runs on a button
 * press rather than as a subscription, which is why it needs the client
 * directly.
 */
export const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL as string,
);
