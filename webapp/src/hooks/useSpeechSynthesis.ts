import { useCallback, useEffect, useRef, useState } from "react";

export type SparringSpeaker = "alex" | "jordan";

export interface SpeakOptions {
  persona?: SparringSpeaker;
  pitch?: number;
  rate?: number;
  volume?: number;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

export interface UseSpeechSynthesisReturn {
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  currentSpeaker: SparringSpeaker | null;
  voices: SpeechSynthesisVoice[];
  speak: (text: string, options?: SpeakOptions) => void;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
}

export const PERSONA_VOICE_CONFIGS: Record<
  SparringSpeaker,
  { pitch: number; rate: number }
> = {
  alex: { pitch: 1.15, rate: 1.0 },
  jordan: { pitch: 0.92, rate: 1.08 },
};

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<SparringSpeaker | null>(
    null,
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load and cache available voices
  useEffect(() => {
    if (!isSupported) return;

    const synth = window.speechSynthesis;
    const updateVoices = () => {
      const loaded = synth.getVoices();
      setVoices(loaded);
    };

    updateVoices();
    synth.addEventListener("voiceschanged", updateVoices);

    return () => {
      synth.removeEventListener("voiceschanged", updateVoices);
    };
  }, [isSupported]);

  // Cleanup on unmount
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

  const selectVoiceForPersona = useCallback(
    (persona: SparringSpeaker): SpeechSynthesisVoice | null => {
      if (voices.length === 0) return null;

      // Filter for British English voices
      const gbVoices = voices.filter((v) => {
        const lang = v.lang.toLowerCase().replace(/_/g, "-");
        return lang.startsWith("en-gb");
      });

      if (gbVoices.length > 0) {
        if (persona === "alex") {
          return gbVoices[0];
        } else {
          // Jordan prefers a second GB voice if available, or first
          return gbVoices[1] || gbVoices[0];
        }
      }

      // Fallback to any English voice
      const anyEnVoices = voices.filter((v) =>
        v.lang.toLowerCase().startsWith("en"),
      );
      if (anyEnVoices.length > 0) {
        if (persona === "alex") {
          return anyEnVoices[0];
        } else {
          return anyEnVoices[1] || anyEnVoices[0];
        }
      }

      // Final fallback to default system voice
      return voices[0] || null;
    },
    [voices],
  );

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
      const rate = options.rate ?? preset.rate;
      const volume = options.volume ?? 1.0;

      // Cancel any ongoing utterance before speaking new text
      cancel();

      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-GB";
        utterance.pitch = pitch;
        utterance.rate = rate;
        utterance.volume = volume;

        const voice = selectVoiceForPersona(persona);
        if (voice) {
          utterance.voice = voice;
        }

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
    [cancel, isSupported, selectVoiceForPersona],
  );

  return {
    isSpeaking,
    isPaused,
    isSupported,
    currentSpeaker,
    voices,
    speak,
    cancel,
    pause,
    resume,
  };
}
