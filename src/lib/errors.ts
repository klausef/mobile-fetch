/**
 * Convex prefixes thrown messages with request metadata and a stack. Users
 * should only ever see the plain-language first line.
 *
 * The one message that must never reach a person is Convex's placeholder for an
 * error it could not serialize: `[CONVEX A(auth:signIn)]`, or `[CONVEX Q(...)]`
 * for a query. That names the internal function that failed and says nothing
 * about what went wrong, so it is treated like any other unrenderable failure
 * and answered with the caller's own fallback — which can be specific about
 * what the person was trying to do.
 */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const first = raw
    .split("\n")[0]
    .replace(/\[Request ID:.*$/i, "")
    .replace(/Uncaught Error:\s*/i, "")
    .trim();
  if (!first) return fallback;
  // The internal function reference is not an explanation. Falls through to the
  // fallback, which is the only text here that means anything to a reader.
  if (/^\[CONVEX\s+[AQ]\(/i.test(first)) return fallback;
  if (/^https?:\/\//i.test(first) || /Server Error/i.test(first)) return fallback;
  return first;
}
