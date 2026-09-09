import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeechRecognitionHookOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  silenceTimeoutMs?: number;
  autoRestart?: boolean;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

export interface SpeechRecognitionHookReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  fullTranscript: string;
  isSupported: boolean;
  error: string | null;
  detectedLang: string;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  setTranscript: (text: string) => void;
  flushTranscript: () => string;
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

export function getDefaultSpeechLocale(): string {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return "en-US";
}

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
  lang,
  continuous = true,
  interimResults = true,
  silenceTimeoutMs = 4000,
  autoRestart = true,
  onFinalTranscript,
  onError,
}: SpeechRecognitionHookOptions = {}): SpeechRecognitionHookReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const effectiveLang = lang && lang.trim() ? lang.trim() : getDefaultSpeechLocale();

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isManuallyStoppedRef = useRef(false);
  const shouldBeListeningRef = useRef(false);
  const transcriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const restartAttemptsRef = useRef(0);

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

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  /**
   * Flushes any uncommitted interim transcript into final transcript
   * so no spoken words are lost when pausing or stopping.
   */
  const flushTranscript = useCallback((): string => {
    const uncommitted = interimTranscriptRef.current.trim();
    if (uncommitted) {
      const current = transcriptRef.current.trim();
      const combined = current ? `${current} ${uncommitted}` : uncommitted;
      transcriptRef.current = combined;
      interimTranscriptRef.current = "";
      setTranscript(combined);
      setInterimTranscript("");
      onFinalRef.current?.(combined);
      return combined;
    }
    return transcriptRef.current.trim();
  }, []);

  const stopListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    shouldBeListeningRef.current = false;
    restartAttemptsRef.current = 0;
    clearSilenceTimer();
    clearRestartTimer();

    // Flush any pending interim speech before stopping
    flushTranscript();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Recognition may already be stopped
      }
    }
    setIsListening(false);
    setInterimTranscript("");
  }, [clearRestartTimer, clearSilenceTimer, flushTranscript]);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    if (silenceTimeoutMs > 0) {
      silenceTimerRef.current = setTimeout(() => {
        // If the student has already said something (final or interim), finalize it
        const hasSpoken =
          transcriptRef.current.trim().length > 0 ||
          interimTranscriptRef.current.trim().length > 0;
        if (hasSpoken) {
          stopListening();
        }
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

    setError(null);
    isManuallyStoppedRef.current = false;
    shouldBeListeningRef.current = true;
    clearRestartTimer();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore abort error
      }
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.lang = effectiveLang;

      recognition.onstart = () => {
        setIsListening(true);
        restartAttemptsRef.current = 0;
        resetSilenceTimer();
      };

      recognition.onresult = (event) => {
        resetSilenceTimer();
        let newFinalChunk = "";
        let newInterimChunk = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result && result[0]) {
            const piece = result[0].transcript;
            if (result.isFinal) {
              newFinalChunk += piece;
            } else {
              newInterimChunk += piece;
            }
          }
        }

        if (newFinalChunk) {
          const current = transcriptRef.current.trim();
          const cleanChunk = newFinalChunk.trim();
          const combined = current ? `${current} ${cleanChunk}` : cleanChunk;
          transcriptRef.current = combined;
          interimTranscriptRef.current = "";
          setTranscript(combined);
          setInterimTranscript("");
          onFinalRef.current?.(combined);
        } else {
          interimTranscriptRef.current = newInterimChunk;
          setInterimTranscript(newInterimChunk);
        }
      };

      recognition.onerror = (event) => {
        // Ignored error types
        if (event.error === "aborted" && isManuallyStoppedRef.current) {
          return;
        }

        // 'no-speech' is non-fatal: Chrome/Edge fires this on natural pauses.
        if (event.error === "no-speech") {
          if (!isManuallyStoppedRef.current && shouldBeListeningRef.current) {
            // Keep listening, do not crash or show error
            return;
          }
        }

        let userMsg: string;
        if (event.error === "not-allowed") {
          userMsg =
            "Microphone permission was denied. Please allow microphone access in your browser settings.";
        } else if (event.error === "audio-capture") {
          userMsg =
            "No microphone was detected or audio capture is unavailable.";
        } else if (event.error === "network") {
          userMsg =
            "Speech recognition encountered a network error. Check your connection.";
        } else {
          userMsg =
            event.message || `Speech recognition error: ${event.error}`;
        }

        setError(userMsg);
        onErrorRef.current?.(userMsg);

        if (event.error === "not-allowed" || event.error === "audio-capture") {
          setIsListening(false);
          shouldBeListeningRef.current = false;
          clearSilenceTimer();
        }
      };

      recognition.onend = () => {
        // Flush any interim speech on end
        flushTranscript();

        // Auto-restart if we should still be listening and not manually stopped
        if (
          shouldBeListeningRef.current &&
          !isManuallyStoppedRef.current &&
          autoRestart &&
          restartAttemptsRef.current < 5
        ) {
          restartAttemptsRef.current += 1;
          clearRestartTimer();
          restartTimerRef.current = setTimeout(() => {
            if (shouldBeListeningRef.current && !isManuallyStoppedRef.current) {
              try {
                recognitionRef.current?.start();
              } catch {
                // If restarting throws, gracefully mark ended
                setIsListening(false);
              }
            }
          }, 150);
          return;
        }

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
    autoRestart,
    clearRestartTimer,
    clearSilenceTimer,
    continuous,
    effectiveLang,
    flushTranscript,
    interimResults,
    isSupported,
    resetSilenceTimer,
  ]);

  const resetTranscript = useCallback(() => {
    transcriptRef.current = "";
    interimTranscriptRef.current = "";
    setTranscript("");
    setInterimTranscript("");
  }, []);

  const handleSetTranscript = useCallback((text: string) => {
    transcriptRef.current = text;
    setTranscript(text);
  }, []);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      clearRestartTimer();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup errors
        }
        recognitionRef.current = null;
      }
    };
  }, [clearRestartTimer, clearSilenceTimer]);

  const fullTranscript = transcript
    ? interimTranscript
      ? `${transcript} ${interimTranscript}`
      : transcript
    : interimTranscript;

  return {
    isListening,
    transcript,
    interimTranscript,
    fullTranscript,
    isSupported,
    error,
    detectedLang: effectiveLang,
    startListening,
    stopListening,
    resetTranscript,
    setTranscript: handleSetTranscript,
    flushTranscript,
  };
}
