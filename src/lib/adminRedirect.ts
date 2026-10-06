/**
 * Where a freshly signed-in user belongs.
 *
 * Dependency-free so the routing rule can be asserted in tests rather than only
 * by signing in as the owner.
 *
 * There is deliberately no address here: the server owns the rule (see
 * convex/lib/adminEmail.ts) and reports the answer through
 * `profiles.isOwnerOrAdmin`. This file only decides the route from that answer,
 * so the reserved address cannot drift into a second copy that disagrees.
 */

/**
 * The path to send someone to after sign-in.
 *
 * `owner` is the server's verdict; `redirect` is the already-resolved
 * `returnTo`, or the default destination. The owner address is the Super Admin
 * by definition, so it goes straight to the console and never sees onboarding
 * or the commuter app.
 */
export function resolvePostAuthPath(owner: boolean, redirect: string): string {
  return owner ? "/admin" : redirect;
}

/** The shape `profiles.isOwnerOrAdmin` returns for a real signed-in caller. */
export type OwnerAdminState = { isAdmin: boolean; isOwner: boolean };

/**
 * Has the ownership question been answered for the current session?
 *
 * False both while the query is in flight (`undefined`) and when nobody is
 * signed in (`null`, which the server returns rather than throwing).
 *
 * Regression: the query used to answer `{ false, false }` when signed out, which
 * is indistinguishable from a real "not the owner" verdict. The sign-in page
 * read that as settled and navigated to `/app` before the query refetched for
 * the new session, so the owner was never redirected to the console.
 */
export function isOwnerAdminSettled(
  state: OwnerAdminState | null | undefined,
): state is OwnerAdminState {
  return state != null;
}