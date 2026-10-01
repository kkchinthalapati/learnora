import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { Icon } from "../Icon";
import { useChat } from "../../context/chat";
import { useToast } from "../../context/toast";
import { notebooksApi } from "../../api/notebooks";
import { PersonaOffsetToolbar } from "../ai/PersonaOffsetToolbar";
import { ChatMessageBubble } from "./ChatMessage";
import { useSettings } from "../../context/settings";
import { useAiUsage } from "../../hooks/useAiUsage";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { MAX_IMAGE_DESCRIPTION } from "../../api/aiImage";
import { toSpeakableText } from "../../lib/speechText";
import type { SourceMode } from "../ai/PersonaOffsetToolbar";
import { useExams } from "../../hooks/useExams";
import { useTranslation } from "../../hooks/useTranslation";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import { looksConceptual } from "../../lib/chatPrompt";
import { localDateStr } from "../../lib/date";
import { isFlagOn } from "../../lib/flags";
import { sectionLabel } from "../../lib/sectionLabel";
import { newSessionHref } from "../../lib/sessionModes";
import styles from "./chat.module.css";

/* The workspace chat panel — ports index.html:2314-2455 and its wiring in
 * js/main.js's `bindAI` (:2359-2440).
 *
 * The vanilla registered the panel with `ModalManager`; here it is a plain
 * portal instead, deliberately. `ModalManager`/`OverlayStackProvider` traps
 * focus and locks scroll, which is right for a dialog but wrong for this: the
 * panel is a floating assistant the student is meant to read the page
 * *around*, and the vanilla's own Escape/backdrop behaviour never applied to
 * it either. */

const GREETING =
  "I can explain a topic, quiz you, turn your notes into flashcards, or sort out your tasks and timer. I can get things wrong, so check anything important against your notes.";

const SUGGESTIONS = [
  /* Explaining and quizzing lead: they are what a student opens the panel
     for most, and neither had a starter — the four chips were all admin. */
  {
    icon: "brain",
    label: "Explain something",
    prompt: "Explain ",
    autoSend: false,
  },
  {
    icon: "help-circle",
    label: "Quiz me",
    prompt: "Quiz me on ",
    autoSend: false,
  },
  {
    icon: "list-checks",
    label: "What are my tasks?",
    prompt: "What are my pending tasks?",
    autoSend: true,
  },
  {
    icon: "layers",
    label: "Create flashcards",
    prompt: "Generate flashcards from my notes",
    autoSend: false,
  },
  /* Deliberately unsent: this chip used to fire "Start a 25-minute focus
     timer" immediately, so tapping it silently committed the student to 25
     minutes. It drops an unfinished prompt in the box instead. */
  {
    icon: "clock",
    label: "Start a timer",
    prompt: "Start a focus timer for ",
    autoSend: false,
  },
] as const;

/* Offered after an answer, not before one.
 *
 * "I still don't get it" is the most common thing a stuck student does
 * next, and it cost a full typed sentence every time — the live pass
 * showed the tutor adapts well when asked, so the only thing standing
 * between a confused student and a better explanation was the typing.
 * These send immediately: each is already a complete instruction, and
 * dropping an unfinished prompt in the box would just be more typing. */
const FOLLOW_UPS = [
  {
    icon: "help-circle",
    label: "Explain simpler",
    prompt: "I still don't get it. Can you explain that more simply?",
  },
  {
    icon: "book-open",
    label: "Give an example",
    prompt: "Can you give me a worked example of that?",
  },
] as const;

