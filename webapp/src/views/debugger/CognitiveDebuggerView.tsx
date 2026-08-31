import React, { useEffect, useState } from "react";
import {
  clearTraceHistory,
  deleteTrace,
  diagnoseCognitiveGap,
  generateMicroRepair,
  getSavedTraces,
  recordRepairSuccess,
  type CognitiveStackTrace,
  type MicroRepairChallenge,
} from "../../api/aiDebugger";
import { quizzesApi } from "../../api/quizzes";
import type { WeakTopic } from "../../api/types";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { KnowledgeCircuit } from "./KnowledgeCircuit";
import { MicroRepairModal } from "./MicroRepairModal";
import { CognitiveCrossLinkBar } from "../../components/ai/CognitiveCrossLinkBar";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import styles from "./CognitiveDebuggerView.module.css";

const PRESETS = [
  {
    subject: "Calculus",
    mistake: "Failed derivative of composite trigonometric function sin(x^2)",
    context: "Calculated cos(x^2) and missed multiplying by the inner derivative.",
  },
  {
    subject: "Physics",
    mistake: "Conservation of momentum in 2D inelastic collision problem",
    context: "Mixed scalar kinetic energy conservation with directional vector momentum.",
  },
  {
    subject: "Computer Science",
    mistake: "Stack overflow in recursive tree traversal algorithm",
    context: "Omitted the base case check when child node pointer is null.",
  },
  {
    subject: "Chemistry",
    mistake: "pH calculation of acetic acid buffer equilibrium solution",
    context: "Applied Henderson-Hasselbalch equation without accounting for weak acid dissociation constant Ka.",
  },
];

const SUBJECT_OPTIONS = [
  "Mathematics & Calculus",
  "Physics",
  "Computer Science",
  "Chemistry",
  "Biology",
  "Economics",
  "Philosophy & Logic",
  "Other",
];

