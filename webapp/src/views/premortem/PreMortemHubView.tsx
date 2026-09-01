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
import { CognitiveBridge } from "../../lib/cognitiveBridge";
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

    const bridged = CognitiveBridge.getPayload();
    if (bridged && bridged.sourceTool !== "premortem") {
      const target = bridged.subject || bridged.concept || bridged.topic;
      if (target) {
        setSelectedSubject(target);
        setSelectedExamId("custom");
        setCustomSubjectInput(target);
        extractProfessorTraps(target).then(setArchetypes);
      }
    }
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
        title="What Could Go Wrong"
        eyebrow="Study Lab"
        sub="Find the traps an examiner might set for you, and sort them out before the real thing."
      />

      {/* Hero Banner */}
      <section className={styles.heroCard}>
        <div className={styles.heroTag}>
          <Icon name="shield" size={16} />
          <span>Spot the traps early</span>
        </div>
        <h1 className={styles.heroTitle}>Practise on the questions designed to catch you out</h1>
        <p className={styles.heroSub}>
          Most marks are lost to the tricky bits, not to a lack of revision — edge cases,
          questions phrased backwards, and assumptions you never noticed you were making.
          Have a go at some now and see which ones catch you.
        </p>
      </section>

      {/* Subject & Exam Configuration */}
      <section className={styles.configSection} aria-labelledby="config-heading">
        <div className={styles.sectionHeader}>
          <h2 id="config-heading" className={styles.sectionTitle}>
            1. Which exam or subject?
          </h2>
        </div>

        <div className={styles.formGrid}>
          <div className={styles.formField}>
            <label className={styles.fieldLabel} htmlFor="exam-select">
              Pick an exam or subject
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
                Type the subject in
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
              How hard should they be?
            </label>
            <select
              id="intensity-select"
              className={styles.selectInput}
              value={intensity}
              onChange={(e) => setIntensity(e.target.value)}
            >
              <option value="Extreme Hardcore">Brutal — the awkward edge cases</option>
              <option value="Diabolical Professor">Sneaky — questions phrased backwards</option>
              <option value="Standard Trap Mode">Standard — the usual traps</option>
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.fieldLabel} htmlFor="count-select">
              How many questions?
            </label>
            <select
              id="count-select"
              className={styles.selectInput}
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
            >
              <option value={5}>5 questions — a quick five minutes</option>
              <option value={10}>10 questions — a proper go</option>
              <option value={15}>15 questions — the full set</option>
            </select>
          </div>
        </div>
      </section>

      {/* Trap type selection */}
      <section className={styles.configSection} aria-labelledby="traps-heading">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="traps-heading" className={styles.sectionTitle}>
              2. Which kinds of trap?
            </h2>
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
              {selectedTrapIds.length} of {archetypes.length} picked
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
                  <strong>Looks like: </strong>
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
            Ready to give it a go?
          </h3>
          <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>
            {selectedSubject}, with {selectedTrapIds.length} kinds of trap.
          </p>
        </div>

        <Button
          variant="primary"
          disabled={
            selectedTrapIds.length === 0 ||
            isLoading ||
            (selectedExamId === "custom" && !customSubjectInput.trim())
          }
          onClick={handleLaunchGauntlet}
        >
          <Icon name="zap" size={18} />
          <span>
            {isLoading
              ? "Writing your questions…"
              : "Start"}
          </span>
        </Button>
      </section>

      {/* Past attempts */}
      {pastReports.length > 0 && (
        <section className={styles.configSection} aria-labelledby="history-heading">
          <div className={styles.sectionHeader}>
            <h2 id="history-heading" className={styles.sectionTitle}>
              Your past attempts
            </h2>
            <Link to="/premortem/radar">
              <Button variant="secondary" size="sm">
                Open the latest one
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
                    {report.subject || "Past attempt"}
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
                  See what tripped me up
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
