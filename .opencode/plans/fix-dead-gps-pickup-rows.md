# Fix dead GPS / pickup rows on /book

## Symptom

On `/book` (CommuterHome): the destination search box responds, but the
pickup path and the "Use my current location" row feel dead. Seen in browser.

## Root cause

The browser's geolocation permission for the test origin is (almost certainly)
**permanently blocked** — likely left over from the old build that prompted at
app load. Once blocked, no code can re-prompt, and every fix request resolves
`null` instantly. On top of that, the GPS handlers discard that `null`
**silently**:

- `handleUseCurrentLocation` (CommuterHome.tsx:570-580):
  `const fix = await here.refresh(); if (!fix) return;` — the press does
  nothing: no toast, no message, no state change. The row reads as dead.
- `useAutoDetectOnBooking` correctly refuses to re-ask a denied permission
  (`canRetry("denied") === false`, lib/location.ts:102), so the pickup never
  auto-fills from GPS.
- On `/book` the notice card (CommuterHome.tsx:1217) shows
  `locationNotice(status, …)` which, for a *previously blocked* origin, only
  says "set your pickup by searching or tapping the map" — it never gives the
  "click the lock icon → set Location to Allow → reload" reset steps that a
  fresh denial gets (that text is `RESET_HINT`, module-private in
  use-geolocation.ts:117).
- The pickup picker (`/book/pickup`) already has a typed-address fallback
  (SetLocation.tsx:750-808) and the tap-to-place fix, and destination is pure
  search — which is exactly the asymmetry the user sees.

## Plan

1. **A GPS press always answers — never a silent `return`.**
   - `CommuterHome.handleUseCurrentLocation`: if `here.status === "denied"`,
     skip the doomed API call, `toast.error` with the reset sentence, and
     `scrollIntoView` the `gpsNoticeRef` card. On `refresh()` returning null,
     `toast.error(here.notice ?? "Couldn't read your location…")`.
   - `SetLocation.goToCurrentLocation` (line 367): same denied guard → scroll
     the fallback card (`fallbackRef`) into view; on null with
     `step === "destination"` (no fallback card there) toast the notice.
2. **Expose the reset instruction on `/book`.**
   - Export `RESET_HINT` from `use-geolocation.ts` (currently module-private).
   - In the denied branch of the toast, use `RESET_HINT` so the user knows the
     lock-icon step.
3. **Make the `/book` GPS row honest, not tappable-looking.**
   - When `here.status === "denied"`: row label becomes "Location is blocked",
     value line "Open site settings, allow, then reload"; press scrolls to the
     notice card instead of firing a doomed request. Retry stays for transient
     (canRetry) states.
4. **Verify the pickup picker's fallback** (no change expected): typed search +
   retry + reset explanation already exist; tap-to-place already works without
   GPS.

## Files

- `src/pages/CommuterHome.tsx` — handleUseCurrentLocation, GPS EndRow, add
  `gpsNoticeRef`, add reset sentence to the notice card when denied.
- `src/pages/SetLocation.tsx` — goToCurrentLocation guard, add `fallbackRef`,
  import `toast`.
- `src/hooks/use-geolocation.ts` — export `RESET_HINT`.

## Verification

- `bun run lint`, `bunx tsc -b`, `bun test` (baseline 674 pass / 6 known fails).
- Manual in browser, two states:
  - **Blocked origin** (matches today's symptom): /book GPS row press explains
    why + how to unblock; pickup row → picker shows typed-search fallback; map
    tap places a pin without GPS; destination unaffected.
  - **Granted origin**: prompt fires on entering /book, pickup auto-fills from
    GPS, blue dot shows, booking completes.

## Caveat

A permanently blocked browser permission cannot be re-prompted by any code;
the real fix is the lock-icon reset the notice describes. The plan only makes
the app say so instead of dying silently.