export function TurboChat() {
  const {
    messages,
    isOpen,
    isFullscreen,
    isSending,
    sendPhase,
    cancel,
    file,
    draft,
    clearDraft,
    close,
    toggleFullscreen,
    send,
    attachFile,
    clearFile,
    saveCards,
    generateImage,
    saveImage,
  } = useChat();
  const { showToast } = useToast();
  const { settings, updateAndSave } = useSettings();
  const [sourceMode, setSourceMode] = useState<SourceMode>(
    settings.webAccess ? "hybrid" : "notebook",
  );

  const handleAddToNotebook = useCallback(
    async (citation: { title: string; url?: string; snippet?: string }) => {
      try {
        const list = await notebooksApi.fetch();
        let targetId = list[0]?.id;
        if (!targetId) {
          const created = await notebooksApi.add({
            title: "Web Research Notebook",
            subject: "General",
            color: "teal",
          });
          targetId = created.id;
        }
        await notebooksApi.addSource(targetId, {
          title: citation.title,
          type: "web",
          url: citation.url,
          content: citation.snippet || citation.url || citation.title,
          selected: true,
        });
        showToast(`Added "${citation.title}" to notebook.`);
      } catch (err) {
        console.error("Failed to add citation to notebook:", err);
        showToast("That source could not be saved. Please try again.", {
          error: true,
        });
      }
    },
    [showToast],
  );

  const [input, setInput] = useState("");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const t = useTranslation();
  const exams = useExams();
  const today = localDateStr();
  const nextExam = (exams.data ?? [])
    .filter((e) => e.exam_date && e.exam_date >= today)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date))[0];
  const guessFirstOn = isFlagOn("guessFirst");
  /* Armed by the "Generate image" chip: the next send draws a diagram
     instead of asking the tutor. Always the student's own click — the model
     has no way to turn it on. */
  const [imageMode, setImageMode] = useState(false);
  const { usageFor, isPending: isUsagePending } = useAiUsage();

  /* --- voice ------------------------------------------------------------
     Browser speech only (Web Speech API): no keys, no Learnora server
     involved in recognition. Note the browser may use its vendor's cloud
     for it — Chrome streams the audio to Google — which is the browser's
     own behaviour, the same as its dictation elsewhere. The transcript is
     then sent exactly like typed text: same send(), same consent gate, same
     server-side safety screen. Every control is hidden where the browser
     has no support, and typing is never affected. */
  const {
    isListening,
    transcript,
    fullTranscript,
    isSupported: canListen,
    error: micError,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({ silenceTimeoutMs: 3000 });
  const {
    speak,
    cancel: cancelSpeech,
    isSpeaking,
    isSupported: canSpeak,
  } = useSpeechSynthesis();
  /* Hands-free: after a spoken turn, the reply is read out and the mic
     reopens, until the student presses Stop. Only while spoken replies are
     on — without them there is no cue for when to talk again. */
  const [handsFree, setHandsFree] = useState(false);
  const handsFreeRef = useRef(false);
  const stoppedByStudentRef = useRef(false);
  const wasListeningRef = useRef(false);
  const lastSpokenIdRef = useRef<string | null | undefined>(undefined);

  const startVoice = () => {
    cancelSpeech();
    setImageMode(false);
    stoppedByStudentRef.current = false;
    resetTranscript();
    setInput("");
    handsFreeRef.current = true;
    setHandsFree(true);
    startListening();
  };

  const stopVoice = useCallback(() => {
    stoppedByStudentRef.current = true;
    handsFreeRef.current = false;
    setHandsFree(false);
    stopListening();
    cancelSpeech();
  }, [cancelSpeech, stopListening]);

  /* The words appear in the box as they are recognised. */
  useEffect(() => {
    if (isListening) setInput(fullTranscript);
  }, [isListening, fullTranscript]);

  /* Listening ended. On silence, what was said is sent; on Stop it stays in
     the box to edit or send by hand; on an error nothing is sent. */
  useEffect(() => {
    if (wasListeningRef.current && !isListening) {
      const said = transcript.trim();
      if (said && !stoppedByStudentRef.current && !micError) {
        setInput("");
        resetTranscript();
        const awaitingGuessNow = messages[messages.length - 1]?.guessPrompt === true;
        void send(said, {
          sourceMode,
          guessFirst: !awaitingGuessNow && guessFirstOn && looksConceptual(said),
        });
      } else if (!said || micError) {
        handsFreeRef.current = false;
        setHandsFree(false);
      }
    }
    wasListeningRef.current = isListening;
    // Only the transition matters; the rest is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  /* Read each new reply aloud when that is switched on. Replies restored
     from an earlier visit are not: only ones that arrive while this panel
     is mounted. */
  const spokenReplies = settings.aiSpokenReplies && canSpeak;
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (lastSpokenIdRef.current === undefined) {
      lastSpokenIdRef.current = last?.id ?? null;
      return;
    }
    if (!last || last.role !== "ai" || last.pending || last.id === lastSpokenIdRef.current) {
      return;
    }
    lastSpokenIdRef.current = last.id;
    if (!spokenReplies || last.error) {
      if (handsFreeRef.current && !spokenReplies) {
        handsFreeRef.current = false;
        setHandsFree(false);
      }
      return;
    }
    const words = last.image
      ? "Here's the picture you asked for."
      : last.cards
        ? `I've made ${last.cards.length} flashcards for you.`
        : toSpeakableText(last.text);
    if (!words) return;
    speak(words, {
      onEnd: () => {
        if (handsFreeRef.current) {
          resetTranscript();
          startListening();
        }
      },
    });
  }, [messages, spokenReplies, speak, resetTranscript, startListening]);

  /* Closing the panel ends any listening or speaking. */
  useEffect(() => {
    if (!isOpen) stopVoice();
  }, [isOpen, stopVoice]);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  /* A prompt pushed in from outside (a dashboard chip, the command bar). */
  useEffect(() => {
    if (!draft) return;
    setInput(draft);
    clearDraft();
    const el = inputRef.current;
    if (el) {
      el.focus();
      /* Park the caret at the end so a chip that deliberately leaves the
         prompt unfinished ("Start a focus timer for …") can be completed by
         typing straight away. */
      el.setSelectionRange(draft.length, draft.length);
    }
  }, [draft, clearDraft]);

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messages]);

  /* Esc closes the drawer; ⌘J (ChatProvider) toggles it. */
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  if (!isOpen) return null;

  /* Guess first (experimental): a conceptual question gets a question back
     before the answer. Not when the student is already answering one — that
     reply *is* their guess, and it must be answered. */
  const awaitingGuess = messages[messages.length - 1]?.guessPrompt === true;

  const submit = (text: string, { explain = false } = {}) => {
    const value = text.trim();
    if (imageMode) {
      if (!value) return;
      setImageMode(false);
      setInput("");
      void generateImage(value);
      return;
    }
    if (!value && !file) return;
    setInput("");
    const guessFirst =
      !explain && !awaitingGuess && guessFirstOn && looksConceptual(value);
    void send(value || "Analyse this.", { sourceMode, guessFirst });
  };

  const imageUsage = usageFor("image");
  const imageAllowance =
    isUsagePending || imageUsage.unlimited
      ? null
      : imageUsage.exceeded
        ? "No images left today — it resets at midnight UTC."
        : `${imageUsage.remaining} left today`;

  const toggleImageMode = () => {
    setImageMode((on) => !on);
    inputRef.current?.focus();
  };

  const imageChip = (
    <button
      type="button"
      className={`${styles.chip}${imageMode ? ` ${styles.chipActive}` : ""}`}
      aria-pressed={imageMode}
      disabled={isSending}
      onClick={toggleImageMode}
    >
      <Icon name="image" size={14} />
      Generate image
    </button>
  );

  /* "Open as session": the thread's question becomes a Session's objective,
     carried by CognitiveBridge the way every tool-to-tool handoff is. */
  const openAsSession = () => {
    const question = [...messages]
      .reverse()
      .find((m) => m.role === "user")?.text;
    const topic = (question || input).trim();
    CognitiveBridge.setPayload({
      subject: nextExam?.exam_name ?? "General",
      topic: topic || "What I was asking about",
      sourceTool: "notes",
      evidencePrompt: messages
        .slice(-6)
        .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.text}`)
        .join("\n"),
    });
    close();
    void navigate(newSessionHref("explain", { topic: topic || undefined }));
  };

  /* Only against a finished answer. Offering "explain simpler" while one
     is still arriving invites a second request the student did not need,
     and offering it on an error would re-ask instead of retrying. */
  const lastMessage = messages[messages.length - 1];
  const showFollowUps =
    lastMessage?.role === "ai" && !lastMessage.pending && !lastMessage.error;

  const chipClicked = (suggestion: (typeof SUGGESTIONS)[number]) => {
    if (suggestion.autoSend) {
      submit(suggestion.prompt);
      return;
    }
    setInput(suggestion.prompt);
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(suggestion.prompt.length, suggestion.prompt.length);
    }
  };

  const panel = (
    <div
      ref={panelRef}
      className={`${styles.panel}${isFullscreen ? ` ${styles.fullscreen}` : ""}`}
      role="region"
      aria-label="Learnora AI chat"
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current++;
        setIsDropTarget(true);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDropTarget(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setIsDropTarget(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) attachFile(dropped);
      }}
    >
      {isDropTarget ? (
        <div className={styles.dropOverlay}>
          <span>Drop files here</span>
        </div>
      ) : null}

      <div className={styles.header} data-testid="chat-header">
        <div className={styles.headerText}>
          <h2 className={styles.headerTitle}>Ask</h2>
          {/* What the tutor can see, so a student knows what "this" means. */}
          <span className={styles.headerContext}>
            Knows you're on {sectionLabel(pathname, t)}
            {nextExam ? ` · ${nextExam.exam_name}` : ""}
          </span>
        </div>
        <div className={styles.headerControls}>
          {canSpeak ? (
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Read replies aloud"
              aria-pressed={settings.aiSpokenReplies}
              title={
                settings.aiSpokenReplies
                  ? "Replies are read aloud — click to stop"
                  : "Read replies aloud"
              }
              onClick={() => {
                const next = !settings.aiSpokenReplies;
                if (!next) {
                  cancelSpeech();
                  handsFreeRef.current = false;
                  setHandsFree(false);
                }
                updateAndSave({ aiSpokenReplies: next });
              }}
            >
              <Icon
                name={settings.aiSpokenReplies ? "volume-2" : "volume-x"}
                size={16}
              />
            </button>
          ) : null}
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={
              isFullscreen ? "Exit full screen" : "Toggle full screen"
            }
            aria-pressed={isFullscreen}
            onClick={toggleFullscreen}
          >
            <Icon name={isFullscreen ? "minimize" : "maximize"} size={16} />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Close AI chat"
            onClick={close}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>

      <div className={styles.feed} ref={feedRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className={`${styles.bubble} ${styles.aiBubble}`}>
            {GREETING}
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessageBubble
              key={message.id}
              message={message}
              onSaveCards={saveCards}
              onSaveImage={saveImage}
              onAddToNotebook={handleAddToNotebook}
              sendPhase={sendPhase}
              onCancel={cancel}
              /* Only the latest failure can be retried: once a retry has
                 been answered, an older "Try again" would ask twice. */
              onRetry={
                message.id === messages[messages.length - 1]?.id
                  ? (m) => {
                      if (!m.retryQuery || isSending) return;
                      if (m.retryAsImage) void generateImage(m.retryQuery);
                      else void send(m.retryQuery, m.retryOptions);
                    }
                  : undefined
              }
            />
          ))
        )}
      </div>

      {/* Follow-ups replace the starters once there is something to follow
          up on: the starters are for an empty panel, and showing both
          would put six chips under every answer. */}
      {awaitingGuess && !isSending ? (
        <div className={styles.guess}>
          <p className={styles.guessCaption}>
            A guess is fine. Answering first makes the explanation stick better.
          </p>
          <div className={styles.suggestions}>
            <button
              type="button"
              className={styles.chip}
              onClick={() => submit("I'm not sure, give me a hint.")}
            >
              I'm not sure, give me a hint
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={() => submit("Just explain it.", { explain: true })}
            >
              Just explain it
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.suggestions}>
          {showFollowUps
            ? FOLLOW_UPS.map((followUp) => (
                <button
                  key={followUp.label}
                  type="button"
                  className={styles.chip}
                  disabled={isSending}
                  onClick={() => submit(followUp.prompt)}
                >
                  <Icon name={followUp.icon} size={14} />
                  {followUp.label}
                </button>
              ))
            : SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.label}
                  type="button"
                  className={styles.chip}
                  onClick={() => chipClicked(suggestion)}
                >
                  <Icon name={suggestion.icon} size={14} />
                  {suggestion.label}
                </button>
              ))}
          {/* Offered with both sets: drawing is as useful before a first
              question as after an answer. */}
          {imageChip}
        </div>
      )}

      {imageMode ? (
        <div className={styles.imageModeHint} role="status">
          <Icon name="image" size={14} />
          <span>
            <strong>Image mode</strong> — describe a diagram and press send.
            {imageAllowance ? ` ${imageAllowance}` : ""}
          </span>
          <button
            type="button"
            className={styles.imageModeCancel}
            onClick={() => setImageMode(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {file ? (
        <div className={styles.filePill}>
          <span>{file.name}</span>
          <button
            type="button"
            className={styles.removeFile}
            aria-label={`Remove ${file.name}`}
            onClick={clearFile}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ) : null}

      {micError ? (
        <p className={styles.voiceError} role="alert">
          <Icon name="alert-circle" size={14} />
          {micError} You can still type your question.
        </p>
      ) : isListening || isSpeaking || handsFree ? (
        <div className={styles.voiceStatus} role="status">
          {isListening ? (
            <>
              <span className={styles.recordingDot} aria-hidden="true" />
              <span>Listening — pause when you're done and I'll send it.</span>
            </>
          ) : isSpeaking ? (
            <>
              <Icon name="volume-2" size={14} />
              <span>Reading the reply aloud…</span>
            </>
          ) : (
            <>
              <Icon name="mic" size={14} />
              <span>Voice conversation on.</span>
            </>
          )}
          <button
            type="button"
            className={styles.voiceStop}
            onClick={stopVoice}
          >
            Stop
          </button>
        </div>
      ) : null}

      <div className={styles.toolbarWrapper}>
        <PersonaOffsetToolbar
          depth={settings.aiDepth}
          style={settings.aiStyle}
          sourceMode={sourceMode}
          onDepthChange={(aiDepth) => updateAndSave({ aiDepth })}
          onStyleChange={(aiStyle) => updateAndSave({ aiStyle })}
          onSourceModeChange={(nextMode) => {
            setSourceMode(nextMode);
            updateAndSave({ webAccess: nextMode !== "notebook" });
          }}
        />
      </div>

      <div className={styles.modeRow} role="group" aria-label="How to answer">
        <button type="button" className={styles.modeChip} aria-pressed="true">
          Quick answer
        </button>
        <button
          type="button"
          className={styles.modeChip}
          aria-pressed="false"
          onClick={openAsSession}
          disabled={messages.every((m) => m.role !== "user") && !input.trim()}
        >
          Open as session
        </button>
      </div>

      <form
        className={styles.dock}
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <label className={styles.uploadBtn}>
          <Icon name="paperclip" size={20} label="Attach a file" />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.docx,.png,.jpg,.jpeg,.webp"
            hidden
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) attachFile(picked);
              /* Reset so re-picking the same file fires `change` again. */
              e.target.value = "";
            }}
          />
        </label>
        {canListen ? (
          <button
            type="button"
            className={`${styles.uploadBtn} ${styles.micBtn}${
              isListening ? ` ${styles.micBtnActive}` : ""
            }`}
            aria-label={isListening ? "Stop listening" : "Speak your question"}
            aria-pressed={isListening}
            disabled={isSending && !isListening}
            onClick={isListening ? stopVoice : startVoice}
          >
            <Icon name={isListening ? "mic-off" : "mic"} size={20} />
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={input}
          placeholder={
            imageMode
              ? "Describe the diagram, e.g. a labelled plant cell"
              : awaitingGuess
                ? "Type your guess…"
                : "Ask a question, or ask me to do something"
          }
          maxLength={imageMode ? MAX_IMAGE_DESCRIPTION : undefined}
          autoComplete="off"
          aria-label="AI chat input"
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className={styles.sendBtn}
          aria-label={imageMode ? "Draw image" : "Send message"}
          /* Also disabled on an empty box. It used to look pressable with
             nothing typed, do nothing at all, and say nothing about why.
             An attachment on its own is enough to send ("Analyse this."). */
          disabled={
            isSending || (input.trim().length === 0 && (imageMode || !file))
          }
        >
          <Icon name="send" size={18} />
        </button>
      </form>
    </div>
  );

  return createPortal(
    <>
      {isFullscreen ? null : (
        <div className={styles.scrim} aria-hidden="true" onClick={close} />
      )}
      {panel}
    </>,
    document.body,
  );
}
