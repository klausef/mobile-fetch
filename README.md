## Overview

This project uses the following tech stack:
- Vite
- Typescript
- React Router v7 (all imports from `react-router` instead of `react-router-dom`)
- React 19 (for frontend components)
- Tailwind v4 (for styling)
- Shadcn UI (for UI components library)
- Lucide Icons (for icons)
- Convex (for backend & database)
- Convex Auth (for authentication)
- Framer Motion (for animations)
- Three js (for 3d models)

All relevant files live in the 'src' directory.

Use bun for the package manager.

## Setup

This project is set up already and running on a cloud environment, as well as a convex development in the sandbox.

## Environment Variables

The deployment is written into the client: `src/lib/convex.ts` pins
`https://scrupulous-sheep-213.convex.cloud`, and every build ships that value —
dev, preview, APK.

`VITE_CONVEX_URL` is still read, but only to warn when it disagrees. Vite gives
an already-set process environment variable priority over `.env.local`, so
relying on the variable let a build bind to a different deployment than the
repository declares — silently, and only in the built bundle. Change the
deployment in `src/lib/convex.ts`, and move `VITE_CONVEX_URL` and
`CONVEX_DEPLOYMENT` with it so `convex dev` pushes functions to the same backend
the client talks to.

The convex server has a separate set of environment variables that are accessible by the convex backend.

Currently, these variables include auth-specific keys: JWKS, JWT_PRIVATE_KEY, and SITE_URL.

## Maps and routing

The booking, tracking and rider maps are drawn with `maplibre-gl`. Two optional
keys upgrade them from the keyless defaults. Both are **client-side** keys —
Vite only exposes variables prefixed with `VITE_`, so a key named
`MAPTILER_TOKEN` would never reach the map — and both are therefore public by
construction, which is why each provider's dashboard should restrict it to the
app's origins rather than treat it as a secret.

| Variable | What it turns on | Without it |
| --- | --- | --- |
| `VITE_MAPTILER_KEY` | MapTiler vector tiles (street labels, sharper at every zoom) and MapTiler forward/reverse geocoding for address search. Grab one from https://cloud.maptiler.com/account/keys/ — the free tier covers FETCH's usage. | OpenStreetMap raster tiles and Nominatim geocoding. The map and address search still work. |
| `VITE_ORS_KEY` | Driving directions, so the drawn route follows roads. Fetch calls the HeiGIT-hosted OpenRouteService (`api.heigit.org/openrouteservice`), so use a token issued there. | The route is drawn as a straight line between the two ends. |
| `VITE_MAPTILER_STYLE` | Optional. Which MapTiler style to draw, e.g. `streets-v2` (default), `streets-v2-dark`, `basic-v2`, `dataviz`. | `streets-v2`. |

Nothing here is required to run the app: with no keys the map draws from
OpenStreetMap, address search runs against Nominatim, and a straight line stands
in for the road route. The keys only make it better. See `src/lib/map-service.ts`
(`getMapProvider`, `mapStyle`) for the switch and `src/lib/routing-service.ts`
for the directions call. Add the values in the project's Keys/API keys tab; do
not commit them.

### Current location

FETCH asks for location once, as the app opens, and shares that one fix with
every screen (see `src/hooks/use-current-location.ts` and
`src/components/CurrentLocationProvider.tsx`). The fix is reverse-geocoded
through MapTiler when a key is present, drawn as the blue dot on the map, and
used to fill the "Pickup from" field; the map centres on it at zoom 15.

Because the answer can be no, each outcome gets its own treatment rather than one
generic error: a **blocked** permission is told how to un-block it and does *not*
offer a retry button (the browser will not prompt for an origin already
refused), while a **timeout**, **dead signal** or **hard failure** offer one.
Any of those four also opens a plain address search on the pickup screen, so a
commuter with no GPS can still book. "Use current location" re-asks the browser
and re-centres — on both the pickup screen and the booking screen.

Two environment facts are worth knowing when testing on a phone: geolocation
requires HTTPS, and inside a preview iframe the embedding page must allow
`location`. When either is missing the app says so instead of silently failing.
The rules live in `src/lib/location.ts`.


# Using Authentication (Important!)

You must follow these conventions when using authentication.

## Auth is already set up.

All convex authentication functions are already set up. The auth currently uses email OTP and anonymous users, but can support more.

The email OTP configuration is defined in `src/convex/auth/emailOtp.ts`. DO NOT MODIFY THIS FILE.

Also, DO NOT MODIFY THESE AUTH FILES: `src/convex/auth.config.ts` and `src/convex/auth.ts`.

## Using Convex Auth on the backend

On the `src/convex/users.ts` file, you can use the `getCurrentUser` function to get the current user's data.

## Using Convex Auth on the frontend

