import { ConvexReactClient } from "convex/react";

/**
 * The deployment, written down.
 *
 * This is deliberately not read from `import.meta.env.VITE_CONVEX_URL` the way
 * the other client-side values are. Vite gives an already-set process
 * environment variable priority over `.env.local`, and this project's build
 * environment sets one — so a build that looked configured produced a bundle
 * pointed at a *different* Convex deployment, while every local run read the
 * right value out of `.env.local`. The result is two deployments, one of them
 * invisible in the repository, with a phone writing to one and the dashboard
 * reading the other.
 *
 * So the deployment is part of the app's identity and lives here, in reviewable
 * source. To move the app, change this line — and move `VITE_CONVEX_URL` and
 * `CONVEX_DEPLOYMENT` with it, so `convex dev` keeps pushing the functions to
 * the deployment the client is talking to.
 */
const DEPLOYMENT_URL = "https://scrupulous-sheep-213.convex.cloud";

// Still read, but only to say so out loud when it disagrees. The silent case is
// the one that cost us a build.
const configuredUrl = (
  import.meta.env.VITE_CONVEX_URL as string | undefined
)?.trim();

if (configuredUrl && configuredUrl !== DEPLOYMENT_URL) {
  console.warn(
    `[fetch] VITE_CONVEX_URL is "${configuredUrl}", but this app is pinned to ` +
      `"${DEPLOYMENT_URL}". Using the pinned deployment. To actually move the ` +
      `app, change DEPLOYMENT_URL in src/lib/convex.ts.`,
  );
}

/**
 * The one Convex client for the app.
 *
 * The provider and a one-shot query have to be talking to the same deployment,
 * so the client is created once here rather than in two places. The console's
 * CSV export is the one caller that is not a component: it runs on a button
 * press rather than as a subscription, which is why it needs the client
 * directly.
 */
export const convex = new ConvexReactClient(DEPLOYMENT_URL);
