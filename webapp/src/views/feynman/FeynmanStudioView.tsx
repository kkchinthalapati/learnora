import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import {
  PERSONA_PROFILES,
  type FeynmanSessionState,
  type Misconception,
  loadFeynmanSession,
  saveFeynmanSession,
  evaluateTeachingExplanation,
  generateFeynmanDebrief,
  getActiveFeynmanSessionId,
  setActiveFeynmanSessionId,
} from "../../api/aiFeynman";
import styles from "./FeynmanStudioView.module.css";

export function FeynmanStudioView() {
  const { sessionId: paramSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<FeynmanSessionState | null>(null);
  const [explanationText, setExplanationText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  const [expandedHints, setExpandedHints] = useState<Record<string, boolean>>({});
  const [voiceMode, setVoiceMode] = useState(false);
  const [isSimulatingSpeech, setIsSimulatingSpeech] = useState(false);

  const dialogueBottomRef = useRef<HTMLDivElement | null>(null);

  // Load session from storage
  useEffect(() => {
    const targetId = paramSessionId || getActiveFeynmanSessionId();
    if (!targetId) return;

    const loaded = loadFeynmanSession(targetId);
    if (loaded) {
      setSession(loaded);
      setActiveFeynmanSessionId(loaded.id);
    }
  }, [paramSessionId]);

  // Auto-scroll dialogue stream on new turns
  useEffect(() => {
    if (typeof dialogueBottomRef.current?.scrollIntoView === "function") {
      dialogueBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [session?.turns]);

  if (!session) {
    return (
      <div className={styles.container}>
        <div className={styles.card} style={{ textAlign: "center", padding: "40px" }}>
          <h2>We can’t find that session</h2>
          <p style={{ color: "var(--text-muted)", marginTop: "8px", marginBottom: "20px" }}>
            It may have been deleted, or it was from a while ago.
          </p>
          <Button variant="primary" onClick={() => navigate("/feynman")}>
            <Icon name="chevron-down" size={16} style={{ transform: "rotate(90deg)" }} /> Back
          </Button>
        </div>
      </div>
    );
  }

  const persona = PERSONA_PROFILES[session.persona];
  const lastTurn =
    session.turns.length > 0 ? session.turns[session.turns.length - 1] : null;
  const currentEmotion = lastTurn?.emotion ?? "confused";
  const currentScore = session.currentScore;

  // Track which misconceptions have been addressed across all turns
  const allSolvedConcepts = new Set<string>();
  session.turns.forEach((t) => {
    t.solvedPoints.forEach((p) => allSolvedConcepts.add(p.toLowerCase()));
  });

  const isConceptSolved = (misc: Misconception) =>
    allSolvedConcepts.has(misc.concept.toLowerCase()) || currentScore >= 88;

  const toggleHint = (id: string) => {
    setExpandedHints((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleApplyShortcut = (prefix: string) => {
    setExplanationText((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}\n\n${prefix}` : prefix;
    });
  };

  const handleVoiceToggle = () => {
    const nextState = !voiceMode;
    setVoiceMode(nextState);
    if (nextState) {
      setIsSimulatingSpeech(true);
      const timer = setTimeout(() => {
        setIsSimulatingSpeech(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setIsSimulatingSpeech(false);
    }
  };

  const handleTeachSubmit = async () => {
    if (!explanationText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const turn = await evaluateTeachingExplanation(
        session.draft,
        session.turns,
        explanationText.trim(),
        session.persona
      );

      const updatedTurns = [...session.turns, turn];
      const updatedSession: FeynmanSessionState = {
        ...session,
        turns: updatedTurns,
        currentScore: turn.understandingScore,
        updatedAt: new Date().toISOString(),
      };

      setSession(updatedSession);
      saveFeynmanSession(updatedSession);
      setExplanationText("");
    } catch (err) {
      console.error("Evaluation failed", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviseDraft = () => {
    setIsRevising(true);
    // Replace draft misconceptions with corrected snippets for solved points
    let revised = session.draft.draftText;
    session.draft.hiddenMisconceptions.forEach((m) => {
      if (isConceptSolved(m)) {
        revised = revised.replace(m.snippet, m.correctedSnippet);
      }
    });

    const updatedSession: FeynmanSessionState = {
      ...session,
      draft: {
        ...session.draft,
        draftText: revised,
      },
      updatedAt: new Date().toISOString(),
    };

    setSession(updatedSession);
    saveFeynmanSession(updatedSession);
    setTimeout(() => {
      setIsRevising(false);
    }, 600);
  };

  const handleFinishAndDebrief = async () => {
    setIsSubmitting(true);
    try {
      const debrief = await generateFeynmanDebrief(
        session.draft,
        session.turns,
        session.persona
      );

      const completedSession: FeynmanSessionState = {
        ...session,
        status: "completed",
        debriefReport: debrief,
        updatedAt: new Date().toISOString(),
      };

      setSession(completedSession);
      saveFeynmanSession(completedSession);
      navigate(`/feynman/debrief/${completedSession.id}`);
    } catch (err) {
      console.error("Failed to generate debrief", err);
      navigate(`/feynman/debrief/${session.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header and quick actions */}
      <div className={styles.arenaHeader}>
        <div className={styles.headerLeft}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate("/feynman")}
            aria-label="Back to Explain It Simply"
          >
            <Icon name="x" size={14} /> Back
          </Button>
          <div className={styles.headerTitleGroup}>
            <span className={styles.headerEyebrow}>
              {session.subject} • {session.difficulty}
            </span>
            <div className={styles.headerTitle}>
              {session.topic}
              <span className={styles.personaBadge}>
                {persona.avatar} {persona.name}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReviseDraft}
            disabled={isRevising || session.turns.length === 0}
            data-testid="revise-draft-btn"
          >
            <Icon name="refresh-cw" size={14} />{" "}
            {isRevising ? "Rewriting…" : "Ask them to try again"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleFinishAndDebrief}
            data-testid="finish-session-btn"
          >
            <Icon name="award" size={14} /> Finish and see how it went
          </Button>
        </div>
      </div>

      {/* Split Workspace */}
      <div className={styles.splitWorkspace}>
        {/* Left pane: their attempt and their questions */}
        <div className={styles.draftPane}>
          {/* Their attempt */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <span>
                <Icon name="pencil" size={18} /> What {persona.shortName} wrote
              </span>
              <span className={styles.personaBadge} style={{ fontSize: "11px" }}>
                {session.draft.hiddenMisconceptions.filter(isConceptSolved).length}/
                {session.draft.hiddenMisconceptions.length} sorted
              </span>
            </div>

            <div className={styles.apprenticeThoughtBubble} data-testid="apprentice-draft-text">
              <p>{session.draft.draftText}</p>
            </div>

            {/* What they have got muddled, with hints */}
            <div className={styles.misconceptionList}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "var(--text)",
                  marginTop: "8px",
                }}
              >
                What they’ve got muddled:
              </div>
              {session.draft.hiddenMisconceptions.map((misc) => {
                const solved = isConceptSolved(misc);
                const showHint = !!expandedHints[misc.id];
                return (
                  <div
                    key={misc.id}
                    className={`${styles.misconceptionItem} ${
                      solved ? styles.resolved : ""
                    }`}
                    data-testid={`misconception-${misc.id}`}
                  >
                    <div className={styles.misconceptionItemHeader}>
                      <span className={styles.misconceptionConceptName}>
                        {misc.concept}
                      </span>
                      <span
                        className={`${styles.flawBadge} ${
                          solved ? styles.resolved : ""
                        }`}
                      >
                        {solved ? "✅ Sorted" : "⚠️ Still muddled"}
                      </span>
                    </div>
                    <div className={styles.misconceptionSnippet}>
                      &quot;{misc.snippet}&quot;
                    </div>
                    <div className={styles.misconceptionExplanation}>
                      {misc.explanation}
                    </div>
                    <button
                      type="button"
                      className={styles.hintToggleBtn}
                      onClick={() => toggleHint(misc.id)}
                    >
                      <Icon name="help-circle" size={13} />
                      {showHint ? "Hide hint" : "Give me a hint"}
                    </button>
                    {showHint && (
                      <div className={styles.hintBox} data-testid={`hint-${misc.id}`}>
                        <strong>💡 Clue:</strong> {misc.hint}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Their question */}
          <div className={styles.challengeCard} data-testid="challenge-question-card">
            <div className={styles.challengeTitle}>
              <Icon name="help-circle" size={16} /> {persona.shortName} asks:
            </div>
            <div className={styles.challengeText}>
              &quot;{session.draft.challengeQuestion}&quot;
            </div>
          </div>

          {/* What to get across */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <span>
                <Icon name="list-checks" size={18} /> What to get across
              </span>
            </div>
            <div className={styles.objectivesList}>
              {session.draft.learningObjectives.map((obj, idx) => (
                <div key={idx} className={styles.objectiveItem}>
                  <Icon
                    name={currentScore >= 70 ? "check" : "target"}
                    size={15}
                    style={{
                      color:
                        currentScore >= 70 ? "var(--success)" : "var(--text-muted)",
                    }}
                  />
                  <span>{obj}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right pane: where you type, and how they’re doing */}
        <div className={styles.teachingPane}>
          {/* How much they’ve got */}
          <div className={styles.gaugeCard} data-testid="understanding-gauge">
            <div className={styles.gaugeHeader}>
              <div className={styles.gaugeTitle}>
                <Icon name="activity" size={18} />
                How much {persona.shortName} has got
              </div>

              {/* How they’re feeling */}
              <div
                className={`${styles.emotionBadge} ${
                  currentEmotion === "confused"
                    ? styles.emotionConfused
                    : currentEmotion === "skeptical"
                    ? styles.emotionSkeptical
                    : currentEmotion === "lightbulb"
                    ? styles.emotionLightbulb
                    : styles.emotionConvinced
                }`}
                data-testid="apprentice-emotion-badge"
              >
                {currentEmotion === "confused" && "🤔 Confused"}
                {currentEmotion === "skeptical" && "🤨 Not convinced"}
                {currentEmotion === "lightbulb" && "💡 It just clicked"}
                {currentEmotion === "convinced" && "🎓 They’ve got it"}
              </div>
            </div>

            {/* Progress bar */}
            <div className={styles.gaugeProgressTrack}>
              <div
                className={styles.gaugeProgressBar}
                style={{ width: `${Math.min(100, Math.max(8, currentScore))}%` }}
                data-testid="gauge-progress-bar"
              />
            </div>

            <div className={styles.gaugeMetaRow}>
              <span className={styles.scoreNumber}>{currentScore}% of the way there</span>
              {lastTurn && lastTurn.delta > 0 && (
                <span className={styles.deltaBadge}>
                  +{lastTurn.delta}% from your last go
                </span>
              )}
            </div>
          </div>

          {/* The conversation */}
          <div className={styles.card} style={{ flex: 1, minHeight: "260px" }}>
            <div className={styles.cardTitle}>
              <span>
                <Icon name="users" size={18} /> Your conversation ({session.turns.length})
              </span>
            </div>

            <div className={styles.dialogueStream} data-testid="dialogue-stream">
              {session.turns.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px 0" }}>
                  <p>Nothing said yet.</p>
                  <p style={{ fontSize: "12px", marginTop: "4px" }}>
                    Read what {persona.shortName} wrote on the left, then explain it to them below in your own words.
                  </p>
                </div>
              ) : (
                session.turns.map((turn, idx) => (
                  <div key={turn.id || idx} className={styles.dialogueTurn}>
                    {/* What you said */}
                    <div className={styles.userMessageBubble} data-testid="user-turn-bubble">
                      <strong>You:</strong>
                      <p style={{ marginTop: "4px" }}>{turn.userExplanation}</p>
                    </div>

                    {/* What they said back */}
                    <div className={styles.apprenticeReplyBubble} data-testid="apprentice-turn-bubble">
                      <strong>{persona.name}:</strong>
                      <p>{turn.apprenticeReaction}</p>
                      {turn.solvedPoints.length > 0 && (
                        <div className={styles.turnFeedbackPills}>
                          {turn.solvedPoints.map((s, sIdx) => (
                            <span key={sIdx} className={styles.solvedPill}>
                              ✓ Got it: {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={dialogueBottomRef} />
            </div>
          </div>

          {/* Where you type */}
          <div className={styles.consoleCard}>
            {/* Starter phrases */}
            <div className={styles.shortcutsRow}>
              <button
                type="button"
                className={styles.shortcutBtn}
                onClick={() =>
                  handleApplyShortcut(
                    "Think of it like this analogy: imagine..."
                  )
                }
              >
                💡 Use a comparison
              </button>
              <button
                type="button"
                className={styles.shortcutBtn}
                onClick={() =>
                  handleApplyShortcut(
                    "The bit you've got wrong is..."
                  )
                }
              >
                ⚠️ Point out the mistake
              </button>
              <button
                type="button"
                className={styles.shortcutBtn}
                onClick={() =>
                  handleApplyShortcut(
                    "Let's break this down step-by-step:\n1) First...\n2) Then..."
                  )
                }
              >
                🪜 Go step by step
              </button>
              <button
                type="button"
                className={styles.shortcutBtn}
                onClick={() =>
                  handleApplyShortcut(
                    "Consider this counter-example: what if..."
                  )
                }
              >
                🔬 Give an example that breaks it
              </button>
            </div>

            {/* Input Textarea */}
            <div className={styles.inputWrapper}>
              <textarea
                className={styles.teachingTextarea}
                placeholder={`Explain ${session.topic} to ${persona.shortName} in your own words. Put them right, and answer what they asked...`}
                value={explanationText}
                onChange={(e) => setExplanationText(e.target.value)}
                rows={3}
                data-testid="teaching-textarea"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleTeachSubmit();
                  }
                }}
              />
            </div>

            {/* Footer */}
            <div className={styles.consoleFooter}>
              <label className={styles.voiceToggle}>
                <input
                  type="checkbox"
                  checked={voiceMode}
                  onChange={handleVoiceToggle}
                  aria-label="Practise saying it out loud"
                />
                <Icon name="mic" size={14} /> Say it out loud
                {isSimulatingSpeech && (
                  <span className={styles.voiceActiveIndicator}>● Listening</span>
                )}
              </label>

              <Button
                variant="primary"
                onClick={handleTeachSubmit}
                disabled={isSubmitting || !explanationText.trim()}
                data-testid="submit-explanation-btn"
              >
                {isSubmitting ? (
                  <>
                    <Icon name="refresh-cw" size={14} /> Reading it…
                  </>
                ) : (
                  <>
                    <Icon name="send" size={14} /> Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
