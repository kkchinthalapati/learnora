import { useCallback, useEffect, useRef, useState } from "react";

export type SparringSpeaker = "alex" | "jordan";

export interface SpeakOptions {
  persona?: SparringSpeaker;
  pitch?: number;
  rate?: number;
  volume?: number;
  voice?: SpeechSynthesisVoice;
  lang?: string;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

export interface UseSpeechSynthesisReturn {
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  currentSpeaker: SparringSpeaker | null;
  voices: SpeechSynthesisVoice[];
  audioRate: number;
  setAudioRate: (rate: number) => void;
  selectedVoice: SpeechSynthesisVoice | null;
  speak: (text: string, options?: SpeakOptions) => void;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
}

export const PERSONA_VOICE_CONFIGS: Record<
  SparringSpeaker,
  { pitch: number; rate: number }
> = {
  alex: { pitch: 1.05, rate: 1.0 },
  jordan: { pitch: 0.96, rate: 1.04 },
};

export function getDefaultSpeechLocale(): string {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return "en-US";
}

/**
 * Evaluates and scores browser voices to pick the most natural, highest-fidelity
 * speech synthesis voice matching the user's locale and persona.
 */
export function scoreVoice(
  voice: SpeechSynthesisVoice,
  targetLocale: string,
  persona?: SparringSpeaker,
): number {
  let score = 0;
  const name = voice.name.toLowerCase();
  const vLang = voice.lang.toLowerCase().replace(/_/g, "-");
  const targetNorm = targetLocale.toLowerCase().replace(/_/g, "-");
  const targetLang = targetNorm.split("-")[0]; // e.g. "en"

  // 1. Natural / Neural / High-Fidelity keywords (Edge, Chrome, Safari, macOS)
  if (name.includes("natural") || name.includes("online (natural)")) {
    score += 70;
  } else if (name.includes("neural") || name.includes("premium") || name.includes("enhanced")) {
    score += 55;
  } else if (name.includes("google")) {
    score += 35;
  } else if (name.includes("siri") || name.includes("microsoft") || name.includes("apple")) {
    score += 20;
  }

  // 2. Locale matching
  if (vLang === targetNorm) {
    score += 50; // Exact match (e.g. en-IN === en-IN, en-US === en-US)
  } else if (vLang.startsWith(targetNorm) || targetNorm.startsWith(vLang)) {
    score += 40;
  } else if (vLang.startsWith(targetLang)) {
    score += 25; // Same language family
  } else if (vLang.startsWith("en") && targetLang !== "en") {
    score += 15; // Universal fallback English
  } else {
    // Completely unrelated language
    score -= 100;
  }

  // 3. Persona styling
  if (persona === "jordan") {
    // Assertive, authoritative or crisp tone
    if (
      name.includes("guy") ||
      name.includes("daniel") ||
      name.includes("ryan") ||
      name.includes("george") ||
      name.includes("male") ||
      name.includes("david")
    ) {
      score += 12;
    }
  } else if (persona === "alex") {
    // Warm, curious, conversational tone
    if (
      name.includes("jenny") ||
      name.includes("sonia") ||
      name.includes("aria") ||
      name.includes("samantha") ||
      name.includes("female") ||
      name.includes("zira")
    ) {
      score += 12;
    }
  }

  // 4. Default voice bonus
  if (voice.default) {
    score += 5;
  }

  return score;
}

export function findBestVoice(
  voices: SpeechSynthesisVoice[],
  targetLocale: string,
  persona?: SparringSpeaker,
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  let bestVoice: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;

  for (const v of voices) {
    const s = scoreVoice(v, targetLocale, persona);
    if (s > bestScore) {
      bestScore = s;
      bestVoice = v;
    }
  }

  return bestVoice || voices[0] || null;
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<SparringSpeaker | null>(
    null,
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [audioRate, setAudioRate] = useState<number>(1.0);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRateRef = useRef(audioRate);
  audioRateRef.current = audioRate;

  // Load and cache available voices
  useEffect(() => {
    if (!isSupported) return;

    const synth = window.speechSynthesis;
    const updateVoices = () => {
      const loaded = synth.getVoices();
      if (loaded.length > 0) {
        setVoices(loaded);
        const best = findBestVoice(loaded, getDefaultSpeechLocale(), "alex");
        setSelectedVoice(best);
      }
    };

    updateVoices();
    synth.addEventListener("voiceschanged", updateVoices);

    return () => {
      synth.removeEventListener("voiceschanged", updateVoices);
    };
  }, [isSupported]);

  // Clean cancellation on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (!isSupported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentSpeaker(null);
    currentUtteranceRef.current = null;
  }, [isSupported]);

  const pause = useCallback(() => {
    if (!isSupported) return;
    try {
      window.speechSynthesis.pause();
      setIsPaused(true);
    } catch {
      // Ignore
    }
  }, [isSupported]);

  const resume = useCallback(() => {
    if (!isSupported) return;
    try {
      window.speechSynthesis.resume();
      setIsPaused(false);
    } catch {
      // Ignore
    }
  }, [isSupported]);

  const speak = useCallback(
    (text: string, options: SpeakOptions = {}) => {
      if (!isSupported || !text.trim()) return;

      const persona = options.persona ?? "alex";
      const preset = PERSONA_VOICE_CONFIGS[persona];
      const pitch = options.pitch ?? preset.pitch;
      const rate = (options.rate ?? preset.rate) * audioRateRef.current;
      const volume = options.volume ?? 1.0;
      const targetLocale = options.lang || getDefaultSpeechLocale();

      // Clean cancellation before starting new utterance so speech never overlaps
      cancel();

      try {
        const utterance = new SpeechSynthesisUtterance(text.trim());
        const chosenVoice =
          options.voice || findBestVoice(voices, targetLocale, persona);

        if (chosenVoice) {
          utterance.voice = chosenVoice;
          utterance.lang = chosenVoice.lang;
        } else {
          utterance.lang = targetLocale;
        }

        utterance.pitch = pitch;
        utterance.rate = rate;
        utterance.volume = volume;

        utterance.onstart = () => {
          setIsSpeaking(true);
          setIsPaused(false);
          setCurrentSpeaker(persona);
        };

        utterance.onend = () => {
          setIsSpeaking(false);
          setIsPaused(false);
          setCurrentSpeaker(null);
          currentUtteranceRef.current = null;
          options.onEnd?.();
        };

        utterance.onerror = (event) => {
          // 'canceled' or 'interrupted' is expected when stopping intentionally
          if (event.error !== "canceled" && event.error !== "interrupted") {
            options.onError?.(event);
          }
          setIsSpeaking(false);
          setIsPaused(false);
          setCurrentSpeaker(null);
          currentUtteranceRef.current = null;
        };

        currentUtteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        options.onError?.(err);
        setIsSpeaking(false);
        setIsPaused(false);
        setCurrentSpeaker(null);
      }
    },
    [cancel, isSupported, voices],
  );

  return {
    isSpeaking,
    isPaused,
    isSupported,
    currentSpeaker,
    voices,
    audioRate,
    setAudioRate,
    selectedVoice,
    speak,
    cancel,
    pause,
    resume,
  };
}
