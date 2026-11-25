/* The voices Learnora speaks in, chosen once and used everywhere it talks:
 * the tutor on a call (views/lesson/TutorCall.tsx), the tutor's spoken
 * replies in Ask (components/chat/TutorChat.tsx), and the two voices of a
 * lesson's podcast (views/lesson/PodcastPlayer.tsx).
 *
 * Kept on this device rather than with the account: the voices are the
 * device's own (Web Speech API), and a laptop's "Microsoft Aria" does not
 * exist on a phone. A chosen voice that isn't on this device falls back to
 * the best match, so nothing ever goes silent. */

import { useSyncExternalStore } from "react";

export interface VoicePrefs {
  /** voiceURI of the tutor's voice; null picks the best match. */
  tutorVoice: string | null;
  /** Multiplies the tutor's own speed (a personality may speak a little faster or slower). */
  tutorRate: number;
  /** The podcast's first voice (host, teacher). */
  hostVoice: string | null;
  /** The podcast's second voice (the student, the challenger). */
  guestVoice: string | null;
  /** Playback speed of a podcast. */
  listenRate: number;
}

export const SPEEDS = [0.85, 1, 1.15, 1.3, 1.5] as const;

export const DEFAULT_VOICE_PREFS: VoicePrefs = Object.freeze({
  tutorVoice: null,
  tutorRate: 1,
  hostVoice: null,
  guestVoice: null,
  listenRate: 1,
});

const KEY = "learnora:voices:v1";
const EVENT = "learnora:voices-changed";

const voiceId = (v: unknown) => (typeof v === "string" && v.trim() ? v.slice(0, 300) : null);
const speed = (v: unknown, fallback: number) =>
  typeof v === "number" && (SPEEDS as readonly number[]).includes(v) ? v : fallback;

export function readVoicePrefs(raw: unknown): VoicePrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_VOICE_PREFS;
  const r = raw as Record<string, unknown>;
  return {
    tutorVoice: voiceId(r.tutorVoice),
    tutorRate: speed(r.tutorRate, 1),
    hostVoice: voiceId(r.hostVoice),
    guestVoice: voiceId(r.guestVoice),
    listenRate: speed(r.listenRate, 1),
  };
}

let cachedRaw: string | null | undefined;
let cached: VoicePrefs = DEFAULT_VOICE_PREFS;

export function loadVoicePrefs(): VoicePrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cached = readVoicePrefs(raw ? JSON.parse(raw) : null);
    }
  } catch {
    cached = DEFAULT_VOICE_PREFS;
  }
  return cached;
}

export function saveVoicePrefs(patch: Partial<VoicePrefs>): VoicePrefs {
  const next = readVoicePrefs({ ...loadVoicePrefs(), ...patch });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Private mode or a full store: it lasts this visit. */
    cached = next;
  }
  window.dispatchEvent(new Event(EVENT));
  return next;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The current choices, kept in step across every screen and tab. */
export function useVoicePrefs(): VoicePrefs {
  return useSyncExternalStore(subscribe, loadVoicePrefs, () => DEFAULT_VOICE_PREFS);
}

/** The chosen voice if this device has it; otherwise undefined, so the
 *  speech hook picks its best match. */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  uri: string | null,
): SpeechSynthesisVoice | undefined {
  if (!uri) return undefined;
  return voices.find((v) => v.voiceURI === uri);
}

/** Voices worth offering: this device's, in the student's language first,
 *  then the rest, each group by name. */
export function voiceChoices(
  voices: readonly SpeechSynthesisVoice[],
  locale = typeof navigator !== "undefined" ? navigator.language : "en",
): SpeechSynthesisVoice[] {
  const lang = locale.toLowerCase().split("-")[0];
  const mine = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith(lang);
  return [...voices].sort(
    (a, b) => Number(mine(b)) - Number(mine(a)) || a.name.localeCompare(b.name),
  );
}

/** "Aria (English, United States)" → short enough for a select. */
export function voiceLabel(v: SpeechSynthesisVoice): string {
  const name = v.name.replace(/^(Microsoft|Google)\s+/i, "").replace(/\s+Online\s+\(Natural\)/i, " (natural)");
  return `${name} · ${v.lang}`;
}