The `/auth` page is already set up to use auth. Navigate to `/auth` for all log in / sign up sequences.

You MUST use this hook to get user data. Never do this yourself without the hook:
```typescript
import { useAuth } from "@/hooks/use-auth";

const { isLoading, isAuthenticated, user, signIn, signOut } = useAuth();
```

## Protected Routes

The starter `/dashboard` route is protected with `RequireAuth`. Extend that page
for the product's authenticated experience, and reuse `RequireAuth` when adding
another protected route — do NOT hand-roll a redirect to `/auth`, since landing
on a bare sign-in form with no explanation of what was blocked is confusing.

`RequireAuth` states the block on the page the visitor asked for and sends them
to `/auth?returnTo=<current route>` when they choose to sign in, so they come
back to it. Pass `title` and `description` to say what the page is:

```tsx
<Route
  path="/dashboard"
  element={
    <RequireAuth
      title="Sign in to view your dashboard"
      description="Your projects and settings live here."
    >
      <Dashboard />
    </RequireAuth>
  }
/>
```

Pass `redirectImmediately` for a route where bouncing straight to `/auth` really
is better.

## Auth Page

The auth page is defined in `src/pages/Auth.tsx`. Send sign-in and sign-up actions
to `/auth`.

## Authorization

You can perform authorization checks on the frontend and backend.

On the frontend, you can use the `useAuth` hook to get the current user's data and authentication state.

You should also be protecting queries, mutations, and actions at the base level, checking for authorization securely.

## Adding a redirect after auth

The `/auth` route in `src/main.tsx` redirects to `/dashboard` by default. If the
product's main authenticated route is different, update `redirectAfterAuth` to
that route. A validated same-origin `returnTo` query parameter takes priority so
users can resume the protected page they originally requested. Never leave an
authenticated product redirecting back to the public landing page.

## Complete authenticated products

When the requested product implies accounts, a workspace, a dashboard, or other
signed-in functionality, the task is not complete with only a landing page and
auth form. Build the main authenticated experience, protect its route, and verify
that signing in reaches it.

# Frontend Conventions

You will be using the Vite frontend with React 19, Tailwind v4, and Shadcn UI.

Generally, pages should be in the `src/pages` folder, and components should be in the `src/components` folder.

Shadcn primitives are located in the `src/components/ui` folder and should be used by default.

## Page routing

Your page component should go under the `src/pages` folder.

When adding a page, update the react router configuration in `src/main.tsx` to include the new route you just added.

## Shad CN conventions

Follow these conventions when using Shad CN components, which you should use by default.
- Remember to use "cursor-pointer" to make the element clickable
- For title text, use the "tracking-tight font-bold" class to make the text more readable
- Always make apps MOBILE RESPONSIVE. This is important
- AVOID NESTED CARDS. Try and not to nest cards, borders, components, etc. Nested cards add clutter and make the app look messy.
- AVOID SHADOWS. Avoid adding any shadows to components. stick with a thin border without the shadow.
- Avoid skeletons; instead, use the loader2 component to show a spinning loading state when loading data.


## Landing Pages

You must always create good-looking designer-level styles to your application. 
- Make it well animated and fit a certain "theme", ie neo brutalist, retro, neumorphism, glass morphism, etc

Use known images and emojis from online.

If the user is logged in already, show the get started button to say "Dashboard" or "Profile" instead to take them there.

## Responsiveness and formatting

Make sure pages are wrapped in a container to prevent the width stretching out on wide screens. Always make sure they are centered aligned and not off-center.

Always make sure that your designs are mobile responsive. Verify the formatting to ensure it has correct max and min widths as well as mobile responsiveness.

- Always create sidebars for protected dashboard pages and navigate between pages
- Always create navbars for landing pages
- On these bars, the created logo should be clickable and redirect to the index page

## Animating with Framer Motion

You must add animations to components using Framer Motion. It is already installed and configured in the project.

To use it, import the `motion` component from `framer-motion` and use it to wrap the component you want to animate.


### Other Items to animate
- Fade in and Fade Out
- Slide in and Slide Out animations
- Rendering animations
- Button clicks and UI elements

Animate for all components, including on landing page and app pages.

## Three JS Graphics

Your app comes with three js by default. You can use it to create 3D graphics for landing pages, games, etc.


## Colors

You can override colors in: `src/index.css`

This uses the oklch color format for tailwind v4.

Always use these color variable names.

Make sure all ui components are set up to be mobile responsive and compatible with both light and dark mode.

Set theme using `dark` or `light` variables at the parent className.

## Styling and Theming

When changing the theme, always change the underlying theme of the shad cn components app-wide under `src/components/ui` and the colors in the index.css file.

Avoid hardcoding in colors unless necessary for a use case, and properly implement themes through the underlying shad cn ui components.

