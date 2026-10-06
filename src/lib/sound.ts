/**
 * A short chime for an incoming ride request.
 *
 * Synthesised with the Web Audio API rather than shipped as an audio file: a
 * two-note blip is a few lines of code, needs no asset to load or cache, and
 * cannot be blocked by a missing file path. It is deliberately quiet and short
 * — this plays inside a car, often with the phone mounted and the rider looking
 * at the road, so it has to be noticed and then stop.
 *
 * Browsers refuse to start an AudioContext before the user has interacted with
 * the page. A rider reaches this only after tapping "Go online", which is a
 * gesture, so the context can usually be resumed. When it cannot — an older
 * browser, or a permission the platform refuses — this fails silently and the
 * visual card is still the notification. Audio is an enhancement, and a ride
 * request must never be missed because a sound did not play.
 */

let context: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  return context;
}

/** Play the two-note request chime. Never throws; never awaits. */
export function playRequestChime(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    // A rising pair — lower note, then higher — reads as "something arrived"
    // rather than as an alarm.
    const notes = [
      { at: 0, freq: 660 },
      { at: 0.16, freq: 880 },
    ];
    for (const note of notes) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = note.freq;
      // Short attack and a fast decay: a click, not a drone.
      gain.gain.setValueAtTime(0.0001, now + note.at);
      gain.gain.exponentialRampToValueAtTime(0.18, now + note.at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + 0.22);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + note.at);
      oscillator.stop(now + note.at + 0.24);
    }
  } catch {
    // Audio is a nicety; a failure here must not stop the request rendering.
  }
}
