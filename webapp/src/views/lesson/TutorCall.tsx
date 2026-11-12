import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { useOptionalChat } from "../../context/chat";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { toSpeakableText } from "../../lib/speechText";
import {
  callModeLabel,
  callModeOptions,
  callOpener,
  callPersonaLabel,
  callPersonaOptions,
  callVoice,
  loadCallStyle,
  saveCallStyle,
  type CallStyle,
} from "../../lib/callStyle";
import { pickVoice, saveVoicePrefs, useVoicePrefs } from "../../lib/voicePrefs";
import { VoicePicker } from "../../components/learning/VoicePicker";
import styles from "./tutorCall.module.css";

/* Talk it through: a hands-free voice conversation with the tutor about
   this lesson. The student speaks, the browser turns it into text, the
   tutor answers from this lesson's notes (the Ask panel's own send path,
   with its consent gate and safety screen), and the reply is read aloud;
   then the mic opens again, until they hang up.

   Speech recognition and the voices are the browser's (Web Speech API).
   In Chrome the recognition audio goes to Google, as with any dictation in
   that browser; the call screen says so. Every turn also lands in the Ask
   panel, so the conversation can be read back afterwards. */

type CallState =
  | "idle"
  | "greeting"
  | "listening"
  | "thinking"
  | "speaking"
  | "paused"
  | "ended";

const STATE_LABEL: Record<CallState, string> = {
  idle: "Ready when you are",
  greeting: "Tutor is speaking",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Tutor is speaking",
  paused: "Mic off",
  ended: "Call ended",
};

