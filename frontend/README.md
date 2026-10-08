# FETCH Mobile (Expo)

The React Native build of FETCH, as a **separate app** rather than a rewrite of
the web one. Both talk to the same Convex deployment, so a ride booked on a
phone is visible to the web dashboard and to a rider on either platform.

It lives in `frontend/`, and it is the only app in this repository that is
built for a phone. The repository root is the web app (Vite + React) *and* the
backend it talks to (Convex, under `src/convex/`), which is where the platform
that serves the browser preview has to find them. So the backend half of a
`frontend/` + `backend/` split is already here — it is `src/convex/` at the
root, one server for both clients, rather than a second Express app that would
have to be kept in step with it.

## Why it lives beside the web app

The arithmetic that decides what a trip costs — the tariff floor, the
ride-type multipliers, the road-distance band, the rider's settlement — already
existed as pure modules under `src/lib`. Rewriting them for React Native would
have produced two fares that agree until the first time somebody edits one.

So `frontend/metro.config.js` watches the repository root, and
`frontend/src/shared.ts` re-exports those modules by relative path. There is one
`fareBreakdown`, and it is the same function the Convex backend charges with.

What the phone *does* own:

| File | Why it cannot be shared |
| --- | --- |
| `src/services/api/convex.ts` | A native bundle reads app config, not `import.meta.env`. |
| `src/services/api/auth-storage.ts` | Tokens live in SecureStore; the browser uses `localStorage`. |
| `src/utils/format.ts` | Hermes ships a partial `Intl`, so money and dates are hand-rolled. |
| `src/hooks/use-device-location.ts` | `expo-location` rather than `navigator.geolocation`. |
| `src/services/maps/routing.ts` | Road distance without a map canvas. |
| `src/components/ui.tsx` | The native kit — the web uses shadcn/ui. |

## Layout

The app follows the agreed project structure: an Expo Router `app/` tree for the
screens, and everything else under `src/`.

```
app/                    the screens — a file's path *is* its route
  _layout.tsx           providers first, then the root stack
  index.tsx             the front door: the pitch, or a gate for a session
  (tabs)/               the commuter's four tabs — book, activity, chats, profile
  auth.tsx              sign-in and sign-up
  onboarding.tsx        the profile a new account fills in once
  book.tsx              the booking form, pushed on top of the tab
  place.tsx             pick a point on the map
  place-search.tsx      search for an address
  ride.tsx              a live trip: progress, the receipt, the rating
  chat.tsx              the thread attached to one trip
  rider.tsx             the driver's surface: go online, take a request
  vehicle.tsx           the vehicle a passenger is told to look for

src/
  components/           the native kit — ui.tsx, brand.tsx, ride.tsx, MapView.tsx
  services/api/         the Convex client, and SecureStore token storage
  services/maps/        mapProvider, routing, route-geometry, geocoding
  hooks/                use-device-location.ts (one fix, or a rider's stream)
  store/                booking-draft.ts — the booking form's draft
  theme/                the colour, type and spacing tokens
  utils/                the money and date formatting Hermes cannot do
  shared.ts             the monorepo core, re-exported: one fare, two platforms
```

Five directories carry no files yet, and that is deliberate rather than
unfinished: `services/mock/` and `data/mock/` would be a second, fake backend
next to the live Convex deployment this app actually reads; `features/` is where
each screen's hooks, services and sub-components go once they are *extracted*
from the screens that hold them today — that is a refactor of `app/`, not a
move; and `navigation/` and `types/` have nothing to hold while the routes live
in `app/` and each screen types its own props.

**One deliberate departure from the tree.** The agreed structure names the
screens `app/passenger/{dashboard,services,booking,tracking}.tsx` and
`app/rider/{dashboard,services,active-trip,history}.tsx`. In Expo Router a
screen's path *is* its URL, and these screens are `(tabs)` members — the booking
hub is a tab, and a rider's surface opens as a pushed card from `/rider`. Renaming
the files would move the tab bar and every deep link the app already hands out,
for names that describe screens this app splits differently (one `ride.tsx`
serves both the live trip and the receipt, and `(tabs)/activity.tsx` is the trip
history). The tree is honoured everywhere the files are not the navigation.

## Running it

```bash
cd frontend
bun install            # or: npx expo install
bun run typecheck
bun start              # JS bundle server only
```

`bun run fix-deps` (`expo install --check`) aligns every `expo-*` package with
the SDK version this `package.json` declares.