When styling, ensure buttons and clickable items have pointer-click on them (don't by default).

Always follow a set theme style and ensure it is tuned to the user's liking.

## Toasts

You should always use toasts to display results to the user, such as confirmations, results, errors, etc.

Use the shad cn Sonner component as the toaster. For example:

```
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
export function SonnerDemo() {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
          action: {
            label: "Undo",
            onClick: () => console.log("Undo"),
          },
        })
      }
    >
      Show Toast
    </Button>
  )
}
```

Remember to import { toast } from "sonner". Usage: `toast("Event has been created.")`

## Dialogs

Always ensure your larger dialogs have a scroll in its content to ensure that its content fits the screen size. Make sure that the content is not cut off from the screen.

Ideally, instead of using a new page, use a Dialog instead. 

# Using the Convex backend

You will be implementing the convex backend. Follow your knowledge of convex and the documentation to implement the backend.

## The Convex Schema

You must correctly follow the convex schema implementation.

The schema is defined in `src/convex/schema.ts`.

Do not include the `_id` and `_creationTime` fields in your queries (it is included by default for each table).
Do not index `_creationTime` as it is indexed for you. Never have duplicate indexes.


## Convex Actions: Using CRUD operations

When running anything that involves external connections, you must use a convex action with "use node" at the top of the file.

You cannot have queries or mutations in the same file as a "use node" action file. Thus, you must use pre-built queries and mutations in other files.

You can also use the pre-installed internal crud functions for the database:

```ts
// in convex/users.ts
import { crud } from "convex-helpers/server/crud";
import schema from "./schema.ts";

export const { create, read, update, destroy } = crud(schema, "users");

// in some file, in an action:
const user = await ctx.runQuery(internal.users.read, { id: userId });

await ctx.runMutation(internal.users.update, {
  id: userId,
  patch: {
    status: "inactive",
  },
});
```


## Common Convex Mistakes To Avoid

When using convex, make sure:
- Document IDs are referenced as `_id` field, not `id`.
- Document ID types are referenced as `Id<"TableName">`, not `string`.
- Document object types are referenced as `Doc<"TableName">`.
- Keep schemaValidation to false in the schema file.
- You must correctly type your code so that it passes the type checker.
- You must handle null / undefined cases of your convex queries for both frontend and backend, or else it will throw an error that your data could be null or undefined.
- Always use the `@/folder` path, with `@/convex/folder/file.ts` syntax for importing convex files.
- This includes importing generated files like `@/convex/_generated/server`, `@/convex/_generated/api`
- Remember to import functions like useQuery, useMutation, useAction, etc. from `convex/react`
- NEVER have return type validators.

# Android Shell (Capacitor)

`android/` is the Capacitor shell around the web build. `bun run android:apk`
assembles a debug APK locally and `.github/workflows/android.yml` does the same on
CI (the deployment itself comes from `src/lib/convex.ts`; the workflow's
`VITE_CONVEX_URL` secret only has to agree with it).

## Icons and splash

The crest in `public/logo.svg` is the single source for the brand mark: the app
icon, the PWA set, the Android launcher icon, the splash, and the badge the app
signs its name with (`FetchBrand`). It is never hand-edited anywhere else, and
`public/badge.svg` no longer exists - there was a second copy of the crest that
could drift from the first.

Two rules keep the rasterizer honest, both noted in the file itself:

- The whole crest lives in one group, id `crest`, last in the file. The
  generator lifts that group, so anything outside it never reaches the icons.
- The year is drawn as paths, not set in a font. librsvg on the build machine
  has no fonts at all, so type rasterizes as nothing. The two rim wordmarks
  stay real text for browsers, and the generator strips them for the icons,
  where at 48px they would be a grey smear anyway.

1. `bun scripts/generate-app-icons.mjs` - rasterizes the crest into the source
   PNGs under `assets/` (adaptive foreground + background, legacy icon, splash)
   and writes the web set into `public/`: `favicon.ico` (16/32/48),
   `apple-touch-icon.png`, and `public/icons/icon-{192,256,384,512}.png` plus
   `icon-maskable-512.png` (crest pulled inside the 80% safe circle).
2. `bunx capacitor-assets generate --android` - expands `assets/` into
   `android/app/src/main/res/{mipmap-*,drawable*}`.

`index.html` and `public/manifest.webmanifest` reference the generated web files,
so an install prompt, home screen shortcut or browser tab all show the same mark.
`android/app/src/main/res/values/styles.xml` sets `windowSplashScreenBackground`
and `windowSplashScreenAnimatedIcon` on the launch theme. `Theme.SplashScreen`
forwards both to the Android 12+ platform attributes, so every API level shows the
FETCH plate and icon instead of a white flash with the generic Android glyph.
