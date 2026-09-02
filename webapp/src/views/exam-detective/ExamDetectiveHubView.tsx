import { useState, useEffect } from "react";
import {
  CANONICAL_TRAP_ARCHETYPES,
  deconstructExamPaper,
  generateChallengeSprint,
  getStoredDisarmedTraps,
  getStoredRadarHistory,
  saveRadarRecord,
  type TrapArchetype,
  type SprintQuestion,
  type ImmunityRadarRecord,
} from "../../api/aiExamDeconstructor";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { useToast } from "../../context/toast";
import { useSettings } from "../../context/settings";
import { AhaWalkthroughModal } from "./AhaWalkthroughModal";
import { ChallengeSprintRunner } from "./ChallengeSprintRunner";
import { TrapImmunityRadarView } from "./TrapImmunityRadarView";
import styles from "./examDetective.module.css";

type ActiveTab = "playbook" | "deconstruct" | "sprint" | "radar";

export function ExamDetectiveHubView() {
  const { showToast } = useToast();
  const { settings } = useSettings();

  const [activeTab, setActiveTab] = useState<ActiveTab>("playbook");
  const [subject, setSubject] = useState("Calculus & STEM");
  const [rawTextPayload, setRawTextPayload] = useState("");
  const [isDeconstructing, setIsDeconstructing] = useState(false);
  const [archetypes, setArchetypes] = useState<TrapArchetype[]>(
    CANONICAL_TRAP_ARCHETYPES
  );

  // Active Walkthrough Modal
  const [activeTrapId, setActiveTrapId] = useState<string | null>(null);

  // Active Sprint
  const [sprintCount, setSprintCount] = useState<number>(4);
  const [isSprintRunning, setIsSprintRunning] = useState(false);
  const [sprintQuestions, setSprintQuestions] = useState<SprintQuestion[]>([]);
  const [isLoadingSprint, setIsLoadingSprint] = useState(false);

  // Disarmed Traps & History
  const [disarmedTraps, setDisarmedTraps] = useState<string[]>([]);
  const [radarHistory, setRadarHistory] = useState<ImmunityRadarRecord[]>([]);

  useEffect(() => {
    setDisarmedTraps(getStoredDisarmedTraps());
    setRadarHistory(getStoredRadarHistory());
  }, []);

  const handleDeconstruct = async () => {
    setIsDeconstructing(true);
    try {
      const results = await deconstructExamPaper(
        rawTextPayload,
        subject,
        settings
      );
      setArchetypes(results);
      showToast(
        `Discovered ${results.length} Professor Trap Archetypes in your syllabus!`
      );
      setActiveTab("playbook");
    } catch {
      showToast("Unable to analyze paper. Showing standard trap archetypes.");
    } finally {
      setIsDeconstructing(false);
    }
  };

  const handleStartSprint = async () => {
    setIsLoadingSprint(true);
    try {
      const questions = await generateChallengeSprint(
        subject,
        archetypes,
        sprintCount,
        settings
      );
      setSprintQuestions(questions);
      setIsSprintRunning(true);
    } catch {
      showToast("Unable to start sprint. Please try again.");
    } finally {
      setIsLoadingSprint(false);
    }
  };

  const handleSprintComplete = (results: {
    disarmedCount: number;
    total: number;
    questions: SprintQuestion[];
  }) => {
    const freshDisarmed = getStoredDisarmedTraps();
    setDisarmedTraps(freshDisarmed);

    const record: ImmunityRadarRecord = {
      id: `radar-${Date.now()}`,
      subject,
      timestamp: new Date().toISOString(),
      overallScore: Math.round((results.disarmedCount / results.total) * 100),
      disarmedTrapIds: freshDisarmed,
      totalAttempted: results.total,
      correctCount: results.disarmedCount,
      categoryScores: {},
    };

    saveRadarRecord(record);
    setRadarHistory(getStoredRadarHistory());
    setIsSprintRunning(false);
    setActiveTab("radar");
    showToast(
      `Sprint completed! ${results.disarmedCount}/${results.total} traps disarmed.`
    );
  };

  if (isSprintRunning) {
    return (
      <div className={styles.container}>
        <ChallengeSprintRunner
          questions={sprintQuestions}
          subject={subject}
          onComplete={handleSprintComplete}
          onExit={() => setIsSprintRunning(false)}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Hero Header */}
      <div className={styles.hero}>
        <span className={styles.heroEyebrow}>Exam Trap Radar</span>
        <h1 className={styles.heroTitle}>
          Exam Detective & Tricky Question Simulator
        </h1>
        <p className={styles.heroSubtitle}>
          Deconstruct sneaky professor trap archetypes, master the bait, and
          build ironclad exam immunity before exam day.
        </p>
      </div>

      {/* Tabs */}
      <nav className={styles.tabNav} aria-label="Exam Detective Navigation">
        <button
          type="button"
          className={`${styles.tabBtn} ${
            activeTab === "playbook" ? styles.tabBtnActive : ""
          }`}
          onClick={() => setActiveTab("playbook")}
        >
          <Icon name="book-open" size={16} />
          Professor's Trick Playbook
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${
            activeTab === "deconstruct" ? styles.tabBtnActive : ""
          }`}
          onClick={() => setActiveTab("deconstruct")}
        >
          <Icon name="search" size={16} />
          Deconstruct Exam Paper
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${
            activeTab === "sprint" ? styles.tabBtnActive : ""
          }`}
          onClick={() => setActiveTab("sprint")}
        >
          <Icon name="target" size={16} />
          Challenge Sprint
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${
            activeTab === "radar" ? styles.tabBtnActive : ""
          }`}
          onClick={() => setActiveTab("radar")}
        >
          <Icon name="shield" size={16} />
          Trap Immunity Radar
        </button>
      </nav>

      {/* Tab 1: Professor's Trick Playbook */}
      {activeTab === "playbook" && (
        <section className={styles.section} aria-label="Professor's Trick Playbook">
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                The Professor's Adversarial Playbook
              </h2>
              <p className={styles.sectionDesc}>
                Recognize the 6 psychological and algebraic trick archetypes
                professors use to engineer misleading options.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setActiveTab("sprint")}
            >
              Practice Challenge Sprint →
            </Button>
          </div>

          <div className={styles.cardGrid}>
            {archetypes.map((trap) => {
              const isDisarmed = disarmedTraps.includes(trap.id);
              return (
                <div key={trap.id} className={styles.trapCard}>
                  <div className={styles.trapCardHeader}>
                    <h3 className={styles.trapCardTitle}>{trap.name}</h3>
                    <span
                      className={`${styles.badgePill} ${
                        isDisarmed
                          ? styles.badgePillSuccess
                          : styles.badgePillAccent
                      }`}
                    >
                      {isDisarmed ? "✨ Disarmed" : trap.frequency}
                    </span>
                  </div>

                  <p className={styles.trapDesc}>{trap.description}</p>

                  <div className={styles.exampleBox}>
                    <span className={styles.exampleLabel}>Trap Pattern</span>
                    <p style={{ margin: 0 }}>{trap.examplePattern}</p>
                  </div>

                  <div className={styles.disarmRuleBox}>
                    <strong>Disarm Rule:</strong> {trap.disarmRule}
                  </div>

                  <div className={styles.cardFooter}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setActiveTrapId(trap.id)}
                    >
                      Explore 4-Step Aha!
                    </Button>
                    {isDisarmed && (
                      <span
                        style={{
                          fontSize: "var(--fs-xs)",
                          color: "var(--success-text)",
                          fontWeight: 600,
                        }}
                      >
                        ✓ Trap Immune
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tab 2: Deconstruct Exam Paper */}
      {activeTab === "deconstruct" && (
        <section className={styles.section} aria-label="Deconstruct Exam Paper">
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                Scan Exam Paper or Syllabus
              </h2>
              <p className={styles.sectionDesc}>
                Paste course syllabus text, past exam questions, or review
                materials to isolate tricky traps in your course.
              </p>
            </div>
          </div>

          <div className={styles.inputArea}>
            <div className={styles.formRow}>
              <label
                htmlFor="subject-select"
                style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}
              >
                Subject:
              </label>
              <select
                id="subject-select"
                className={styles.selectInput}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="Calculus & STEM">Calculus & STEM</option>
                <option value="Computer Science Algorithms">
                  Computer Science Algorithms
                </option>
                <option value="Physics & Mechanics">Physics & Mechanics</option>
                <option value="Organic Chemistry & Biology">
                  Organic Chemistry & Biology
                </option>
                <option value="Economics & History">Economics & History</option>
              </select>
            </div>

            <textarea
              className={styles.textarea}
              placeholder="Paste past exam questions, midterm practice problems, or course topics here…"
              value={rawTextPayload}
              onChange={(e) => setRawTextPayload(e.target.value)}
            />

            <div style={{ display: "flex", gap: "var(--s-3)" }}>
              <Button
                variant="primary"
                onClick={handleDeconstruct}
                disabled={isDeconstructing}
              >
                {isDeconstructing
                  ? "Scanning for Traps…"
                  : "Scan for Professor Traps"}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setRawTextPayload(
                    "Sample Exam Question: Evaluate lim (x->0) (sin x)/x. Also solve for x where (x^2 - 4)/(x - 2) = 4."
                  )
                }
              >
                Load Sample Problem
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Tab 3: Launch Challenge Sprint */}
      {activeTab === "sprint" && (
        <section className={styles.section} aria-label="Challenge Sprint Launcher">
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                Tricky Question Challenge Sprint
              </h2>
              <p className={styles.sectionDesc}>
                Step into the arena. Test your ability to resist juicy bait
                options and spot hidden assumptions in real time.
              </p>
            </div>
          </div>

          <div className={styles.inputArea}>
            <div className={styles.formRow}>
              <label
                htmlFor="sprint-subject"
                style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}
              >
                Subject Topic:
              </label>
              <input
                id="sprint-subject"
                type="text"
                className={styles.textInput}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className={styles.formRow}>
              <label
                htmlFor="sprint-count"
                style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}
              >
                Number of Traps:
              </label>
              <select
                id="sprint-count"
                className={styles.selectInput}
                value={sprintCount}
                onChange={(e) => setSprintCount(Number(e.target.value))}
              >
                <option value={3}>3 Traps (Quick Warmup)</option>
                <option value={4}>4 Traps (Standard)</option>
                <option value={6}>6 Traps (Comprehensive)</option>
              </select>
            </div>

            <div style={{ marginTop: "var(--s-3)" }}>
              <Button
                variant="primary"
                onClick={handleStartSprint}
                disabled={isLoadingSprint}
              >
                {isLoadingSprint ? "Preparing Traps…" : "Start Challenge Sprint ⚡"}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Tab 4: Trap Immunity Radar */}
      {activeTab === "radar" && (
        <section className={styles.section} aria-label="Trap Immunity Radar">
          <TrapImmunityRadarView
            subject={subject}
            disarmedTrapIds={disarmedTraps}
            archetypes={archetypes}
          />

          {radarHistory.length > 0 && (
            <div style={{ marginTop: "var(--s-4)" }}>
              <h3 className={styles.sectionTitle}>Recent Sprint Radar Logs</h3>
              <div className={styles.cardGrid} style={{ marginTop: "var(--s-3)" }}>
                {radarHistory.map((item) => (
                  <div key={item.id} className={styles.trapCard}>
                    <div className={styles.trapCardHeader}>
                      <strong style={{ fontSize: "var(--fs-md)" }}>
                        {item.subject}
                      </strong>
                      <span
                        className={`${styles.badgePill} ${styles.badgePillSuccess}`}
                      >
                        {item.overallScore}% Immune
                      </span>
                    </div>
                    <p className={styles.sectionDesc}>
                      {item.correctCount} of {item.totalAttempted} traps disarmed
                    </p>
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-faint)" }}>
                      {new Date(item.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 4-Step Aha! Breakdown Modal */}
      {activeTrapId && (
        <AhaWalkthroughModal
          isOpen={true}
          trapId={activeTrapId}
          subject={subject}
          onClose={() => setActiveTrapId(null)}
          onDisarmed={() => {
            setDisarmedTraps(getStoredDisarmedTraps());
            showToast("Trap disarmed! Immunity updated.");
          }}
        />
      )}
    </div>
  );
}
