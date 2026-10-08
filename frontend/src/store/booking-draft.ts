import { useSyncExternalStore } from "react";
import type { LatLng } from "@/shared";

/**
 * The booking form's draft, held outside React.
 *
 * The two ends of a trip are chosen on a *different screen* from the one that
 * prices them — the picker is pushed on top of the booking tab, and a phone has
 * no equivalent of a URL the caller can read back. Passing the choice through
 * params would work once and then silently rot: a re-mount, a deep link back
 * into the picker, or a second edit would each need the same plumbing again.
 *
 * So the draft lives in one module, replaced immutably on every write so
 * `useSyncExternalStore` can compare by identity. It is deliberately *not*
 * persisted to disk: an unfinished booking from last Tuesday is not a draft,
 * it is a stale address, and reopening it would book the wrong trip.
 */
export interface DraftPoint extends LatLng {
  address?: string;
}

export interface BookingDraft {
  pickup: DraftPoint | null;
  destination: DraftPoint | null;
}

export type DraftField = "pickup" | "destination";

let draft: BookingDraft = { pickup: null, destination: null };

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): BookingDraft {
  return draft;
}

/** Point a field at a place, or clear it with null. */
export function setDraftPoint(field: DraftField, point: DraftPoint | null) {
  draft = { ...draft, [field]: point };
  emit();
}

/** Copy an already-set pair back in, for "book this again" shortcuts. */
export function setDraft(next: Partial<BookingDraft>) {
  draft = { ...draft, ...next };
  emit();
}

/** Start over after a request, so the next booking is not the last one. */
export function clearDraft() {
  draft = { pickup: null, destination: null };
  emit();
}

/** The draft, as a React value. Re-renders only when something changed. */
export function useBookingDraft(): BookingDraft {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
