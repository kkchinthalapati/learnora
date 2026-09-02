import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { useNotebooks, useNotebook } from "../../hooks/useNotebooks";
import { useToast } from "../../context/toast";
import {
  startSparringSession,
  submitStudentAnswer,
  generateNextSparringRound,
  type SparringSession,
  type SparringPersona,
  type GroundedCitation,
} from "../../api/aiSparring";
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

  const queryTopic = searchParams.get("topic") || "";
  const queryNotebookId = searchParams.get("notebookId") || "";

  const { notebooks } = useNotebooks();
  const linkedNotebook = useNotebook(queryNotebookId).notebook;

  // Session State
  const [topicInput, setTopicInput] = useState(queryTopic || "");
  const [selectedNotebookId, setSelectedNotebookId] = useState(queryNotebookId || "");
  const [session, setSession] = useState<SparringSession | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Interaction State
  const [keyboardInput, setKeyboardInput] = useState("");
  const [autoPlayAudio, setAutoPlayAudio] = useState(true);

  const dialogueEndRef = useRef<HTMLDivElement | null>(null);

  // Speech Synthesis Hook
  const {
    speak,
    cancel: cancelSpeech,
    isSpeaking,
    currentSpeaker: activeAiSpeaker,
  } = useSpeechSynthesis();

  // Handle auto-play speech on round changes
  const playAiRound = useCallback(
    (speechText: string, speaker: SparringPersona) => {
      if (!autoPlayAudio) return;
      speak(speechText, { persona: speaker });
    },
    [autoPlayAudio, speak],
  );

  // Speech Recognition Hook
  const {
    isListening,
    transcript,
    interimTranscript,
    isSupported: isSttSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    lang: "en-GB",
    silenceTimeoutMs: 3500,
    onFinalTranscript: (text) => {
      if (text.trim()) {
        setKeyboardInput(text);
      }
    },
  });

  // Scroll to bottom on new dialogue entry
  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [session?.dialogue, interimTranscript]);

  // If URL provides topic or notebook, initialize or prefill
  useEffect(() => {
    if (queryTopic && !session && !isLoadingSession) {
      void handleStartSession(queryTopic, queryNotebookId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryTopic, queryNotebookId]);

  const handleStartSession = async (topicToUse?: string, nbId?: string) => {
    const activeTopic = (topicToUse ?? topicInput).trim();
    if (!activeTopic) {
      showToast("Please enter or select a topic to start sparring.", { error: true });
      return;
    }

    cancelSpeech();
    stopListening();
    resetTranscript();
    setIsLoadingSession(true);

    try {
      const notebook = nbId
        ? notebooks.find((n) => n.id === nbId)
        : selectedNotebookId
          ? notebooks.find((n) => n.id === selectedNotebookId)
          : undefined;

      const notesContext = notebook?.notes || undefined;
      const newSession = await startSparringSession(activeTopic, notesContext, notebook?.id);

      setSession(newSession);
      playAiRound(newSession.currentChallenge.speechText, newSession.currentChallenge.speaker);
    } catch {
      showToast("Failed to start sparring session. Using offline sparring partner.");
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleToggleMic = () => {
    if (isListening) {
      stopListening();
      // If we recorded speech, ready to submit
      if (transcript.trim()) {
        void handleSendAnswer(transcript);
      }
    } else {
      if (!isSttSupported) {
        showToast("Speech recognition is not supported in this browser. You can type your answer below.");
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
    const answer = (speechOrText ?? keyboardInput).trim();
    if (!answer) return;

    if (isListening) {
      stopListening();
    }
    cancelSpeech();
    setIsSubmitting(true);
    setKeyboardInput("");
    resetTranscript();

    try {
      const notesContext =
        linkedNotebook?.notes ||
        (selectedNotebookId ? notebooks.find((n) => n.id === selectedNotebookId)?.notes : undefined);

      const result = await submitStudentAnswer(session, answer, notesContext);
      setSession(result.session);

      // Speak next round from AI
      playAiRound(result.nextRound.speechText, result.nextRound.speaker);
    } catch {
      showToast("Error evaluating answer. Check your connection.", { error: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipOrNewAngle = async () => {
    if (!session || isSubmitting) return;
    cancelSpeech();
    setIsSubmitting(true);

    try {
      const notesContext =
        linkedNotebook?.notes ||
        (selectedNotebookId ? notebooks.find((n) => n.id === selectedNotebookId)?.notes : undefined);

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
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
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

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.titleArea}>
            <span className={styles.eyebrow}>
              <Icon name="mic" size={14} />
              <span>Voice Study Partner</span>
            </span>
            <h1 className={styles.pageTitle}>Socratic Audio Sparring</h1>
            <p className={styles.pageSubtitle}>
              Spar with two AI peer personas: Alex 🌱 probes your core intuition, while Jordan ⚡ tests edge cases and counter-arguments.
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
                showToast(next ? "Voice playback enabled." : "Voice playback muted.");
              }}
              title={autoPlayAudio ? "Mute automatic speech output" : "Unmute speech output"}
            >
              <Icon name={autoPlayAudio ? "activity" : "clock"} size={16} />
              <span>{autoPlayAudio ? "Voice: On" : "Voice: Muted"}</span>
            </button>

            {session && (
              <button
                type="button"
                className={styles.audioToggleBtn}
                onClick={handleReplayCurrentPrompt}
                title="Replay the current challenge audio"
              >
                <Icon name="refresh-cw" size={16} />
                <span>Replay Question</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Topic Chooser / Notebook Selector */}
      {!session ? (
        <section className={styles.topicCard} aria-label="Topic Selection">
          <div className={styles.topicCardTitle}>Choose a sparring topic</div>

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
              {isLoadingSession ? "Preparing Arena…" : "Enter Sparring Arena"}
            </Button>
          </div>

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
        </section>
      ) : (
        <>
          {/* Sparring Stage Arena */}
          <SparringStage
            currentSpeaker={isListening ? "student" : activeAiSpeaker}
            activeAiSpeaker={activeAiSpeaker}
            isListening={isListening}
            isSpeaking={isSpeaking}
            conceptAnchor={session.currentChallenge.conceptAnchor}
            onToggleMic={handleToggleMic}
            micDisabled={isSubmitting}
          />

          {/* Cumulative Score Celebration Banner */}
          {session.cumulativeScores.roundsCount > 0 && (
            <section className={styles.metricsGrid} aria-label="Performance Metrics">
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Clarity</span>
                <span className={styles.metricValue}>{session.cumulativeScores.clarity}%</span>
                <span className={styles.metricSub}>Intuitive explanation</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Argument Rigour</span>
                <span className={styles.metricValue}>{session.cumulativeScores.rigour}%</span>
                <span className={styles.metricSub}>Causality & boundaries</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Accuracy</span>
                <span className={styles.metricValue}>{session.cumulativeScores.accuracy}%</span>
                <span className={styles.metricSub}>Factual precision</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Rounds Sparred</span>
                <span className={styles.metricValue}>{session.cumulativeScores.roundsCount}</span>
                <span className={styles.metricSub}>Alex & Jordan exchanges</span>
              </div>
            </section>
          )}

          {/* Dialogue Stream */}
          <section className={styles.dialogueSection} aria-label="Socratic Dialogue Stream">
            <div className={styles.dialogueSectionHeader}>
              <h2 className={styles.dialogueSectionTitle}>Live Socratic Exchange</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkipOrNewAngle}
                disabled={isSubmitting}
              >
                Next Socratic Angle
              </Button>
            </div>

            <div className={styles.dialogueStream} role="log" aria-live="polite">
              {session.dialogue.map((entry) => {
                const isStudent = entry.speaker === "student";
                const isAlex = entry.speaker === "alex";
                const bubbleClass = isStudent
                  ? styles.bubbleStudent
                  : isAlex
                    ? styles.bubbleAlex
                    : styles.bubbleJordan;

                return (
                  <div key={entry.id} className={`${styles.dialogueBubble} ${bubbleClass}`}>
                    <span className={styles.bubbleAvatar}>{entry.avatar}</span>
                    <div className={styles.bubbleBody}>
                      <div className={styles.bubbleHeader}>
                        <span className={styles.bubbleSpeakerName}>{entry.name}</span>
                        <span className={styles.bubbleTime}>{entry.timestamp}</span>
                      </div>

                      <p className={styles.bubbleContent}>{entry.content}</p>

                      {/* Inline Citations */}
                      {entry.citations && entry.citations.length > 0 && (
                        <div className={styles.citationsList}>
                          {entry.citations.map((c: GroundedCitation, cIdx: number) => (
                            <span
                              key={cIdx}
                              className={styles.citationPill}
                              title={`Snippet: "${c.snippet}"`}
                            >
                              <Icon name="book-open" size={12} />
                              <span>{c.sourceTitle}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Student Feedback Scorecard */}
                      {entry.feedback && (
                        <div className={styles.feedbackBox}>
                          <div className={styles.feedbackHeader}>
                            <div className={styles.feedbackScoreGroup}>
                              <span className={styles.scoreItem}>
                                Clarity: <strong className={styles.scoreVal}>{entry.feedback.clarityScore}%</strong>
                              </span>
                              <span className={styles.scoreItem}>
                                Rigour: <strong className={styles.scoreVal}>{entry.feedback.rigourScore}%</strong>
                              </span>
                            </div>
                            <span
                              className={`${styles.podBadge} ${
                                entry.feedback.overallScore >= 80 ? styles.badgeAlex : styles.badgeJordan
                              }`}
                            >
                              {entry.feedback.reactionTone}
                            </span>
                          </div>
                          <p className={styles.critiqueText}>{entry.feedback.shortCritique}</p>
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
                  <span>{transcript ? `${transcript} ${interimTranscript}` : interimTranscript || "Listening to your voice…"}</span>
                </div>
              )}

              <div ref={dialogueEndRef} />
            </div>
          </section>

          {/* Keyboard fallback input and hints */}
          <section className={styles.inputSection} aria-label="Answer Submission">
            <div className={styles.hintsRow}>
              <span className={styles.chipsLabel}>Hints:</span>
              {(session.currentChallenge.suggestedHints || [
                "Explain the core principle in simple words",
                "Mention what happens at the boundary",
              ]).map((hint, idx) => (
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
        </>
      )}
    </div>
  );
}
