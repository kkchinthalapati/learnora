import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import {
  clearTraceHistory,
  deleteTrace,
  diagnoseCognitiveGap,
  generateMicroRepair,
  getSavedTraceById,
  getSavedTraces,
  recordRepairSuccess,
  type CognitiveStackTrace,
  type DegradedDiagnosis,
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
import { useRecordMisconceptions } from "../../hooks/useMisconceptions";
import { candidatesFromStackTrace } from "../../lib/misconceptions";
import { displaySubjectName } from "../../lib/subjectName";
import { useAuth } from "../../context/auth";
import { useFolders } from "../../hooks/useFolders";
import styles from "./CognitiveDebuggerView.module.css";

/* School-level mistakes students actually make. The previous set (chain
   rule on sin(x²), buffer pH, recursion base cases) was university work, on
   an app built for high school and board exams. */
const PRESETS = [
  {
    subject: "Maths",
    label: "Expanding (x + 3)²",
    mistake: "Expanded (x + 3)² as x² + 9",
    context: "I squared each term separately.",
  },
  {
    subject: "Physics",
    label: "Speed vs velocity",
    mistake: "Said a car going round a bend at a steady speed isn't accelerating",
    context: "I thought acceleration only means speeding up.",
  },
  {
    subject: "Chemistry",
    label: "Balancing equations",
    mistake: "Balanced H₂ + O₂ → H₂O by changing it to H₂O₂",
    context: "I changed the formula instead of the numbers in front.",
  },
  {
    subject: "Biology",
    label: "Which way osmosis goes",
    mistake: "Said water moves from a concentrated solution into a dilute one",
    context: "I mixed up which side has more water.",
  },
];

const SUBJECT_OPTIONS = [
  "Maths",
  "Biology",
  "Chemistry",
  "Physics",
  "Computer Science",
  "Geography",
  "History",
  "Economics",
  "English",
  "Other",
];

interface SolverWork {
  subject: string;
  mistakeDescription: string;
  context: string;
  traceId: string | null;
}

function readSolverWork(key: string): SolverWork | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    if (
      value &&
      typeof value.subject === "string" &&
      typeof value.mistakeDescription === "string" &&
      typeof value.context === "string" &&
      (typeof value.traceId === "string" || value.traceId === null)
    ) {
      return value as SolverWork;
    }
  } catch {
    // Ignore unavailable or malformed session storage.
  }
  return null;
}