**`bun start` cannot open this app on a phone.** `@rnmapbox/maps` is a native
module, so Expo Go has no Mapbox SDK to link against and the map screen cannot
render. Use `bun run android` — a development build — or the APK flow below.

## Configuration

`app.json` → `expo.extra` carries the values the app needs at build time. Three
modules read them, through `expo-constants`:

| Key | What it is | Read by |
| --- | --- | --- |
| `convexUrl` | The Convex deployment. **Must match the web app's pinned deployment** (`src/lib/convex.ts` at the repository root). | `src/services/api/convex.ts` |
| `orsKey` | OpenRouteService token for road distance. | `src/services/maps/routing.ts` |
| `mapboxAccessToken` | The **public** `pk.` token the Mapbox map screen renders with. | `src/services/maps/mapProvider.ts` |

`orsKey` is empty by default. Without it the app prices trips on the
straight-line distance, which the server also accepts — the quote stays honest,
it is just a little lower than the browser's road-based one. Paste the same
token the web build uses as `VITE_ORS_KEY`.

There is no `mapTilerKey` here on purpose. The phone draws no MapLibre canvas,
so it has no tiles to fetch, and `src/services/maps/geocoding.ts` resolves addresses through
placeholders rather than MapTiler. A key in this table is a value shipped to
every install; there is no reason to ship one nothing reads.

### Why the keys are in `app.json` and not a `.env` file

Because a native app has no environment to read at runtime. The JS bundle is
compiled once and installed on a device that has never seen your shell, so
anything the phone needs has to be substituted into the code at build time.
`.env` files are not a different, more private channel — they are the same
bundle-time substitution with a different front end:

- Vite inlines `import.meta.env.VITE_*` into the web build. That is why the
  web app's URL can be read straight out of `dist/assets/index-*.js`. (The web
  app's Convex URL is the one exception: it is pinned in `src/lib/convex.ts`
  rather than taken from the environment, so a build cannot be handed a
  different deployment than the repository declares.)
- Expo does the same for `EXPO_PUBLIC_*`, or you hand the value to the app
  through `app.json`. This project uses `app.json` because it is checked in, it
  is the file that already defines the app, and `expo-constants` reads it back
  without any loader or extra config.
- A root `.env` would not reach the phone anyway. The Expo CLI loads env files
  from its own project root (`frontend/`), not the repository root.

So treat every value in the table above as public. The Mapbox `pk.` token is
designed to ship in a client; a secret `sk.` token must never be added here.

## Building an APK

```bash
cd frontend
bun install
bun run typecheck
bunx expo prebuild --platform android --no-install   # generates ./android (gitignored)
bunx expo run:android                                # builds, installs and launches
```

`expo run:android` is a development build — it needs a connected device or a
running emulator, a JDK 17+, and `ANDROID_HOME` pointing at an SDK with platform
36 and its build-tools. For a plain debug APK without launching it:

```bash
cd frontend/android && ./gradlew assembleDebug
# frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

`android/` is in `.gitignore`: it is generated, and `expo prebuild --clean`
rewrites it. Change the app through `app.json` and the config plugins, never by
editing the generated project.

### The Mapbox token

Two different tokens, and only one of them matters here:

- **`mapboxAccessToken`** (public, `pk.`) — what the map actually needs. It lives
  in `app.json` → `expo.extra` and is handed to the SDK at runtime by
  `configureMapbox()`. Without it `hasMapboxToken()` is false, the map falls back
  to an undefined style, and the route line is never drawn.
- **The secret downloads token** (`sk.`) — **not required.** Mapbox removed the
  token requirement from the `releases/maven` repository, and the current
  installation guide configures that repo with no credentials at all. The
  `@rnmapbox/maps` plugin still emits the authentication block for backward
  compatibility, but it is skipped when no token is present, so an APK builds
  without one.

If you are on an older `@rnmapbox/maps` or a Mapbox SDK that still demands it,
supply it **outside the repository** — the plugin reads either the
`MAPBOX_DOWNLOADS_TOKEN` Gradle property or the `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`
environment variable:

```bash
# ~/.gradle/gradle.properties  (never inside frontend/android/)
MAPBOX_DOWNLOADS_TOKEN=sk.xxxxxxxx
```

Do not pass it as `RNMapboxMapsDownloadToken` in `app.json`: the plugin's own
warning says that value is written into `gradle.properties`, which would put the
secret in the build tree.

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
  location"; the phone does not draw MapLibre tiles. (This is also why no
  MapTiler key is configured — see **Configuration**.)
- The admin console. It stays on the web dashboard.
- Push notifications; the app reads the in-app notification list only.
