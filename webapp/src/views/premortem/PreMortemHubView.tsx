import { useState, useEffect } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { examsApi } from "../../api/exams";
import { foldersApi } from "../../api/folders";
import type { Exam, Folder } from "../../api/types";
import {
  DEFAULT_TRAP_ARCHETYPES,
  extractProfessorTraps,
  generateStressTest,
  getPreMortemReports,
  type TrapArchetype,
  type StressQuestion,
  type PreMortemReport,
} from "../../api/aiPreMortem";
import { StressTestRunner } from "./StressTestRunner";
import { PreMortemRadarView } from "./PreMortemRadarView";
import styles from "./PreMortemHubView.module.css";

type HubMode = "config" | "running" | "radar";

export function PreMortemHubView() {
  const [mode, setMode] = useState<HubMode>("config");
  const [exams, setExams] = useState<Exam[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("Calculus & Analysis");
  const [customSubjectInput, setCustomSubjectInput] = useState("");
  const [selectedExamId, setSelectedExamId] = useState<string>("");

  const [archetypes, setArchetypes] = useState<TrapArchetype[]>(
    DEFAULT_TRAP_ARCHETYPES
  );
  const [selectedTrapIds, setSelectedTrapIds] = useState<string[]>([
    "boundary-condition-tricks",
    "negative-phrasing-distractors",
    "multi-step-assumption-traps",
    "false-synonym-conflation",
  ]);

  const [questionCount, setQuestionCount] = useState<number>(5);
  const [intensity, setIntensity] = useState<string>("Extreme Hardcore");

  const [activeQuestions, setActiveQuestions] = useState<StressQuestion[]>([]);
  const [activeReport, setActiveReport] = useState<PreMortemReport | null>(null);
  const [pastReports, setPastReports] = useState<PreMortemReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setPastReports(getPreMortemReports());

    examsApi.fetch().then((data) => {
      setExams(data);
      if (data.length > 0) {
        setSelectedExamId(String(data[0].id));
        setSelectedSubject(data[0].exam_name);
      }
    });

    foldersApi.fetch().then((data) => {
      setFolders(data);
    });
  }, []);

  const handleSelectExamChange = (examId: string) => {
    setSelectedExamId(examId);
    if (examId === "custom") {
      setSelectedSubject(customSubjectInput || "Custom Subject");
    } else {
      const foundExam = exams.find((e) => String(e.id) === examId);
      if (foundExam) {
        setSelectedSubject(foundExam.exam_name);
        extractProfessorTraps(foundExam.exam_name).then(setArchetypes);
      }
    }
  };

  const handleToggleTrap = (trapId: string) => {
    setSelectedTrapIds((prev) =>
      prev.includes(trapId)
        ? prev.filter((id) => id !== trapId)
        : [...prev, trapId]
    );
  };

  const handleSelectAllTraps = () => {
    setSelectedTrapIds(archetypes.map((a) => a.id));
  };

  const handleClearTraps = () => {
    setSelectedTrapIds([]);
  };

  const handleLaunchGauntlet = async () => {
    const effectiveSubject =
      selectedExamId === "custom" && customSubjectInput.trim()
        ? customSubjectInput.trim()
        : selectedSubject;

    setIsLoading(true);
    try {
      const questions = await generateStressTest(
        effectiveSubject,
        selectedTrapIds,
        questionCount
      );
      setActiveQuestions(questions);
      setMode("running");
    } catch (err) {
      console.error("Failed to generate stress test", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestComplete = (report: PreMortemReport) => {
    setActiveReport(report);
    setPastReports(getPreMortemReports());
    setMode("radar");
  };

  const handleViewPastReport = (report: PreMortemReport) => {
    setActiveReport(report);
    setMode("radar");
  };

  // Render Runner Mode
  if (mode === "running") {
    return (
      <StressTestRunner
        subject={selectedSubject}
        questions={activeQuestions}
        timeLimitSeconds={questionCount * 60}
        onComplete={handleTestComplete}
        onCancel={() => setMode("config")}
      />
    );
  }

  // Render Radar Report Mode
  if (mode === "radar") {
    return (
      <PreMortemRadarView
        report={activeReport}
        onRetest={() => setMode("config")}
      />
    );
  }

  // Render Config / Hub Mode
  return (
    <div className={styles.container}>
      <PageHeader
        title="Adversarial Professor & Exam Pre-Mortem"
        eyebrow="Diagnostic Engine"
        sub="Simulate your worst-case exam traps, predict topic failure points, and neutralize cognitive blindspots before test day."
      />

      {/* Hero Banner */}
      <section className={styles.heroCard}>
        <div className={styles.heroTag}>
          <Icon name="shield" size={16} />
          <span>Pre-Mortem Failure Prediction</span>
        </div>
        <h1 className={styles.heroTitle}>Stress-Test Against Professor Tricks</h1>
        <p className={styles.heroSub}>
          Real exams aren't failed from lack of study—they're failed from boundary-condition
          traps, negative phrasing ambushes, and hidden assumption fallacies. Run an adversarial
          gauntlet now to uncover your failure radar.
        </p>
      </section>

      {/* Subject & Exam Configuration */}
      <section className={styles.configSection} aria-labelledby="config-heading">
        <div className={styles.sectionHeader}>
          <h2 id="config-heading" className={styles.sectionTitle}>
            1. Target Exam & Subject
          </h2>
        </div>

        <div className={styles.formGrid}>
          <div className={styles.formField}>
            <label className={styles.fieldLabel} htmlFor="exam-select">
              Select Upcoming Exam or Course
            </label>
            <select
              id="exam-select"
              className={styles.selectInput}
              value={selectedExamId}
              onChange={(e) => handleSelectExamChange(e.target.value)}
            >
              {exams.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.exam_name} ({e.difficulty || "Standard"})
                </option>
              ))}
              {folders.map((f) => (
                <option key={`folder-${f.id}`} value={`folder-${f.id}`}>
                  Subject: {f.name}
                </option>
              ))}
              <option value="custom">-- Custom Subject or Topic --</option>
            </select>
          </div>

          {selectedExamId === "custom" && (
            <div className={styles.formField}>
              <label className={styles.fieldLabel} htmlFor="custom-subject">
                Enter Custom Subject Name
              </label>
              <input
                id="custom-subject"
                type="text"
                className={styles.textInput}
                placeholder="e.g. Organic Chemistry 2, Algorithms, Microeconomics"
                value={customSubjectInput}
                onChange={(e) => {
                  setCustomSubjectInput(e.target.value);
                  setSelectedSubject(e.target.value || "Custom Subject");
                }}
              />
            </div>
          )}

          <div className={styles.formField}>
            <label className={styles.fieldLabel} htmlFor="intensity-select">
              Adversarial Intensity Level
            </label>
            <select
              id="intensity-select"
              className={styles.selectInput}
              value={intensity}
              onChange={(e) => setIntensity(e.target.value)}
            >
              <option value="Extreme Hardcore">Extreme Hardcore (Boundary Edge Cases)</option>
              <option value="Diabolical Professor">Diabolical Professor (Negative Phrasing & Distractors)</option>
              <option value="Standard Trap Mode">Standard Trap Mode (Pervasive Fallacies)</option>
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.fieldLabel} htmlFor="count-select">
              Stress Question Count
            </label>
            <select
              id="count-select"
              className={styles.selectInput}
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
            >
              <option value={5}>5 Questions (Rapid 5-Minute Sprint)</option>
              <option value={10}>10 Questions (Full Pre-Mortem Audit)</option>
              <option value={15}>15 Questions (Mastery Gauntlet)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Adversarial Trap Profiles Selection */}
      <section className={styles.configSection} aria-labelledby="traps-heading">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="traps-heading" className={styles.sectionTitle}>
              2. Select Adversarial Trap Profiles
            </h2>
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
              {selectedTrapIds.length} of {archetypes.length} trap archetypes active
            </p>
          </div>

          <div style={{ display: "flex", gap: "var(--s-2)" }}>
            <Button variant="secondary" size="sm" onClick={handleSelectAllTraps}>
              Select All
            </Button>
            <Button variant="secondary" size="sm" onClick={handleClearTraps}>
              Clear
            </Button>
          </div>
        </div>

        <div className={styles.archetypesGrid}>
          {archetypes.map((trap) => {
            const isSelected = selectedTrapIds.includes(trap.id);

            return (
              <div
                key={trap.id}
                role="checkbox"
                aria-checked={isSelected}
                tabIndex={0}
                className={`${styles.archetypeCard} ${
                  isSelected ? styles.archetypeCardSelected : ""
                }`}
                onClick={() => handleToggleTrap(trap.id)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    handleToggleTrap(trap.id);
                  }
                }}
              >
                <div className={styles.archetypeTop}>
                  <span className={styles.archetypeName}>{trap.name}</span>
                  <span className={styles.freqBadge}>{trap.frequency}</span>
                </div>

                <p className={styles.archetypeDesc}>{trap.description}</p>

                <div className={styles.patternBox}>
                  <strong>Example Pattern: </strong>
                  <span>{trap.examplePattern}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Launch Action Panel */}
      <section className={styles.launchPanel}>
        <div>
          <h3 style={{ margin: "0 0 var(--s-1) 0", fontSize: "var(--fs-lg)" }}>
            Ready to Run the Gauntlet?
          </h3>
          <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>
            Targeting {selectedSubject} with {selectedTrapIds.length} active trap archetypes.
          </p>
        </div>

        <Button
          variant="primary"
          disabled={selectedTrapIds.length === 0 || isLoading}
          onClick={handleLaunchGauntlet}
        >
          <Icon name="zap" size={18} />
          <span>
            {isLoading
              ? "Synthesizing Adversarial Traps..."
              : "Launch Stress-Test Gauntlet"}
          </span>
        </Button>
      </section>

      {/* Past Pre-Mortem Audit Reports History */}
      {pastReports.length > 0 && (
        <section className={styles.configSection} aria-labelledby="history-heading">
          <div className={styles.sectionHeader}>
            <h2 id="history-heading" className={styles.sectionTitle}>
              Past Pre-Mortem Audit Reports
            </h2>
            <Link to="/premortem/radar">
              <Button variant="secondary" size="sm">
                Open Latest Radar
              </Button>
            </Link>
          </div>

          <div className={styles.historyGrid}>
            {pastReports.slice(0, 4).map((report, idx) => (
              <Card
                key={report.id || idx}
                variant="panel"
                padding="md"
                className={styles.historyCard}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: "var(--fs-sm)" }}>
                    {report.subject || "Pre-Mortem Audit"}
                  </span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
                    {new Date(report.timestamp).toLocaleDateString()}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: "var(--s-2)" }}>
                  <span className={styles.historyScore}>{report.predictedScore}%</span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
                    {report.gradeEstimate}
                  </span>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleViewPastReport(report)}
                >
                  View Failure Radar
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
