/**
 * How the account card describes the person signed in.
 *
 * Kept apart from the component because these are the two things most likely
 * to break quietly: an empty or one-word name used to render a blank or
 * single-letter badge, and role wording that says "admin" to a commuter.
 */

/** How each role reads to a person, in words rather than enum values. */
const ROLE_LABEL: Record<string, string> = {
  commuter: "Riding with Fetch",
  rider: "Driving with Fetch",
  admin: "Fetch team",
};

/**
 * The letters shown in the round avatar badge.
 *
 * "Jose dela Cruz" -> "JD", "Malaybalay City Hall" -> "MC", "JR" -> "JR".
 * Falls back to "?" rather than an empty badge when there is no name yet, so
 * the avatar never collapses to nothing on a first render.
 */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Plain-language role, or a neutral default for a profile mid-creation. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Signed in";
  return ROLE_LABEL[role] ?? "Signed in";
}