export function TutorCall({
  materialId,
  lesson,
  onEnd,
}: {
  materialId: string;
  lesson: string;
  onEnd: () => void;
}) {
  const chat = useOptionalChat();
  const [state, setState] = useState<CallState>("idle");
  const [youSaid, setYouSaid] = useState("");
  const [tutorSaid, setTutorSaid] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  /* How the tutor talks and what kind of call it is (lib/callStyle). */
  const [style, setStyleState] = useState<CallStyle>(loadCallStyle);
  const setStyle = (next: CallStyle) => {
    setStyleState(next);
    saveCallStyle(next);
  };
  const stateRef = useRef(state);
  stateRef.current = state;
  const awaitingRef = useRef(false);
  const wasListeningRef = useRef(false);
  const wasSendingRef = useRef(false);

  const {
    isListening,
    transcript,
    fullTranscript,
    isSupported: canListen,
    error: micError,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({ silenceTimeoutMs: 2200 });
  const {
    speak,
    cancel: cancelSpeech,
    isSupported: canSpeak,
    voices,
  } = useSpeechSynthesis();
  /* The tutor's voice and speed, chosen once for every place it talks
     (lib/voicePrefs.ts). The personality still nudges pitch and pace. */
  const prefs = useVoicePrefs();

  const listen = useCallback(() => {
    if (stateRef.current === "ended") return;
    resetTranscript();
    setYouSaid("");
    setState("listening");
    startListening();
  }, [resetTranscript, startListening]);

  const say = useCallback(
    (text: string, next: CallState = "speaking") => {
      setTutorSaid(text);
      setState(next);
      speak(toSpeakableText(text), {
        persona: "alex",
        ...callVoice(style.persona),
        voice: pickVoice(voices, prefs.tutorVoice),
        rate: callVoice(style.persona).rate * prefs.tutorRate,
        onEnd: () => {
          if (
            stateRef.current === "speaking" ||
            stateRef.current === "greeting"
          )
            listen();
        },
        onError: () => {
          if (
            stateRef.current === "speaking" ||
            stateRef.current === "greeting"
          )
            listen();
        },
      });
    },
    [speak, listen, style.persona, voices, prefs.tutorVoice, prefs.tutorRate],
  );

  const begin = () => {
    setProblem(null);
    /* A fixed opening line from the app, not the model, so the call starts
       instantly and costs nothing until the student speaks. */
    say(callOpener(style, lesson), "greeting");
  };

  const hangUp = useCallback(() => {
    setState("ended");
    awaitingRef.current = false;
    stopListening();
    cancelSpeech();
    chat?.cancel();
  }, [stopListening, cancelSpeech, chat]);

  /* Words appear as they are recognised. */
  useEffect(() => {
    if (isListening) setYouSaid(fullTranscript);
  }, [isListening, fullTranscript]);

  /* Listening ended: on silence, what was said goes to the tutor. */
  useEffect(() => {
    if (
      wasListeningRef.current &&
      !isListening &&
      stateRef.current === "listening"
    ) {
      const said = transcript.trim();
      if (micError) {
        setProblem(
          micError === "not-allowed"
            ? "Learnora can't hear you: allow the microphone for this site, then press Talk."
            : "The microphone stopped. Press Talk to try again.",
        );
        setState("paused");
      } else if (!said) {
        setState("paused");
      } else if (chat) {
        setYouSaid(said);
        setState("thinking");
        awaitingRef.current = true;
        void chat.send(said, {
          sourceMode: "notebook",
          scope: { materialIds: [materialId] },
          spoken: style,
        });
      }
    }
    wasListeningRef.current = isListening;
    // Only the transition matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  /* The reply arrived: read it out, then listen again. */
  const isSending = chat?.isSending ?? false;
  useEffect(() => {
    if (wasSendingRef.current && !isSending && awaitingRef.current) {
      awaitingRef.current = false;
      const last = chat?.messages[chat.messages.length - 1];
      if (last?.role === "ai" && last.text.trim() && !last.error) {
        say(last.text);
      } else {
        setProblem(
          last?.text?.trim() ||
            "The tutor didn't answer. Press Talk to try again.",
        );
        setState("paused");
      }
    }
    wasSendingRef.current = isSending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSending]);

  useEffect(
    () => () => {
      stopListening();
      cancelSpeech();
    },
    [stopListening, cancelSpeech],
  );

  if (!chat) {
    return <p className={styles.note}>The tutor isn't available here.</p>;
  }

  if (!canListen || !canSpeak) {
    return (
      <div className={styles.call}>
        <div className={styles.avatar} data-state="idle" aria-hidden="true">
          <Icon name="phone-off" size={34} />
        </div>
        <h2 className={styles.title}>
          Calls need a browser that can listen and speak
        </h2>
        <p className={styles.note}>
          Try Chrome or Edge on a computer or Android phone. You can still ask
          the tutor by typing in Ask.
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onEnd}>
            Back to the lesson
          </Button>
          <Button variant="primary" onClick={() => chat.open()}>
            Open Ask
          </Button>
        </div>
      </div>
    );
  }

  const live = state !== "idle" && state !== "ended";

  return (
    <div className={styles.call}>
      <div className={styles.avatar} data-state={state} aria-hidden="true">
        <span className={styles.ring} />
        <span className={styles.ring} />
        <Icon name={state === "listening" ? "mic" : "volume-2"} size={34} />
      </div>
      <p className={styles.eyebrow}>Talking through</p>
      <h2 className={styles.title}>{lesson}</h2>
      {live ? (
        <p className={styles.styleLine}>
          {callPersonaLabel(style.persona)} · {callModeLabel(style.mode)}
        </p>
      ) : null}
      <p className={styles.status} role="status" aria-live="polite">
        {STATE_LABEL[state]}
      </p>

      {live || state === "ended" ? (
        <div className={styles.captions}>
          {tutorSaid ? (
            <p className={styles.caption} data-who="tutor">
              <span className={styles.who}>Tutor</span>
              {tutorSaid}
            </p>
          ) : null}
          {youSaid ? (
            <p className={styles.caption} data-who="you">
              <span className={styles.who}>You</span>
              {youSaid}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <StylePicker style={style} onChange={setStyle} />
          <div className={styles.voiceRow}>
            <VoicePicker
              label="Your tutor's voice"
              value={prefs.tutorVoice}
              onChange={(v) => saveVoicePrefs({ tutorVoice: v })}
              sample={callOpener(style, lesson)}
              pitch={callVoice(style.persona).pitch}
              rate={callVoice(style.persona).rate * prefs.tutorRate}
            />
          </div>
          <p className={styles.note}>
            Speak naturally. The tutor answers from this lesson's notes, out
            loud, then listens again. Your browser handles the speech (Chrome
            sends it to Google to transcribe). Each turn is also saved in Ask.
          </p>
        </>
      )}

      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}

      <div className={styles.actions}>
        {state === "idle" ? (
          <>
            <Button variant="secondary" onClick={onEnd}>
              Not now
            </Button>
            <Button variant="primary" size="lg" onClick={begin}>
              <Icon name="phone" size={18} /> Start the call
            </Button>
          </>
        ) : state === "ended" ? (
          <>
            <Button variant="secondary" onClick={() => chat.open()}>
              Read it back in Ask
            </Button>
            <Button variant="primary" onClick={onEnd}>
              Back to the lesson
            </Button>
          </>
        ) : (
          <>
            {state === "listening" ? (
              <button
                type="button"
                className={styles.roundButton}
                onClick={() => {
                  setState("paused");
                  stopListening();
                }}
                aria-label="Mute"
              >
                <Icon name="mic-off" size={22} />
              </button>
            ) : (
              <button
                type="button"
                className={styles.roundButton}
                onClick={() => {
                  cancelSpeech();
                  listen();
                }}
                disabled={state === "thinking"}
                aria-label={
                  state === "speaking" || state === "greeting"
                    ? "Interrupt and talk"
                    : "Talk"
                }
              >
                <Icon name="mic" size={22} />
              </button>
            )}
            <button
              type="button"
              className={styles.hangUp}
              onClick={hangUp}
              aria-label="End call"
            >
              <Icon name="phone-off" size={24} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* Two short choices before the call: the voice and the kind of call. */
function StylePicker({
  style,
  onChange,
}: {
  style: CallStyle;
  onChange: (next: CallStyle) => void;
}) {
  return (
    <div className={styles.pickers}>
      <fieldset className={styles.picker}>
        <legend className={styles.pickerLegend}>How your tutor talks</legend>
        <div className={styles.chips}>
          {callPersonaOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              className={styles.chip}
              aria-pressed={style.persona === o.id}
              title={o.hint}
              onClick={() => onChange({ ...style, persona: o.id })}
            >
              <span className={styles.chipLabel}>{o.label}</span>
              <span className={styles.chipHint}>{o.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.picker}>
        <legend className={styles.pickerLegend}>What kind of call</legend>
        <div className={styles.chips}>
          {callModeOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              className={styles.chip}
              aria-pressed={style.mode === o.id}
              title={o.hint}
              onClick={() => onChange({ ...style, mode: o.id })}
            >
              <span className={styles.chipLabel}>{o.label}</span>
              <span className={styles.chipHint}>{o.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
