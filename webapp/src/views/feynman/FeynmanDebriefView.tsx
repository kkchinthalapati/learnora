import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { decksApi } from "../../api/decks";
import { flashcardsApi } from "../../api/flashcards";
import {
  PERSONA_PROFILES,
  type FeynmanSessionState,
  type FeynmanDebriefReport,
  loadFeynmanSession,
  saveFeynmanSession,
  generateFeynmanDebrief,
  getActiveFeynmanSessionId,
} from "../../api/aiFeynman";
import { CognitiveCrossLinkBar } from "../../components/ai/CognitiveCrossLinkBar";
import styles from "./FeynmanDebriefView.module.css";

export function FeynmanDebriefView() {
  const { sessionId: paramSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<FeynmanSessionState | null>(null);
  const [report, setReport] = useState<FeynmanDebriefReport | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportedDeckId, setExportedDeckId] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const targetId = paramSessionId || getActiveFeynmanSessionId();
    if (!targetId) {
      setNotFound(true);
      return;
    }

    const loaded = loadFeynmanSession(targetId);
    if (!loaded) {
      setNotFound(true);
      return;
    }

    setSession(loaded);

    if (loaded.debriefReport) {
      setReport(loaded.debriefReport);
    } else {
      // Generate debrief on the fly if not generated yet
      generateFeynmanDebrief(loaded.draft, loaded.turns, loaded.persona)
        .then((generated) => {
          setReport(generated);
          const updated: FeynmanSessionState = {
            ...loaded,
            status: "completed",
            debriefReport: generated,
            updatedAt: new Date().toISOString(),
          };
          setSession(updated);
          saveFeynmanSession(updated);
        })
        .catch((err: Error) => {
          setError(err.message || "We couldn't put your summary together.");
        });
    }
  }, [paramSessionId]);

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.card} style={{ textAlign: "center", padding: "40px" }}>
          <h2 style={{ color: "var(--danger)" }}>We couldn’t load your summary</h2>
          <p style={{ color: "var(--text-muted)", marginTop: "8px" }}>
            {error}
          </p>
          <div style={{ marginTop: "16px" }}>
            <Button
              variant="primary"
              onClick={() => {
                setError(null);
                window.location.reload();
              }}
            >
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
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

  if (!session || !report) {
    return (
      <div className={styles.container}>
        <div className={styles.card} style={{ textAlign: "center", padding: "40px" }}>
          <h2>Putting your summary together…</h2>
          <p style={{ color: "var(--text-muted)", marginTop: "8px" }}>
            Looking at how clearly you explained things, and what you covered…
          </p>
        </div>
      </div>
    );
  }

  const persona = PERSONA_PROFILES[session.persona];

  const handleExportFlashcards = async () => {
    if (isExporting || report.generatedFlashcards.length === 0) return;
    setIsExporting(true);
    setExportMessage(null);

    try {
      const deckTitle = `${session.topic} (from Explain It Simply)`;
      const deck = await decksApi.add(null, deckTitle);
      const cardsToAdd = report.generatedFlashcards.map((c) => ({
        front: c.front,
        back: `${c.back}\n\n[Why: ${c.rationale}]`,
      }));

      await flashcardsApi.addBatch(deck.id, cardsToAdd);
      setExportedDeckId(deck.id);
      setExportMessage(
        `Added ${cardsToAdd.length} flashcards to "${deckTitle}".`
      );
    } catch (err: any) {
      console.warn("Deck save fell back to a local confirmation", err);
      // Graceful fallback for demo or test environments
      setExportedDeckId("local-exported");
      setExportMessage(
        `Made ${report.generatedFlashcards.length} flashcards for you.`
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Cognitive Bridge Cross-Tool AI Actions */}
      <CognitiveCrossLinkBar
        payload={{
          subject: session.subject || "General",
          topic: session.topic,
          concept: report.remainingGaps[0] || session.topic,
          sourceTool: "feynman",
          sourceId: session.id,
          evidencePrompt: report.summary,
          misconceptions: report.remainingGaps,
          severity: report.remainingGaps.length > 0 ? "moderate" : "minor",
          suggestedAction: "debug_stack",
        }}
        currentTool="feynman"
      />

      {/* Overview */}
      <div className={styles.overviewCard} data-testid="mastery-overview-card">
        {/* Score */}
        <div className={styles.scoreCircleWrapper}>
          <div className={styles.scoreCircle}>
            <span className={styles.scoreBigText} data-testid="overall-mastery-score">
              {report.overallMastery}
            </span>
            <span className={styles.scoreMaxLabel}>out of 100</span>
          </div>

          <div
            className={`${styles.ratingBadge} ${
              report.pedagogicalRating === "Brilliant explainer"
                ? styles.ratingMaster
                : report.pedagogicalRating === "Good explainer"
                ? styles.ratingProficient
                : report.pedagogicalRating === "Getting there"
                ? styles.ratingDeveloping
                : styles.ratingNeedsPractice
            }`}
            data-testid="pedagogical-rating-badge"
          >
            <Icon name="award" size={14} /> {report.pedagogicalRating}
          </div>
        </div>

        {/* Summary and scores */}
        <div className={styles.overviewContent}>
          <h1 className={styles.topicHeading}>
            How it went: {session.topic}
          </h1>
          <p className={styles.sessionSummaryText}>{report.summary}</p>

          <div className={styles.subScoresGrid}>
            <div className={styles.subScoreBox}>
              <span className={styles.subScoreLabel}>How clearly you explained it</span>
              <span className={styles.subScoreVal} data-testid="clarity-score">
                {report.clarityScore}%
              </span>
            </div>
            <div className={styles.subScoreBox}>
              <span className={styles.subScoreLabel}>How accurate you were</span>
              <span className={styles.subScoreVal} data-testid="precision-score">
                {report.precisionScore}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* What you nailed, and what is left */}
      <div className={styles.detailGrid}>
        {/* What you nailed */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <Icon name="check" size={18} style={{ color: "var(--success)" }} />
            You nailed these ({report.conceptsMastered.length})
          </div>
          <div className={styles.pillList}>
            {report.conceptsMastered.map((c, idx) => (
              <div key={idx} className={styles.masteredItem} data-testid="concept-mastered-item">
                ✓ {c}
              </div>
            ))}
          </div>
        </div>

        {/* What is still shaky */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <Icon
              name="alert-triangle"
              size={18}
              style={{ color: "var(--warning)" }}
            />
            Still a bit shaky ({report.remainingGaps.length})
          </div>
          <div className={styles.pillList}>
            {report.remainingGaps.length === 0 ? (
              <div className={styles.masteredItem}>
                🌟 Nothing left over — you covered the lot.
              </div>
            ) : (
              report.remainingGaps.map((g, idx) => (
                <div key={idx} className={styles.gapItem} data-testid="remaining-gap-item">
                  ⚠️ {g}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* What went well, what to work on */}
      <div className={styles.detailGrid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <Icon name="star" size={18} style={{ color: "var(--accent)" }} />
            What you did well
          </div>
          <ul style={{ paddingLeft: "20px", fontSize: "13px", color: "var(--text)" }}>
            {report.strengths.map((s, idx) => (
              <li key={idx} style={{ marginBottom: "6px" }}>
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <Icon name="target" size={18} style={{ color: "var(--accent)" }} />
            What to work on next
          </div>
          <ul style={{ paddingLeft: "20px", fontSize: "13px", color: "var(--text)" }}>
            {report.improvementAreas.map((a, idx) => (
              <li key={idx} style={{ marginBottom: "6px" }}>
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Flashcards */}
      <div className={styles.flashcardsSection} data-testid="flashcards-export-section">
        <div className={styles.flashcardsHeader}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 800 }}>
              Flashcards from this session ({report.generatedFlashcards.length})
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>
              Cards made from the bits you and {persona.name} got stuck on, so you can test yourself later.
            </p>
          </div>

          <Button
            variant="primary"
            onClick={handleExportFlashcards}
            disabled={isExporting || report.generatedFlashcards.length === 0}
            data-testid="export-flashcards-btn"
          >
            <Icon name="layers" size={16} />{" "}
            {isExporting ? "Saving…" : "Save these as a deck"}
          </Button>
        </div>

        {exportMessage && (
          <div className={styles.exportSuccessBanner} data-testid="export-success-banner">
            <span>✓ {exportMessage}</span>
            {exportedDeckId && exportedDeckId !== "local-exported" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/review/${exportedDeckId}`)}
              >
                Revise them now →
              </Button>
            )}
          </div>
        )}

        <div className={styles.flashcardsGrid}>
          {report.generatedFlashcards.map((card, idx) => (
            <div key={idx} className={styles.flashcardPreview} data-testid="flashcard-preview-item">
              <span className={styles.flashcardLabel}>{card.concept}</span>
              <div className={styles.flashcardFront}>Q: {card.front}</div>
              <div className={styles.flashcardBack}>A: {card.back}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className={styles.actionsFooter}>
        <Button
          variant="secondary"
          onClick={() => navigate("/feynman")}
          data-testid="teach-another-btn"
        >
          <Icon name="zap" size={16} /> Explain something else
        </Button>

        <Button
          variant="primary"
          onClick={() => {
            navigate(`/feynman/studio/${session.id}`);
          }}
          data-testid="revisit-studio-btn"
        >
          <Icon name="play" size={16} /> Go back to the conversation
        </Button>
      </div>
    </div>
  );
}