export function CognitiveDebuggerView() {
  const [subject, setSubject] = useState(SUBJECT_OPTIONS[0]);
  const [mistakeDescription, setMistakeDescription] = useState("");
  const [context, setContext] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [activeTrace, setActiveTrace] = useState<CognitiveStackTrace | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<number | undefined>(undefined);

  // History & Weak topics
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedTraces, setSavedTraces] = useState<CognitiveStackTrace[]>([]);

  // Micro Repair Modal
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [isGeneratingRepair, setIsGeneratingRepair] = useState(false);
  const [activeRepair, setActiveRepair] = useState<MicroRepairChallenge | null>(null);
  const [isRepairingCelebration, setIsRepairingCelebration] = useState(false);

  // Load initial history, weak topics, and check for bridged cognitive context
  useEffect(() => {
    setSavedTraces(getSavedTraces());

    quizzesApi
      .fetchWeakTopics(5)
      .then((topics) => setWeakTopics(topics))
      .catch(() => {
        // Fallback silently if offline or unauthenticated
        setWeakTopics([]);
      });

    const bridged = CognitiveBridge.getPayload();
    if (bridged && bridged.sourceTool !== "debugger") {
      if (bridged.subject) {
        setSubject(bridged.subject);
      }
      const targetConcept = bridged.concept || bridged.topic;
      if (targetConcept) {
        setMistakeDescription(`Working out what I'm missing on: ${targetConcept}`);
        if (bridged.misconceptions && bridged.misconceptions.length > 0) {
          setContext(`Things I've got muddled: ${bridged.misconceptions.join("; ")}`);
        } else if (bridged.evidencePrompt) {
          setContext(bridged.evidencePrompt);
        }
      }
    }
  }, []);

  const handleApplyPreset = (preset: (typeof PRESETS)[0]) => {
    setSubject(preset.subject);
    setMistakeDescription(preset.mistake);
    setContext(preset.context);
  };

  const handleApplyWeakTopic = (topicName: string) => {
    setMistakeDescription(`I keep getting ${topicName} wrong`);
    setContext(`This has come up as a weak spot in my recent quizzes.`);
  };

  const handleDiagnose = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!mistakeDescription.trim()) return;

    setIsLoading(true);
    setSelectedLevel(undefined);
    try {
      const trace = await diagnoseCognitiveGap(subject, mistakeDescription.trim(), context.trim());
      setActiveTrace(trace);
      setSavedTraces(getSavedTraces());
    } finally {
      setIsLoading(false);
    }
  };

  const handleLaunchMicroRepair = async () => {
    if (!activeTrace) return;

    // Find Level 1 root layer (or lowest unbroken layer)
    const rootLayer =
      activeTrace.layers.find((l) => l.level === 1) || activeTrace.layers[activeTrace.layers.length - 1];

    setIsGeneratingRepair(true);
    try {
      const challenge = await generateMicroRepair(rootLayer ? rootLayer.concept : activeTrace.failedQuestionOrTopic);
      setActiveRepair(challenge);
      setRepairModalOpen(true);
    } finally {
      setIsGeneratingRepair(false);
    }
  };

  const handleRepairSuccess = async (traceId: string, repairId: string) => {
    await recordRepairSuccess(traceId, repairId);

    // Update active trace in state
    if (activeTrace && activeTrace.id === traceId) {
      const updated = {
        ...activeTrace,
        layers: activeTrace.layers.map((l) => ({
          ...l,
          status: "healthy" as const,
        })),
      };
      setActiveTrace(updated);
    }

    setSavedTraces(getSavedTraces());
    setIsRepairingCelebration(true);
    setTimeout(() => setIsRepairingCelebration(false), 2000);
  };

  const handleSelectSavedTrace = (trace: CognitiveStackTrace) => {
    setActiveTrace(trace);
    setSubject(trace.subject);
    setMistakeDescription(trace.failedQuestionOrTopic);
    setSelectedLevel(undefined);
    setHistoryOpen(false);
  };

  const handleDeleteSavedTrace = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteTrace(id);
    const updated = getSavedTraces();
    setSavedTraces(updated);
    if (activeTrace?.id === id) {
      setActiveTrace(updated[0] || null);
    }
  };

  const handleClearHistory = () => {
    clearTraceHistory();
    setSavedTraces([]);
    setHistoryOpen(false);
  };

  const handleResetForm = () => {
    setActiveTrace(null);
    setMistakeDescription("");
    setContext("");
    setSelectedLevel(undefined);
  };

  const rootLayer = activeTrace?.layers.find((l) => l.level === 1);
  const isAllRepaired = activeTrace?.layers.every((l) => l.status === "healthy");

  return (
    <div className={styles.container} data-testid="cognitive-debugger-view">
      {/* Header */}
      <div className={styles.headerSection}>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.title}>
            <Icon name="brain" size={28} />
            <span>Find My Mistake</span>
          </h1>
          <p className={styles.subtitle}>
            Work backwards from the mistake you made to the thing you never quite learned underneath it.
          </p>
        </div>

        <div className={styles.headerActions}>
          {savedTraces.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => setHistoryOpen(true)}
              data-testid="open-history-btn"
            >
              <Icon name="clock" size={16} />
              <span>Past mistakes ({savedTraces.length})</span>
            </Button>
          )}

          {activeTrace && (
            <Button variant="secondary" onClick={handleResetForm} data-testid="new-debug-btn">
              <Icon name="plus" size={16} />
              <span>Start a new one</span>
            </Button>
          )}
        </div>
      </div>

      {/* Cross-tool AI actions */}
      <CognitiveCrossLinkBar
        payload={
          activeTrace
            ? {
                subject: activeTrace.subject,
                topic: activeTrace.failedQuestionOrTopic,
                concept: rootLayer?.concept || activeTrace.failedQuestionOrTopic,
                sourceTool: "debugger",
                sourceId: activeTrace.id,
                misconceptions: activeTrace.layers
                  .filter((l) => l.status !== "healthy")
                  .map((l) => `${l.concept}: ${l.explanation}`),
                severity: isAllRepaired ? "minor" : "critical",
                suggestedAction: "teach_apprentice",
              }
            : undefined
        }
        currentTool="debugger"
      />

      <div className={styles.mainGrid}>
        {/* Left Column: Input Form & Presets */}
        <Card variant="panel" className={styles.inputCard}>
          <h2 className={styles.cardHeading}>
            <Icon name="activity" size={18} />
            <span>What went wrong?</span>
          </h2>

          <form onSubmit={handleDiagnose} className={styles.formGroup}>
            <div className={styles.formGroup}>
              <label htmlFor="subject-select" className={styles.formLabel}>
                Subject
              </label>
              <select
                id="subject-select"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={styles.selectInput}
                disabled={isLoading}
              >
                {SUBJECT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="mistake-input" className={styles.formLabel}>
                The mistake, or the bit you're stuck on
              </label>
              <textarea
                id="mistake-input"
                placeholder="Paste the question, or just say what you got wrong..."
                value={mistakeDescription}
                onChange={(e) => setMistakeDescription(e.target.value)}
                className={styles.textareaInput}
                rows={3}
                required
                disabled={isLoading}
                data-testid="mistake-input"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="context-input" className={styles.formLabel}>
                What you tried (optional)
              </label>
              <input
                id="context-input"
                type="text"
                placeholder="e.g. I put the numbers straight into the formula and got a minus..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className={styles.textInput}
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={isLoading || !mistakeDescription.trim()}
              className={styles.diagnoseBtn}
              data-testid="diagnose-submit-btn"
            >
              {isLoading ? (
                <>
                  <Icon name="refresh-cw" size={16} className="spin" />
                  <span>Working it out…</span>
                </>
              ) : (
                <>
                  <Icon name="zap" size={16} />
                  <span>Find my mistake</span>
                </>
              )}
            </Button>
          </form>

          {/* Quick Presets */}
          <div className={styles.presetSection}>
            <span className={styles.presetLabel}>Or try one of these</span>
            <div className={styles.presetPills}>
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={styles.presetPill}
                  onClick={() => handleApplyPreset(p)}
                  disabled={isLoading}
                  data-testid={`preset-btn-${idx}`}
                >
                  {p.subject}: {p.mistake.slice(0, 24)}…
                </button>
              ))}
            </div>
          </div>

          {/* Recent Quiz Weak Topics Integration */}
          {weakTopics.length > 0 && (
            <div className={styles.recentMistakesBox}>
              <span className={styles.presetLabel}>
                <Icon name="alert-triangle" size={12} /> Topics you keep dropping marks on
              </span>
              {weakTopics.map((wt, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={styles.recentMistakeItem}
                  onClick={() => handleApplyWeakTopic(wt.topic)}
                  disabled={isLoading}
                >
                  <span>{wt.topic}</span>
                  <span style={{ opacity: 0.7 }}>missed {wt.count}x</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Right column: the breakdown and the map */}
        <div className={styles.resultsColumn}>
          {isLoading && (
            <Card variant="panel" className={styles.loadingCard}>
              <div className={styles.scanningPulse}>
                <Icon name="zap" size={26} />
              </div>
              <h3 className={styles.loadingText}>Working backwards through it…</h3>
              <p className={styles.loadingSubtext}>
                Looking for the earlier step that tripped everything else up.
              </p>
            </Card>
          )}

          {!isLoading && !activeTrace && (
            <Card variant="panel" className={styles.emptyStateContainer}>
              <Icon name="activity" size={42} style={{ color: "var(--text-muted)", opacity: 0.5 }} />
              <h3>Nothing to look at yet</h3>
              <p className={styles.subtitle}>
                Paste in a question you got stuck on, pick a topic you keep missing, or try one of the examples on the left.
              </p>
            </Card>
          )}

          {!isLoading && activeTrace && (
            <>
              {/* Summary card */}
              <div
                className={`${styles.rootCauseCard} ${
                  isAllRepaired ? styles.rootCauseCardHealthy : ""
                }`}
                data-testid="root-cause-summary-card"
              >
                <div className={styles.rootCauseHead}>
                  <div
                    className={`${styles.rootCauseBadge} ${
                      isAllRepaired ? styles.rootCauseBadgeHealthy : ""
                    }`}
                  >
                    <Icon name={isAllRepaired ? "check" : "alert-triangle"} size={14} />
                    <span>{isAllRepaired ? "You've fixed it" : "Here's where it started"}</span>
                  </div>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Subject: {activeTrace.subject}
                  </span>
                </div>
                <p className={styles.rootCauseSummaryText}>
                  {activeTrace.rootCauseSummary}
                </p>
              </div>

              {/* Visual Knowledge Circuit */}
              <KnowledgeCircuit
                layers={activeTrace.layers}
                selectedLevel={selectedLevel}
                onSelectLevel={(lvl) => setSelectedLevel(lvl)}
                isRepairing={isRepairingCelebration}
              />

              {/* Action centre: fix-it call to action */}
              <div className={styles.actionBanner} data-testid="action-banner">
                <div className={styles.actionBannerText}>
                  <h3 className={styles.actionBannerTitle}>
                    {isAllRepaired
                      ? "That gap is closed"
                      : "Ready to patch the gap"}
                  </h3>
                  <p className={styles.actionBannerSub}>
                    {isAllRepaired
                      ? "Every step below now holds up. Nice work."
                      : `Try a 60-second challenge on "${rootLayer?.concept || "the basics"}" to close the gap.`}
                  </p>
                </div>

                {!isAllRepaired ? (
                  <Button
                    variant="primary"
                    onClick={handleLaunchMicroRepair}
                    disabled={isGeneratingRepair}
                    data-testid="launch-micro-repair-btn"
                  >
                    {isGeneratingRepair ? (
                      <>
                        <Icon name="refresh-cw" size={16} className="spin" />
                        <span>Setting it up…</span>
                      </>
                    ) : (
                      <>
                        <Icon name="zap" size={16} />
                        <span>Fix it in 60 seconds</span>
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="success"
                    onClick={handleLaunchMicroRepair}
                    data-testid="re-test-repair-btn"
                  >
                    <Icon name="check" size={16} />
                    <span>Go over it again</span>
                  </Button>
                )}
              </div>

              {/* Three-layer breakdown timeline */}
              <div className={styles.stackTraceContainer}>
                <div className={styles.stackTraceHead}>
                  <h3 className={styles.cardHeading}>
                    <Icon name="layers" size={18} />
                    <span>How the mistake built up</span>
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Tap a step to see what it depends on
                  </span>
                </div>

                <div className={styles.layersTimeline} data-testid="layers-timeline">
                  {activeTrace.layers.map((layer) => {
                    const isSelected = selectedLevel === layer.level;
                    const levelClass =
                      layer.level === 3
                        ? styles.level3Badge
                        : layer.level === 2
                        ? styles.level2Badge
                        : styles.level1Badge;

                    return (
                      <div
                        key={layer.level}
                        role="button"
                        tabIndex={0}
                        className={`${styles.layerCard} ${
                          isSelected ? styles.layerCardSelected : ""
                        }`}
                        onClick={() =>
                          setSelectedLevel(isSelected ? undefined : layer.level)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedLevel(isSelected ? undefined : layer.level);
                          }
                        }}
                        data-testid={`layer-card-${layer.level}`}
                        aria-label={`Step ${layer.level}: ${layer.concept}, ${layer.status}`}
                      >
                        <div className={styles.layerHeader}>
                          <span className={`${styles.layerLevelBadge} ${levelClass}`}>
                            Step {layer.level}:{" "}
                            {layer.level === 3
                              ? "What went wrong"
                              : layer.level === 2
                              ? "The step before that"
                              : "What it all rests on"}
                          </span>

                          <span
                            style={{
                              fontSize: "0.775rem",
                              fontWeight: 700,
                              color:
                                layer.status === "healthy"
                                  ? "#4ade80"
                                  : layer.status === "shaky"
                                  ? "#fbbf24"
                                  : "#f87171",
                            }}
                          >
                            {layer.status === "healthy"
                              ? "● Solid"
                              : layer.status === "shaky"
                              ? "◆ A bit shaky"
                              : "▲ Missing"}
                          </span>
                        </div>

                        <h4 className={styles.layerConcept}>{layer.concept}</h4>
                        <p className={styles.layerExplanation}>{layer.explanation}</p>

                        {layer.prerequisiteOf && (
                          <div className={styles.layerPrereq}>
                            <Icon name="link" size={14} />
                            <span>You need this before: {layer.prerequisiteOf}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 60-second fix-it modal */}
      <MicroRepairModal
        open={repairModalOpen}
        onClose={() => setRepairModalOpen(false)}
        challenge={activeRepair}
        traceId={activeTrace?.id || ""}
        onRepairSuccess={handleRepairSuccess}
      />

      {/* History Modal */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Mistakes you've looked at"
        subtitle="Go back over what you worked out last time"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {savedTraces.map((t) => (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              className={styles.historyItem}
              onClick={() => handleSelectSavedTrace(t)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelectSavedTrace(t);
                }
              }}
              data-testid={`history-item-${t.id}`}
            >
              <div>
                <strong style={{ color: "var(--text, #fff)", display: "block" }}>
                  {t.subject}: {t.failedQuestionOrTopic}
                </strong>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #9ca3af)" }}>
                  {new Date(t.timestamp).toLocaleString()} • {t.layers.length} steps
                </span>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={(e) => handleDeleteSavedTrace(t.id, e)}
                aria-label={`Delete this saved mistake: ${t.subject} — ${t.failedQuestionOrTopic}`}
              >
                <Icon name="trash" size={14} />
              </Button>
            </div>
          ))}

          {savedTraces.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <Button variant="danger" size="sm" onClick={handleClearHistory}>
                <Icon name="trash" size={14} />
                <span>Clear them all</span>
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
