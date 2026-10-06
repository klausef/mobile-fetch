import { api } from "@/convex/_generated/api";
import { isOwnerAdminSettled } from "@/lib/adminRedirect";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

/**
 * Who is the Super Admin, as far as the UI is concerned.
 *
 * Two answers, because they are not the same question:
 *   - `isAdmin` — may this person use the console? True for the reserved owner
 *     address and for anyone whose profile carries the admin role.
 *   - `isOwner` — is this the reserved owner address? Only that account is
 *     redirected to the console automatically on sign-in.
 *
 * `resolved` is false in two cases, and both mean "do not decide yet": the query
 * has not answered, or nobody is signed in (the server answers `null`). The
 * second case matters: treating a signed-out `null` as "definitely not the owner"
 * made the sign-in page commit to `/app` before the query refetched for the new
 * session, so the owner never reached the console.
 */
export function useOwnerAdmin() {
  const state = useQuery(api.profiles.isOwnerOrAdmin);
  const ensureAdminProfile = useMutation(api.profiles.ensureAdminProfile);
  const granted = useRef(false);

  const isOwner = state?.isOwner === true;
  const isAdmin = state?.isAdmin === true;

  // The owner is an admin by address, so give them a profile too: the account
  // menu, the nav, and the rider queue all read it. Idempotent, and skipped
  // once it has run so a re-render cannot fire a second mutation.
  useEffect(() => {
    if (!isOwner || granted.current) return;
    granted.current = true;
    void ensureAdminProfile({}).catch(() => undefined);
  }, [isOwner, ensureAdminProfile]);

  return {
    isAdmin,
    isOwner,
    /** False while loading, and while nobody is signed in. */
    resolved: isOwnerAdminSettled(state),
  };
}