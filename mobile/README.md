# FETCH Mobile (Expo)

The React Native build of FETCH, as a **separate app** rather than a rewrite of
the web one. Both talk to the same Convex deployment, so a ride booked on a
phone is visible to the web dashboard and to a rider on either platform.

## Why it lives beside the web app

The arithmetic that decides what a trip costs — the tariff floor, the
ride-type multipliers, the road-distance band, the rider's settlement — already
existed as pure modules under `src/lib`. Rewriting them for React Native would
have produced two fares that agree until the first time somebody edits one.

So `mobile/metro.config.js` watches the repository root, and
`mobile/lib/shared.ts` re-exports those modules by relative path. There is one
`fareBreakdown`, and it is the same function the Convex backend charges with.

What the phone *does* own:

| File | Why it cannot be shared |
| --- | --- |
| `lib/convex.ts` | The URL ships in `app.json` instead of `VITE_*`. |
| `lib/auth-storage.ts` | Tokens live in SecureStore; the browser uses `localStorage`. |
| `lib/format.ts` | Hermes ships a partial `Intl`, so money and dates are hand-rolled. |
| `lib/location.ts` | `expo-location` rather than `navigator.geolocation`. |
| `lib/routes.ts` | Road distance without a map canvas. |
| `components/ui.tsx` | The native kit — the web uses shadcn/ui. |

## Running it

```bash
cd mobile
bun install            # or: npx expo install
bun run typecheck
bun start              # then press a for Android, i for iOS
```

`bun run fix-deps` (`expo install --check`) aligns every `expo-*` package with
the SDK version this `package.json` declares.

## Configuration

`app.json` → `expo.extra` carries the two keys the app needs at build time:

| Key | What it is |
| --- | --- |
| `convexUrl` | The Convex deployment. The same one the web app uses. |
| `mapTilerKey` | Address search and reverse geocoding. |
| `orsKey` | OpenRouteService token for road distance. |

`orsKey` is empty by default. Without it the app prices trips on the
straight-line distance, which the server also accepts — the quote stays honest,
it is just a little lower than the browser's road-based one. Paste the same
token the web build uses as `VITE_ORS_KEY`.

## What is here

- **Book** — pickup and destination search, vehicle class, pabili/padala
  errands, "who is riding", a live fare built by the shared `fareBreakdown`.
- **Ride** — the live trip: progress, the rider's details and a call button,
  the receipt, cancellation, and rating once it is done.
- **Activity** — every trip, ongoing first; a finished one reopens as its
  receipt.
- **Chats** — the thread attached to each trip, with quick replies.
- **Profile** — name and number, emergency contact, driver stats and earnings,
  sign out.
- **Driver screen** (`/rider`) — go online, stream your position, take or pass
  requests, advance a trip through its stages, report an errand's cost.
- **Vehicle** (`/vehicle`) — the make, model, colour and plate a passenger is
  told to look for.

## Two notes for the curious

- `bunx expo-doctor` reports one failing check: `resolver.disableHierarchicalLookup`.
  That override is deliberate and is the reason a ride screen cannot pick up the
  web app's React one directory up; see the comment in `metro.config.js`.
- `query-string` is a direct dependency even though nothing here imports it.
  `expo-router@5.1` requires it from its own compiled code without declaring it,
  and the `@react-navigation/native` installed alongside it does not depend on
  it either, so nothing else pulls it in. It is what makes the bundle resolve.

## Not here yet

- A map canvas on the booking screen. The picker is search-first plus "use my
  location"; the phone does not draw MapLibre tiles.
- The admin console. It stays on the web dashboard.
- Push notifications; the app reads the in-app notification list only.
