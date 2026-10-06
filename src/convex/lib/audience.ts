/**
 * Who a Super Admin broadcast reaches.
 *
 * Dependency-free so the rule can be asserted in tests. `notifyBroadcast` in
 * lib/db.ts is only the thing that writes the rows; deciding *which* rows is
 * this file's job, and it is the part worth getting right — it decides who
 * finds out that their fare changed.
 */
import type { BroadcastAudience } from "./broadcast";

/** The minimum a profile needs to be a delivery target. */
export type BroadcastTarget<T extends string = string> = {
  userId: T;
  role: string;
};

/**
 * One broadcast writes a row per recipient in a single mutation, so the count
 * is bounded. Beyond this, senders are dropped from the end of the list.
 */
export const MAX_BROADCAST_RECIPIENTS = 500;

/**
 * Audience names are plural ("riders"); profile roles are singular ("rider").
 * Mapping them explicitly beats a clever comparison, and makes "riders" vs
 * "rider" a visible choice rather than a silent mismatch.
 */
const ROLE_FOR_AUDIENCE = {
  commuters: "commuter",
  riders: "rider",
} as const;

/**
 * Resolve the recipients for one broadcast.
 *
 * - An audience of "all" reaches every profile, which is the point.
 * - The sender never receives their own message: they just read it on screen.
 * - Duplicates collapse. A user id appears once even if they somehow hold more
 *   than one profile row, because two notifications for one person reads as a
 *   duplicate send rather than a fan-out.
 * - The cap applies last, after de-duplication, so the oldest entries are the
 *   ones dropped rather than an arbitrary slice of duplicates.
 */
export function selectBroadcastRecipients<T extends string>(
  profiles: readonly BroadcastTarget<T>[],
  audience: BroadcastAudience,
  senderId: T,
): T[] {
  const role = audience === "all" ? null : ROLE_FOR_AUDIENCE[audience];
  const wanted =
    role === null ? profiles : profiles.filter((p) => p.role === role);

  // A Set keyed on the id, so a Convex Id keeps its branded type on the way out
  // instead of widening to a bare string.
  const unique = new Set<T>();
  for (const profile of wanted) {
    if (profile.userId !== senderId) unique.add(profile.userId);
  }
  return [...unique].slice(0, MAX_BROADCAST_RECIPIENTS);
}

/**
 * May this caller act as a rider right now?
 *
 * Real accounts wait for the Super Admin to approve them. A guest session is a
 * throwaway demo account that nobody will ever sit in an approval queue for, so
 * holding one back would strand it on a "waiting for approval" screen it can
 * never leave.
 *
 * A missing rider record is never approving, whatever the session is.
 */
export function riderApprovalSatisfied(
  approval: string | undefined | null,
  isGuest: boolean,
): boolean {
  if (approval === undefined || approval === null) return false;
  return approval === "APPROVED" || isGuest;
}