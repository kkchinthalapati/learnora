import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeechRecognitionHookOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  silenceTimeoutMs?: number;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

export interface SpeechRecognitionHookReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  setTranscript: (text: string) => void;
}

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: {
          length: number;
          [index: number]: {
            isFinal: boolean;
            length: number;
            [subIndex: number]: { transcript: string; confidence: number };
          };
        };
      }) => void)
    | null;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognitionClass():
  | (new () => SpeechRecognitionInstance)
  | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function useSpeechRecognition({
  lang = "en-GB",
  continuous = true,
  interimResults = true,
  silenceTimeoutMs = 3500,
  onFinalTranscript,
  onError,
}: SpeechRecognitionHookOptions = {}): SpeechRecognitionHookReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManuallyStoppedRef = useRef(false);
  const onFinalRef = useRef(onFinalTranscript);
  const onErrorRef = useRef(onError);

  onFinalRef.current = onFinalTranscript;
  onErrorRef.current = onError;

  const isSupported =
    typeof window !== "undefined" && getSpeechRecognitionClass() !== null;

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    clearSilenceTimer();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Recognition may already be stopped
      }
    }
    setIsListening(false);
    setInterimTranscript("");
  }, [clearSilenceTimer]);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    if (silenceTimeoutMs > 0) {
      silenceTimerRef.current = setTimeout(() => {
        stopListening();
      }, silenceTimeoutMs);
    }
  }, [clearSilenceTimer, silenceTimeoutMs, stopListening]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      const msg = "Speech recognition is not supported in this browser.";
      setError(msg);
      onErrorRef.current?.(msg);
      return;
    }

    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (!SpeechRecognitionClass) return;

    // Reset error & states
    setError(null);
    isManuallyStoppedRef.current = false;

    // If an existing instance is active, abort it
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore abort errors
      }
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.lang = lang;

      recognition.onstart = () => {
        setIsListening(true);
        resetSilenceTimer();
      };

      recognition.onresult = (event) => {
        resetSilenceTimer();
        let newFinalTranscript = "";
        let newInterimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result && result[0]) {
            const piece = result[0].transcript;
            if (result.isFinal) {
              newFinalTranscript += piece;
            } else {
              newInterimTranscript += piece;
            }
          }
        }

        if (newFinalTranscript) {
          setTranscript((prev) => {
            const trimmed = prev.trim();
            const combined = trimmed
              ? `${trimmed} ${newFinalTranscript.trim()}`
              : newFinalTranscript.trim();
            onFinalRef.current?.(combined);
            return combined;
          });
          setInterimTranscript("");
        } else {
          setInterimTranscript(newInterimTranscript);
        }
      };

      recognition.onerror = (event) => {
        // Ignore aborted error when stopped manually
        if (event.error === "aborted" && isManuallyStoppedRef.current) {
          return;
        }
        const errorMsg =
          event.message || `Speech recognition error: ${event.error}`;
        setError(errorMsg);
        onErrorRef.current?.(errorMsg);
        setIsListening(false);
        clearSilenceTimer();
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
        clearSilenceTimer();
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to start speech recognition.";
      setError(msg);
      onErrorRef.current?.(msg);
      setIsListening(false);
      clearSilenceTimer();
    }
  }, [
    clearSilenceTimer,
    continuous,
    interimResults,
    isSupported,
    lang,
    resetSilenceTimer,
  ]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup errors
        }
        recognitionRef.current = null;
      }
    };
  }, [clearSilenceTimer]);

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
    setTranscript,
  };
}
