import { vi } from "vitest";

/* Stand-ins for the Web Speech API, which jsdom does not implement. Shaped
 * like the parts of Chrome's that useSpeechRecognition / useSpeechSynthesis
 * touch, and driven by the test: `say()` delivers recognised words, `deny()`
 * the permission error a blocked microphone produces. */

type ResultHandler = (event: {
  resultIndex: number;
  results: { length: number; [i: number]: { isFinal: boolean; length: number; 0: { transcript: string; confidence: number } } };
}) => void;

export class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = "";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onresult: ResultHandler | null = null;
  started = 0;

  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started++;
    queueMicrotask(() => this.onstart?.());
  }
  stop() {}
  abort() {}

  say(text: string) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: text, confidence: 0.9 } } },
    });
  }
  deny() {
    this.onerror?.({ error: "not-allowed" });
  }

  static latest(): FakeRecognition {
    const last = FakeRecognition.instances[FakeRecognition.instances.length - 1];
    if (!last) throw new Error("recognition was never started");
    return last;
  }
}

export interface FakeSynth {
  spoken: string[];
  /** Ends the utterance in progress, as the browser does when it finishes. */
  finish: () => void;
}

/** Installs both APIs on window; returns the synthesiser's record. */
export function installFakeSpeech(): FakeSynth {
  FakeRecognition.instances = [];
  let current: { onstart?: () => void; onend?: () => void } | null = null;
  const synth: FakeSynth = {
    spoken: [],
    finish: () => {
      const utterance = current;
      current = null;
      utterance?.onend?.();
    },
  };
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeRecognition });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    value: class {
      text: string;
      voice: unknown = null;
      lang = "";
      pitch = 1;
      rate = 1;
      volume = 1;
      onstart?: () => void;
      onend?: () => void;
      onerror?: () => void;
      constructor(text: string) {
        this.text = text;
      }
    },
  });
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speak: vi.fn((u: { text: string; onstart?: () => void; onend?: () => void }) => {
        synth.spoken.push(u.text);
        current = u;
        u.onstart?.();
      }),
      cancel: vi.fn(() => {
        current = null;
      }),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  return synth;
}

export function uninstallFakeSpeech(): void {
  for (const key of ["SpeechRecognition", "SpeechSynthesisUtterance", "speechSynthesis"]) {
    delete (window as unknown as Record<string, unknown>)[key];
  }
}