export function CognitiveDebuggerView() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const workKey = `learnora:solver_work:${user?.id ?? "guest"}`;
  const [restoredWork] = useState(() => readSolverWork(workKey));
  /* The student's own subjects first, and the default is one of them: a
     Biology student opening this used to find "Mathematics & Calculus"
     preselected. The list also always contains whatever is selected, so a
     subject that arrives from a hand-off or a saved trace is shown rather
     than silently rendered as the first option. */
  const { data: folders = [] } = useFolders();
  const [subject, setSubject] = useState(restoredWork?.subject ?? "");
  const folderNames = folders.map((f) => f.name).filter(Boolean);
  const requestedSubject = subject || folderNames[0] || SUBJECT_OPTIONS[0];
  /* Case-insensitive: a folder called "maths" and the built-in "Maths" were
     both listed. The folder's spelling wins, since it's the student's. */
  const subjectOptions = [...folderNames, ...SUBJECT_OPTIONS, requestedSubject].filter(
    (s, i, all) => all.findIndex((t) => t.toLowerCase() === s.toLowerCase()) === i,
  );
  /* Resolve to the option that survived the dedupe. The "Maths" preset with a
     "maths" folder otherwise left the <select> with no exact match, so it
     displayed its first option (another subject entirely) while the diagnosis
     ran on Maths — the form and the result named different subjects. */
  const effectiveSubject =
    subjectOptions.find((s) => s.toLowerCase() === requestedSubject.toLowerCase()) ??
    requestedSubject;
  const [mistakeDescription, setMistakeDescription] = useState(restoredWork?.mistakeDescription ?? "");
  const [context, setContext] = useState(restoredWork?.context ?? "");

  const [isLoading, setIsLoading] = useState(false);
  const [activeTrace, setActiveTrace] = useState<CognitiveStackTrace | null>(() =>
    restoredWork?.traceId ? getSavedTraceById(restoredWork.traceId) : null,
  );
  const [selectedLevel, setSelectedLevel] = useState<number | undefined>(undefined);

  // History & Weak topics
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedTraces, setSavedTraces] = useState<CognitiveStackTrace[]>([]);

  // Micro Repair Modal
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [isGeneratingRepair, setIsGeneratingRepair] = useState(false);
  const [activeRepair, setActiveRepair] = useState<MicroRepairChallenge | null>(null);
  /* Why the last "Fix it" came back without an exercise, and for which trace,
     so opening another trace can't leave the notice under the wrong one. */
  const [repairProblem, setRepairProblem] = useState<
    (DegradedDiagnosis & { traceId: string }) | null
  >(null);
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

    /* Arriving from a quiz result: "Work on Photosynthesis" carries the
       weak topic here rather than dropping the student on an empty form
       and asking them to retype what the app already knew. Checked before
       the bridge so an explicit link wins over a stale hand-off. */
    const linkedTopic = searchParams.get("topic")?.trim();
    if (linkedTopic) {
      setActiveTrace(null);
      setMistakeDescription(`I keep getting ${linkedTopic} questions wrong`);
      setContext("");
      return;
    }

    const bridged = CognitiveBridge.getPayload();
    if (bridged && bridged.sourceTool !== "debugger") {
      setActiveTrace(null);
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

  useEffect(() => {
    try {
      sessionStorage.setItem(workKey, JSON.stringify({
        subject, mistakeDescription, context, traceId: activeTrace?.id ?? null,
      } satisfies SolverWork));
    } catch {
      // Storage can be unavailable; saved diagnoses remain in Past mistakes.
    }
  }, [workKey, subject, mistakeDescription, context, activeTrace]);

  const handleApplyPreset = (preset: (typeof PRESETS)[0]) => {
    setSubject(preset.subject);
    setMistakeDescription(preset.mistake);
    setContext(preset.context);
  };

  const handleApplyWeakTopic = (topicName: string) => {
    setMistakeDescription(`I keep getting ${topicName} wrong`);
    setContext(`This has come up as a weak spot in my recent quizzes.`);
    /* Then swap in the real question, their answer and the quiz's subject
       once they arrive. */
    quizzesApi
      .fetchLatestWrongAnswer(topicName)
      .then((example) => {
        if (!example) return;
        setMistakeDescription(
          `${example.question}
I answered "${example.chosen}" but the answer was "${example.correct}".`,
        );
        setContext(`From a recent quiz on ${topicName}.`);
        const folder = folders.find((f) => f.id === example.folderId);
        if (folder?.name) setSubject(folder.name);
      })
      .catch(() => {
        /* Keep the topic-only description already filled in. */
      });
  };

  const recordMisconceptions = useRecordMisconceptions();

  const handleDiagnose = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!mistakeDescription.trim()) return;

    setIsLoading(true);
    setSelectedLevel(undefined);
    try {
      const trace = await diagnoseCognitiveGap(effectiveSubject, mistakeDescription.trim(), context.trim());
      setActiveTrace(trace);
      setSavedTraces(getSavedTraces());
      /* The trace already names the broken prerequisite; without this it died
         with the component. Recorded so the next quiz, plan and chat know
         about it — and so a second trace onto the same concept reads as a
         recurrence rather than a fresh discovery.

         A stand-in trace returns no candidates (see candidatesFromStackTrace),
         so a tutor outage cannot write invented rows into that record. */
      recordMisconceptions(candidatesFromStackTrace(trace));
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
      const result = await generateMicroRepair(rootLayer ? rootLayer.concept : activeTrace.failedQuestionOrTopic);
      /* No exercise, no quick check: the gap stays open and the notice below
         says why. Only an exercise the tutor wrote can show it has closed. */
      if (result.degraded) {
        setRepairProblem({ ...result.degraded, traceId: activeTrace.id });
        return;
      }
      setRepairProblem(null);
      setActiveRepair(result.challenge);
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

    /* The other half of the ledger. A repair the student actually passed is
       the app's best evidence that a diagnosed gap has closed, and without it
       every Debugger row would stay open forever and keep crowding out newer
       ones in the ranking. Only the concept the repair targeted is credited —
       the trace's other layers were not retested. */
    if (activeRepair) {
      recordMisconceptions([
        {
          subject: activeTrace?.subject ?? "",
          concept: activeRepair.rootConcept,
          summary: "",
          severity: "minor",
          tool: "debugger",
          sourceId: traceId,
          kind: "correction",
          detail: "The student passed the micro-repair exercise for this concept.",
        },
      ]);
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
    setActiveTrace(null);
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
  const shownRepairProblem =
    repairProblem && repairProblem.traceId === activeTrace?.id ? repairProblem : null;

  return (
    <div className={styles.container} data-testid="cognitive-debugger-view">
      {/* Header */}
      <div className={styles.headerSection}>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.title}>
            <Icon name="brain" size={28} />
            <span>Step-by-step solver</span>
          </h1>
          <p className={styles.subtitle}>
            Work backwards from the mistake you made to find where you got stuck and repair the gap.
          </p>
          <p className={styles.saveHint}>
            Your draft stays here if you leave this page. Diagnoses are saved in Past mistakes.
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

          {/* Presets sit above the field they fill: below the submit button they read as an afterthought. */}
          <div className={styles.presetSection}>
            <span className={styles.presetLabel}>Start from one of these</span>
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
                  {p.subject}: {p.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleDiagnose} className={styles.formGroup}>
            <div className={styles.formGroup}>
              <label htmlFor="subject-select" className={styles.formLabel}>
                Subject
              </label>
              <select
                id="subject-select"
                value={effectiveSubject}
                onChange={(e) => setSubject(e.target.value)}
                className={styles.selectInput}
                disabled={isLoading}
              >
                {subjectOptions.map((s) => (
                  <option key={s} value={s}>
                    {displaySubjectName(s)}
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

          {/* Recent Quiz Weak Topics Integration */}
          {weakTopics.length > 0 && (
            <div className={styles.recentMistakesBox}>
              <span className={styles.presetLabel}>
                <Icon name="target" size={12} /> From your recent quizzes — tap one to work through it
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
                  <span className={styles.recentMistakeCount}>
                    {wt.count === 1 ? "1 wrong answer" : `${wt.count} wrong answers`}
                  </span>
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
              {/* The tutor could not be reached, or said nothing usable. What
                  follows is a generic checklist built from the words the
                  student typed — saying so is the difference between a
                  fallback and a fabrication, and it is why the ledger
                  refuses this trace (candidatesFromStackTrace). */}
              {activeTrace.degraded && (
                <div className={styles.degradedNotice} role="alert">
                  <Icon name="alert-triangle" size={16} />
                  <div>
                    <strong>This isn&rsquo;t a real diagnosis.</strong>
                    <p>
                      {activeTrace.degraded.message} Nothing has been worked
                      out about your answer, and nothing here has been added
                      to what Learnora remembers about you.
                    </p>
                    <button
                      type="button"
                      className={styles.degradedRetry}
                      onClick={() => void handleDiagnose()}
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}

              {/* A stand-in shows a plain checklist and nothing else. It used to
                  render the full three-step chain with "Missing" and "Shaky"
                  badges and maths wording ("The formula went in…") for any
                  subject — a diagnosis in all but name, under a notice
                  saying it wasn't one. */}
              {activeTrace.degraded ? (
                <div className={styles.rootCauseCard} data-testid="degraded-checklist">
                  <p className={styles.rootCauseSummaryText}>
                    While the tutor is away, these three checks find most
                    slips:
                  </p>
                  <ol className={styles.degradedChecklist}>
                    <li>Read the question again. What is it actually asking for?</li>
                    <li>Find the key word in your notes and read that section.</li>
                    <li>Put your answer next to the right one. What is the one idea that separates them?</li>
                  </ol>
                </div>
              ) : (
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
                    Subject: {displaySubjectName(activeTrace.subject)}
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

              {shownRepairProblem && (
                <div
                  className={styles.degradedNotice}
                  role="alert"
                  data-testid="repair-unavailable"
                >
                  <Icon name="alert-triangle" size={16} />
                  <div>
                    <strong>We couldn&rsquo;t set up the exercise.</strong>
                    <p>
                      {shownRepairProblem.message} This diagnosis is saved in
                      Past mistakes, so you can come back to it.
                    </p>
                    <button
                      type="button"
                      className={styles.degradedRetry}
                      onClick={() => void handleLaunchMicroRepair()}
                      disabled={isGeneratingRepair}
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}

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
                  {displaySubjectName(t.subject)}: {t.failedQuestionOrTopic}
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
