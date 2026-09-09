import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { useNotebooks, useNotebook } from "../../hooks/useNotebooks";
import { useStudentEvidence } from "../../hooks/useStudentEvidence";
import { formatEvidenceForPrompt } from "../../lib/studentEvidence";
import { useToast } from "../../context/toast";
import {
  startSparringSession,
  submitStudentAnswer,
  generateNextSparringRound,
  VIVA_ROLES,
  VIVA_FOCUS_GOALS,
  type SparringSession,
  type SparringPersona,
  type GroundedCitation,
} from "../../api/aiSparring";
import {
  useMisconceptions,
  useRecordMisconceptions,
} from "../../hooks/useMisconceptions";
import {
  candidatesFromSparring,
  formatMisconceptionsForPrompt,
} from "../../lib/misconceptions";
import { SparringStage } from "./SparringStage";
import styles from "./sparring.module.css";

const QUICK_STARTER_TOPICS = [
  "Newton's Third Law & Momentum",
  "Photosynthesis vs Cellular Respiration",
  "Keynesian vs Classical Economics",
  "DNA Replication & Polymerase Chain Reaction",
  "Asynchronous Event Loop in JavaScript",
];

export function SocraticSparringView() {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const recordMisconceptions = useRecordMisconceptions();

  const queryTopic = searchParams.get("topic") || "";
  const queryNotebookId = searchParams.get("notebookId") || "";

  const { notebooks } = useNotebooks();
  const linkedNotebook = useNotebook(queryNotebookId).notebook;

  const { evidence: studentEvidence, isPending: isEvidencePending } =
    useStudentEvidence();
  const evidenceBlock = isEvidencePending
    ? undefined
    : formatEvidenceForPrompt(studentEvidence);
  const { all: ledger } = useMisconceptions();
  const ledgerBlock =
    ledger.length > 0 ? formatMisconceptionsForPrompt(ledger) : undefined;

  // Setup / Configuration State
  const [topicInput, setTopicInput] = useState(queryTopic || "");
  const [selectedNotebookId, setSelectedNotebookId] = useState(
    queryNotebookId || "",
  );
  const [pastedNotes, setPastedNotes] = useState("");
  const [showNotesInput, setShowNotesInput] = useState(false);

  // Vibe / Role & Goals selection
  const [selectedVibeId, setSelectedVibeId] = useState<string>("examiner");
  const [customVibeText, setCustomVibeText] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState<string>("intuition");
  const [customGoalText, setCustomGoalText] = useState("");

  // In-Call Session State
  const [session, setSession] = useState<SparringSession | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCallPaused, setIsCallPaused] = useState(false);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [showEndCallModal, setShowEndCallModal] = useState(false);

  // Interaction State
  const [keyboardInput, setKeyboardInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [autoPlayAudio, setAutoPlayAudio] = useState(true);

  const dialogueEndRef = useRef<HTMLDivElement | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Speech Synthesis Hook
  const {
    speak,
    cancel: cancelSpeech,
    isSpeaking,
    currentSpeaker: activeAiSpeaker,
    audioRate,
    setAudioRate,
  } = useSpeechSynthesis();

  // Speech Recognition Hook
  const {
    isListening,
    transcript,
    interimTranscript,
    fullTranscript,
    isSupported: isSttSupported,
    startListening,
    stopListening,
    resetTranscript,
    flushTranscript,
  } = useSpeechRecognition({
    silenceTimeoutMs: 4000,
    onFinalTranscript: (text) => {
      if (text.trim()) {
        setKeyboardInput(text);
      }
    },
  });

  // Call timer tick
  useEffect(() => {
    if (session && !isCallPaused) {
      callTimerRef.current = setInterval(() => {
        setCallDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    };
  }, [session, isCallPaused]);

  // Turn-taking helper: speak AI round, then auto-listen for student response
  const playAiRound = useCallback(
    (speechText: string, speaker: SparringPersona) => {
      if (!autoPlayAudio) return;
      speak(speechText, {
        persona: speaker,
        onEnd: () => {
          // Seamlessly switch to listening when AI finishes speaking
          if (autoPlayAudio && isSttSupported && !isCallPaused) {
            resetTranscript();
            startListening();
          }
        },
      });
    },
    [
      autoPlayAudio,
      isCallPaused,
      isSttSupported,
      resetTranscript,
      speak,
      startListening,
    ],
  );

  // Scroll to bottom on new dialogue entry
  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [session?.dialogue, interimTranscript]);

  // Initial prefill / start from query params
  useEffect(() => {
    if (queryTopic && !session && !isLoadingSession) {
      void handleStartSession(queryTopic, queryNotebookId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryTopic, queryNotebookId]);

  // Determine active vibe title & prompt instruction
  const activeRolePreset = VIVA_ROLES.find((r) => r.id === selectedVibeId);
  const activeVibe =
    selectedVibeId === "custom"
      ? customVibeText.trim() || "Custom Sparring Partner"
      : activeRolePreset?.promptInstruction || "Tough viva examiner";
  const activeVibeTitle =
    selectedVibeId === "custom"
      ? customVibeText.trim() || "Custom Role"
      : activeRolePreset?.title || "Tough CBSE Board Examiner";

  // Determine active goal text
  const activeGoalPreset = VIVA_FOCUS_GOALS.find(
    (g) => g.id === selectedGoalId,
  );
  const activeFocusGoal =
    selectedGoalId === "custom"
      ? customGoalText.trim() || "General Conceptual Viva"
      : activeGoalPreset?.title || "Conceptual Intuition";

  const handleStartSession = async (topicToUse?: string, nbId?: string) => {
    const activeTopic = (topicToUse ?? topicInput).trim();
    if (!activeTopic) {
      showToast("Please enter or select a topic to start sparring.", {
        error: true,
      });
      return;
    }

    cancelSpeech();
    stopListening();
    resetTranscript();
    setIsLoadingSession(true);
    setIsCallPaused(false);
    setCallDurationSeconds(0);
    setShowEndCallModal(false);

    try {
      const notebook = nbId
        ? notebooks.find((n) => n.id === nbId)
        : selectedNotebookId
          ? notebooks.find((n) => n.id === selectedNotebookId)
          : undefined;

      const combinedNotes = [notebook?.notes || "", pastedNotes.trim()]
        .filter(Boolean)
        .join("\n\n---\n\n");

      const newSession = await startSparringSession(
        activeTopic,
        combinedNotes || undefined,
        notebook?.id,
        evidenceBlock,
        ledgerBlock,
        {
          vibe: activeVibe,
          focusGoal: activeFocusGoal,
        },
      );

      setSession(newSession);
      playAiRound(
        newSession.currentChallenge.speechText,
        newSession.currentChallenge.speaker,
      );
    } catch {
      showToast(
        "Failed to start sparring session. Using offline sparring partner.",
      );
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleToggleMic = () => {
    if (isListening) {
      stopListening();
      const speech = flushTranscript();
      if (speech.trim()) {
        void handleSendAnswer(speech);
      }
    } else {
      if (!isSttSupported) {
        showToast(
          "Speech recognition is not supported in this browser. You can type your answer below.",
        );
        setShowTextInput(true);
        return;
      }
      cancelSpeech();
      resetTranscript();
      setKeyboardInput("");
      startListening();
    }
  };

  const handleSendAnswer = async (speechOrText?: string) => {
    if (!session) return;
    const answer = (speechOrText ?? keyboardInput ?? fullTranscript).trim();
    if (!answer) return;

    if (isListening) {
      stopListening();
    }
    cancelSpeech();
    setIsSubmitting(true);
    setKeyboardInput("");
    resetTranscript();

    try {
      // The session stores the exact combined context used for its opening,
      // including both a notebook and any pasted notes.
      const notesContext = session.notesContext;

      const result = await submitStudentAnswer(session, answer, notesContext);
      setSession(result.session);

      recordMisconceptions(
        candidatesFromSparring(result.feedback, {
          subject: result.session.topic,
          topic: result.session.topic,
          sessionId: result.session.id,
        }),
      );

      // AI articulates critique and probes with next challenge
      const spokenResponse = `${result.feedback.shortCritique} ${result.nextRound.speechText}`;
      playAiRound(spokenResponse, result.nextRound.speaker);
    } catch {
      showToast("Error evaluating answer. Check your connection.", {
        error: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDoneSpeaking = () => {
    const speech = flushTranscript();
    stopListening();
    if (speech.trim()) {
      void handleSendAnswer(speech);
    }
  };

  const handlePauseCall = () => {
    cancelSpeech();
    stopListening();
    setIsCallPaused(true);
    showToast("Viva call paused.");
  };

  const handleResumeCall = () => {
    setIsCallPaused(false);
    showToast("Viva call resumed.");
    if (session && autoPlayAudio) {
      speak(session.currentChallenge.speechText, {
        persona: session.currentChallenge.speaker,
      });
    }
  };

  const handleEndCall = () => {
    cancelSpeech();
    stopListening();
    setIsCallPaused(true);
    setShowEndCallModal(true);
  };

  const handleSkipOrNewAngle = async () => {
    if (!session || isSubmitting) return;
    cancelSpeech();
    stopListening();
    setIsSubmitting(true);

    try {
      const notesContext =
        linkedNotebook?.notes ||
        (selectedNotebookId
          ? notebooks.find((n) => n.id === selectedNotebookId)?.notes
          : undefined) ||
        pastedNotes.trim() ||
        undefined;

      const nextRound = await generateNextSparringRound(session, notesContext);

      setSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentRound: nextRound.roundNumber,
          currentChallenge: nextRound,
          dialogue: [
            ...prev.dialogue,
            {
              id: `entry-angle-${Date.now()}`,
              speaker: nextRound.speaker,
              name: nextRound.personaName,
              avatar: nextRound.personaAvatar,
              content: nextRound.speechText,
              timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              citations: nextRound.citations,
            },
          ],
        };
      });

      playAiRound(nextRound.speechText, nextRound.speaker);
    } catch {
      showToast("Unable to generate new angle.", { error: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReplayCurrentPrompt = () => {
    if (!session) return;
    const current = session.currentChallenge;
    speak(current.speechText, { persona: current.speaker });
  };

  const handleToggleSpeed = () => {
    const nextRate = audioRate === 1.0 ? 1.25 : 1.0;
    setAudioRate(nextRate);
    showToast(`Voice speed set to ${nextRate}x`);
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.titleArea}>
            <span className={styles.eyebrow}>
              <Icon name="mic" size={14} />
              <span>Viva / Test Practice</span>
            </span>
            <h1 className={styles.pageTitle}>Oral Exam & Viva Practice</h1>
            <p className={styles.pageSubtitle}>
              Defend a topic against oral exam questions and viva
              counterexamples. Speak or type; voice is optional.
            </p>
          </div>

          <div className={styles.headerControls}>
            <button
              type="button"
              className={styles.audioToggleBtn}
              onClick={() => {
                const next = !autoPlayAudio;
                setAutoPlayAudio(next);
                if (!next) cancelSpeech();
                showToast(
                  next ? "Voice playback enabled." : "Voice playback muted.",
                );
              }}
              title={
                autoPlayAudio
                  ? "Mute automatic speech output"
                  : "Unmute speech output"
              }
            >
              <Icon name={autoPlayAudio ? "volume-2" : "volume-x"} size={16} />
              <span>{autoPlayAudio ? "Voice: On" : "Voice: Muted"}</span>
            </button>

            {session && (
              <>
                <button
                  type="button"
                  className={styles.audioToggleBtn}
                  onClick={handleToggleSpeed}
                  title="Toggle voice playback speed (1x / 1.25x)"
                >
                  <Icon name="clock" size={16} />
                  <span>Speed: {audioRate}x</span>
                </button>

                <button
                  type="button"
                  className={styles.audioToggleBtn}
                  onClick={handleReplayCurrentPrompt}
                  title="Replay the current challenge audio"
                >
                  <Icon name="refresh-cw" size={16} />
                  <span>Replay Question</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Setup View (When Call is Not Active) */}
      {!session ? (
        <section className={styles.topicCard} aria-label="Topic Selection">
          <div className={styles.topicCardTitle}>What should we challenge?</div>

          {/* Topic input & notebook dropdown */}
          <div className={styles.topicInputRow}>
            <input
              type="text"
              className={styles.topicInput}
              placeholder="e.g. Newton's Third Law, Keynesian Economics, Cell Division…"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleStartSession();
              }}
            />

            {notebooks.length > 0 && (
              <select
                className={styles.topicInput}
                value={selectedNotebookId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedNotebookId(id);
                  const nb = notebooks.find((n) => n.id === id);
                  if (nb && !topicInput) setTopicInput(nb.title);
                }}
                aria-label="Select notebook context"
              >
                <option value="">Ground in notebook… (optional)</option>
                {notebooks.map((nb) => (
                  <option key={nb.id} value={nb.id}>
                    📓 {nb.title} ({nb.subject})
                  </option>
                ))}
              </select>
            )}

            <Button
              variant="primary"
              onClick={() => void handleStartSession()}
              disabled={isLoadingSession || !topicInput.trim()}
            >
              {isLoadingSession ? "Preparing questions…" : "Start challenge"}
            </Button>
          </div>

          {/* Suggested Starter Topics */}
          <div className={styles.starterChips}>
            <span className={styles.chipsLabel}>Suggested:</span>
            {QUICK_STARTER_TOPICS.map((topic) => (
              <button
                key={topic}
                type="button"
                className={styles.chipBtn}
                onClick={() => {
                  setTopicInput(topic);
                  void handleStartSession(topic);
                }}
              >
                {topic}
              </button>
            ))}
          </div>

          {/* How you want the AI to act (Vibe / Role) */}
          <div className={styles.setupSection}>
            <div className={styles.setupHeadingRow}>
              <span className={styles.setupSectionTitle}>
                How you want it to act (Vibe / Role)
              </span>
            </div>

            <div className={styles.vibeGrid}>
              {VIVA_ROLES.map((role) => {
                const isSelected = selectedVibeId === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    className={`${styles.vibeCard} ${
                      isSelected ? styles.vibeCardSelected : ""
                    }`}
                    onClick={() => setSelectedVibeId(role.id)}
                    aria-pressed={isSelected}
                  >
                    <span className={styles.vibeCardIcon}>{role.icon}</span>
                    <span className={styles.vibeCardTitle}>{role.title}</span>
                    <p className={styles.vibeCardDesc}>{role.description}</p>
                  </button>
                );
              })}

              {/* Custom Vibe Card */}
              <button
                type="button"
                className={`${styles.vibeCard} ${
                  selectedVibeId === "custom" ? styles.vibeCardSelected : ""
                }`}
                onClick={() => setSelectedVibeId("custom")}
                aria-pressed={selectedVibeId === "custom"}
              >
                <span className={styles.vibeCardIcon}>✨</span>
                <span className={styles.vibeCardTitle}>Custom Persona</span>
                <p className={styles.vibeCardDesc}>
                  Enter any custom role (e.g. Oxford Professor, Tech
                  Interviewer).
                </p>
              </button>
            </div>

            {selectedVibeId === "custom" && (
              <input
                type="text"
                className={styles.customVibeInput}
                placeholder="Describe your AI partner (e.g., 'Strict Medical Viva Attending', 'Encouraging Senior Mentor')"
                value={customVibeText}
                onChange={(e) => setCustomVibeText(e.target.value)}
                aria-label="Custom AI persona"
              />
            )}
          </div>

          {/* What you want to focus on (Goals) */}
          <div className={styles.setupSection}>
            <div className={styles.setupHeadingRow}>
              <span className={styles.setupSectionTitle}>
                What you want to focus on (Goals)
              </span>
            </div>

            <div className={styles.goalsRow}>
              {VIVA_FOCUS_GOALS.map((goal) => {
                const isSelected = selectedGoalId === goal.id;
                return (
                  <button
                    key={goal.id}
                    type="button"
                    className={`${styles.goalPill} ${
                      isSelected ? styles.goalPillSelected : ""
                    }`}
                    onClick={() => setSelectedGoalId(goal.id)}
                    aria-pressed={isSelected}
                  >
                    <span>{goal.icon}</span>
                    <span>{goal.title}</span>
                  </button>
                );
              })}

              <button
                type="button"
                className={`${styles.goalPill} ${
                  selectedGoalId === "custom" ? styles.goalPillSelected : ""
                }`}
                onClick={() => setSelectedGoalId("custom")}
                aria-pressed={selectedGoalId === "custom"}
              >
                <span>✏️</span>
                <span>Custom focus…</span>
              </button>
            </div>

            {selectedGoalId === "custom" && (
              <input
                type="text"
                className={styles.customVibeInput}
                placeholder="Specific formulas, chapters, or edge cases to drill into…"
                value={customGoalText}
                onChange={(e) => setCustomGoalText(e.target.value)}
                aria-label="Custom focus goal"
              />
            )}
          </div>

          {/* Optional Paste Revision Notes Area */}
          <div className={styles.setupSection}>
            <button
              type="button"
              className={styles.notesToggleBtn}
              onClick={() => setShowNotesInput((prev) => !prev)}
            >
              <Icon
                name={showNotesInput ? "chevron-up" : "chevron-down"}
                size={14}
              />
              <span>
                {showNotesInput
                  ? "Hide pasted notes context"
                  : "+ Paste syllabus notes or textbook excerpts"}
              </span>
            </button>

            {showNotesInput && (
              <div className={styles.notesAreaWrapper}>
                <textarea
                  className={styles.notesTextarea}
                  placeholder="Paste revision notes, formulas, or key concepts here to ground the oral viva questions…"
                  value={pastedNotes}
                  onChange={(e) => setPastedNotes(e.target.value)}
                  aria-label="Paste revision notes context"
                />
              </div>
            )}
          </div>
        </section>
      ) : (
        <>
          {/* Sparring Stage Arena (Call AI Live In-Progress Experience) */}
          <SparringStage
            currentSpeaker={isListening ? "student" : activeAiSpeaker}
            activeAiSpeaker={activeAiSpeaker}
            isListening={isListening}
            isSpeaking={isSpeaking}
            conceptAnchor={session.currentChallenge.conceptAnchor}
            onToggleMic={handleToggleMic}
            micDisabled={isSubmitting}
            vibeTitle={activeVibeTitle}
            focusGoal={activeFocusGoal}
            interimTranscript={interimTranscript}
            confirmedTranscript={transcript}
            onDoneSpeaking={handleDoneSpeaking}
            onPauseCall={handlePauseCall}
            onResumeCall={handleResumeCall}
            isCallPaused={isCallPaused}
            onEndCall={handleEndCall}
            audioRate={audioRate}
            onToggleAudioRate={handleToggleSpeed}
            isAudioMuted={!autoPlayAudio}
            onToggleAudioMuted={() => {
              const next = !autoPlayAudio;
              setAutoPlayAudio(next);
              if (!next) cancelSpeech();
            }}
            callDurationSeconds={callDurationSeconds}
          />

          {/* Performance Metrics Grid */}
          {session.cumulativeScores.roundsCount > 0 && (
            <section
              className={styles.metricsGrid}
              aria-label="Performance Metrics"
            >
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Clarity</span>
                <span className={styles.metricValue}>
                  {session.cumulativeScores.clarity}%
                </span>
                <span className={styles.metricSub}>Intuitive explanation</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Argument Rigour</span>
                <span className={styles.metricValue}>
                  {session.cumulativeScores.rigour}%
                </span>
                <span className={styles.metricSub}>Causality & boundaries</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Accuracy</span>
                <span className={styles.metricValue}>
                  {session.cumulativeScores.accuracy}%
                </span>
                <span className={styles.metricSub}>Factual precision</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Rounds Sparred</span>
                <span className={styles.metricValue}>
                  {session.cumulativeScores.roundsCount}
                </span>
                <span className={styles.metricSub}>Viva exchanges</span>
              </div>
            </section>
          )}

          {/* Dialogue Stream */}
          <section
            className={styles.dialogueSection}
            aria-label="Socratic Dialogue Stream"
          >
            <div className={styles.dialogueSectionHeader}>
              <h2 className={styles.dialogueSectionTitle}>
                Live Socratic Exchange
              </h2>
              <div className={styles.headerControls}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTextInput((prev) => !prev)}
                >
                  <Icon name="message-square" size={14} />
                  <span>
                    {showTextInput ? "Hide text input" : "Type response"}
                  </span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkipOrNewAngle}
                  disabled={isSubmitting}
                >
                  Next Socratic Angle
                </Button>
              </div>
            </div>

            <div
              className={styles.dialogueStream}
              role="log"
              aria-live="polite"
            >
              {session.dialogue.map((entry) => {
                const isStudent = entry.speaker === "student";
                const isAlex = entry.speaker === "alex";
                const bubbleClass = isStudent
                  ? styles.bubbleStudent
                  : isAlex
                    ? styles.bubbleAlex
                    : styles.bubbleJordan;

                return (
                  <div
                    key={entry.id}
                    className={`${styles.dialogueBubble} ${bubbleClass}`}
                  >
                    <span className={styles.bubbleAvatar}>{entry.avatar}</span>
                    <div className={styles.bubbleBody}>
                      <div className={styles.bubbleHeader}>
                        <span className={styles.bubbleSpeakerName}>
                          {entry.name}
                        </span>
                        <span className={styles.bubbleTime}>
                          {entry.timestamp}
                        </span>
                      </div>

                      <p className={styles.bubbleContent}>{entry.content}</p>

                      {/* Inline Citations */}
                      {entry.citations && entry.citations.length > 0 && (
                        <div className={styles.citationsList}>
                          {entry.citations.map(
                            (c: GroundedCitation, cIdx: number) => (
                              <span
                                key={cIdx}
                                className={styles.citationPill}
                                title={`Snippet: "${c.snippet}"`}
                              >
                                <Icon name="book-open" size={12} />
                                <span>{c.sourceTitle}</span>
                              </span>
                            ),
                          )}
                        </div>
                      )}

                      {/* Student Feedback & Oral Parsing Scorecard */}
                      {entry.feedback && (
                        <div className={styles.parsingCard}>
                          <div className={styles.parsingHeader}>
                            <span className={styles.parsingTitle}>
                              <Icon name="check-circle" size={14} />
                              <span>Viva Assessment</span>
                            </span>

                            <div className={styles.scoresRow}>
                              <span className={styles.scorePill}>
                                Clarity:{" "}
                                <strong>{entry.feedback.clarityScore}%</strong>
                              </span>
                              <span className={styles.scorePill}>
                                Rigour:{" "}
                                <strong>{entry.feedback.rigourScore}%</strong>
                              </span>
                              <span className={styles.scorePill}>
                                Accuracy:{" "}
                                <strong>{entry.feedback.accuracyScore}%</strong>
                              </span>
                            </div>
                          </div>

                          <p className={styles.critiqueText}>
                            {entry.feedback.shortCritique}
                          </p>

                          {/* Strengths and Misconceptions breakdown */}
                          <div className={styles.parsingGrid}>
                            {entry.feedback.keyConceptsMastered &&
                              entry.feedback.keyConceptsMastered.length > 0 && (
                                <div className={styles.strengthsBox}>
                                  <span className={styles.strengthsTitle}>
                                    <Icon name="check" size={12} />
                                    <span>Key Strengths</span>
                                  </span>
                                  <ul className={styles.critiqueList}>
                                    {entry.feedback.keyConceptsMastered.map(
                                      (m, idx) => (
                                        <li
                                          key={idx}
                                          className={styles.critiqueListItem}
                                        >
                                          ✓ {m}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}

                            {entry.feedback.missingPoints &&
                              entry.feedback.missingPoints.length > 0 && (
                                <div className={styles.misconceptionsBox}>
                                  <span className={styles.misconceptionsTitle}>
                                    <Icon name="alert-triangle" size={12} />
                                    <span>Gaps & Misconceptions</span>
                                  </span>
                                  <ul className={styles.critiqueList}>
                                    {entry.feedback.missingPoints.map(
                                      (mp, idx) => (
                                        <li
                                          key={idx}
                                          className={styles.critiqueListItem}
                                        >
                                          • {mp}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Live interim transcript while student is speaking */}
              {isListening && (
                <div className={styles.liveTranscriptCard} role="status">
                  <span className={styles.liveDot} />
                  <span>
                    {transcript
                      ? `${transcript} ${interimTranscript}`
                      : interimTranscript || "Listening to your voice…"}
                  </span>
                </div>
              )}

              <div ref={dialogueEndRef} />
            </div>
          </section>

          {/* Keyboard input row & hints */}
          <section
            className={styles.inputSection}
            aria-label="Answer Submission"
          >
            <div className={styles.hintsRow}>
              <span className={styles.chipsLabel}>Hints:</span>
              {(
                session.currentChallenge.suggestedHints || [
                  "Explain the core principle in simple words",
                  "Mention what happens at the boundary",
                ]
              ).map((hint, idx) => (
                <span key={idx} className={styles.hintPill}>
                  💡 {hint}
                </span>
              ))}
            </div>

            <div className={styles.textInputRow}>
              <input
                type="text"
                className={styles.answerInput}
                placeholder="Speak via mic or type your explanation here…"
                value={keyboardInput}
                onChange={(e) => setKeyboardInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendAnswer();
                  }
                }}
                disabled={isSubmitting}
                aria-label="Type response"
              />

              <Button
                variant="primary"
                onClick={() => void handleSendAnswer()}
                disabled={isSubmitting || !keyboardInput.trim()}
              >
                {isSubmitting ? "Scoring…" : "Submit"}
              </Button>
            </div>
          </section>

          {/* End Call Summary Modal */}
          {showEndCallModal && (
            <div
              className={styles.summaryModalOverlay}
              role="dialog"
              aria-modal="true"
              aria-label="Viva Performance Summary"
            >
              <div className={styles.summaryModalCard}>
                <div className={styles.summaryModalHeader}>
                  <h3 className={styles.summaryModalTitle}>
                    Viva Call Complete! 🎓
                  </h3>
                  <p className={styles.summaryModalSub}>
                    Session review for topic: <strong>{session.topic}</strong>
                  </p>
                </div>

                <div className={styles.summaryStatsGrid}>
                  <div className={styles.summaryStatCard}>
                    <span className={styles.summaryStatVal}>
                      {session.cumulativeScores.roundsCount}
                    </span>
                    <span className={styles.summaryStatLabel}>
                      Rounds Sparred
                    </span>
                  </div>
                  <div className={styles.summaryStatCard}>
                    <span className={styles.summaryStatVal}>
                      {session.cumulativeScores.clarity}%
                    </span>
                    <span className={styles.summaryStatLabel}>Clarity</span>
                  </div>
                  <div className={styles.summaryStatCard}>
                    <span className={styles.summaryStatVal}>
                      {session.cumulativeScores.rigour}%
                    </span>
                    <span className={styles.summaryStatLabel}>Rigour</span>
                  </div>
                  <div className={styles.summaryStatCard}>
                    <span className={styles.summaryStatVal}>
                      {session.cumulativeScores.accuracy}%
                    </span>
                    <span className={styles.summaryStatLabel}>Accuracy</span>
                  </div>
                </div>

                <div className={styles.summaryActionsRow}>
                  <Button
                    variant="secondary"
                    onClick={() => setShowEndCallModal(false)}
                  >
                    Review Dialogue Log
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setSession(null);
                      setShowEndCallModal(false);
                      setTopicInput("");
                    }}
                  >
                    Start New Viva
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
