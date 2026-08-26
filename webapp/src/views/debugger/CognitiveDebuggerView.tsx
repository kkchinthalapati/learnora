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

  // Load initial history and weak topics
  useEffect(() => {
    setSavedTraces(getSavedTraces());

    quizzesApi
      .fetchWeakTopics(5)
      .then((topics) => setWeakTopics(topics))
      .catch(() => {
        // Fallback silently if offline or unauthenticated
        setWeakTopics([]);
      });
  }, []);

  const handleApplyPreset = (preset: (typeof PRESETS)[0]) => {
    setSubject(preset.subject);
    setMistakeDescription(preset.mistake);
    setContext(preset.context);
  };

  const handleApplyWeakTopic = (topicName: string) => {
    setMistakeDescription(`Struggling with concept: ${topicName}`);
    setContext(`Identified as a weak topic during recent quiz attempts.`);
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
            <span>Cognitive Root-Cause Debugger</span>
          </h1>
          <p className={styles.subtitle}>
            Dissect mistakes from surface symptoms down through intermediate bridges to the root foundational prerequisite gap.
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
              <span>Trace History ({savedTraces.length})</span>
            </Button>
          )}

          {activeTrace && (
            <Button variant="secondary" onClick={handleResetForm} data-testid="new-debug-btn">
              <Icon name="plus" size={16} />
              <span>Debug New Problem</span>
            </Button>
          )}
        </div>
      </div>

      <div className={styles.mainGrid}>
        {/* Left Column: Input Form & Presets */}
        <Card variant="panel" className={styles.inputCard}>
          <h2 className={styles.cardHeading}>
            <Icon name="activity" size={18} />
            <span>Symptom Diagnostic Input</span>
          </h2>

          <form onSubmit={handleDiagnose} className={styles.formGroup}>
            <div className={styles.formGroup}>
              <label htmlFor="subject-select" className={styles.formLabel}>
                Subject Domain
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
                Mistake / Confusing Problem
              </label>
              <textarea
                id="mistake-input"
                placeholder="Paste the problem statement or describe what went wrong..."
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
                Your Attempt / Context (Optional)
              </label>
              <input
                id="context-input"
                type="text"
                placeholder="e.g., I tried applying the formula directly but got negative..."
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
                  <span>Tracing Cognitive Stack...</span>
                </>
              ) : (
                <>
                  <Icon name="zap" size={16} />
                  <span>Execute Cognitive Stack Trace</span>
                </>
              )}
            </Button>
          </form>

          {/* Quick Presets */}
          <div className={styles.presetSection}>
            <span className={styles.presetLabel}>Quick Presets for Exploration</span>
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
                <Icon name="alert-triangle" size={12} /> Detected Quiz Weak Topics
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
                  <span style={{ opacity: 0.7 }}>{wt.count}x missed</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Right Column: Mental Stack Trace & Knowledge Circuit */}
        <div className={styles.resultsColumn}>
          {isLoading && (
            <Card variant="panel" className={styles.loadingCard}>
              <div className={styles.scanningPulse}>
                <Icon name="zap" size={26} />
              </div>
              <h3 className={styles.loadingText}>Decompiling Mental Execution Stack...</h3>
              <p className={styles.loadingSubtext}>
                Isolating foundational prerequisites and diagnosing failure propagation points.
              </p>
            </Card>
          )}

          {!isLoading && !activeTrace && (
            <Card variant="panel" className={styles.emptyStateContainer}>
              <Icon name="activity" size={42} style={{ color: "var(--text-muted)", opacity: 0.5 }} />
              <h3>No Active Diagnostic Trace</h3>
              <p className={styles.subtitle}>
                Paste a difficult problem, pick a recent quiz weak topic, or select a preset on the left to inspect the root-cause cognitive stack trace.
              </p>
            </Card>
          )}

          {!isLoading && activeTrace && (
            <>
              {/* Root Cause Summary Card */}
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
                    <span>{isAllRepaired ? "Root Prerequisite Repaired" : "Root Cause Identified"}</span>
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

              {/* Action Center: Micro-Repair CTA */}
              <div className={styles.actionBanner} data-testid="action-banner">
                <div className={styles.actionBannerText}>
                  <h3 className={styles.actionBannerTitle}>
                    {isAllRepaired
                      ? "Cognitive Bedrock Reconstructed"
                      : "First-Principles Mental Repair Available"}
                  </h3>
                  <p className={styles.actionBannerSub}>
                    {isAllRepaired
                      ? "All prerequisite links verified. Signal propagates continuously."
                      : `Run a 60-second interactive challenge on "${rootLayer?.concept || "Root Prerequisite"}" to fix the broken circuit.`}
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
                        <span>Generating Sandbox...</span>
                      </>
                    ) : (
                      <>
                        <Icon name="zap" size={16} />
                        <span>Launch 60s Micro-Repair</span>
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
                    <span>Review First Principles</span>
                  </Button>
                )}
              </div>

              {/* 3-Layer Mental Stack Trace Timeline */}
              <div className={styles.stackTraceContainer}>
                <div className={styles.stackTraceHead}>
                  <h3 className={styles.cardHeading}>
                    <Icon name="layers" size={18} />
                    <span>Mental Stack Trace (3-Layer Decompilation)</span>
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Click a layer to inspect prerequisite link
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
                        aria-label={`Layer ${layer.level}: ${layer.concept}, status: ${layer.status}`}
                      >
                        <div className={styles.layerHeader}>
                          <span className={`${styles.layerLevelBadge} ${levelClass}`}>
                            Level {layer.level}:{" "}
                            {layer.level === 3
                              ? "Surface Problem"
                              : layer.level === 2
                              ? "Intermediate Bridge"
                              : "Root Foundation"}
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
                              ? "● Healthy / Repaired"
                              : layer.status === "shaky"
                              ? "◆ Shaky Bridge"
                              : "▲ Severed Prerequisite"}
                          </span>
                        </div>

                        <h4 className={styles.layerConcept}>{layer.concept}</h4>
                        <p className={styles.layerExplanation}>{layer.explanation}</p>

                        {layer.prerequisiteOf && (
                          <div className={styles.layerPrereq}>
                            <Icon name="link" size={14} />
                            <span>Prerequisite for: {layer.prerequisiteOf}</span>
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

      {/* 60s Micro-Repair Sandbox Modal */}
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
        title="Saved Cognitive Stack Traces"
        subtitle="Review past root-cause diagnoses and repaired prerequisite circuits"
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
                  {new Date(t.timestamp).toLocaleString()} • {t.layers.length} layers
                </span>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={(e) => handleDeleteSavedTrace(t.id, e)}
                aria-label={`Delete trace ${t.id}`}
              >
                <Icon name="trash" size={14} />
              </Button>
            </div>
          ))}

          {savedTraces.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <Button variant="danger" size="sm" onClick={handleClearHistory}>
                <Icon name="trash" size={14} />
                <span>Clear All History</span>
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
