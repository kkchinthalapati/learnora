import { useState, useCallback } from "react";
import { useSearchParams, useParams } from "react-router";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import { CognitiveDebuggerView } from "../debugger/CognitiveDebuggerView";
import { FeynmanHubView } from "../feynman/FeynmanHubView";
import { SocraticSparringView } from "../sparring/SocraticSparringView";
import { PreMortemHubView } from "../premortem/PreMortemHubView";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import type { IconName } from "../../components/icons";
import styles from "./aiTutor.module.css";

export type TutorMode = "solver" | "explain" | "viva" | "traps";

interface ModeConfig {
  id: TutorMode;
  title: string;
  subtitle: string;
  icon: IconName;
  description: string;
}

const TUTOR_MODES: ModeConfig[] = [
  {
    id: "solver",
    title: "Step-by-Step Solver",
    subtitle: "Root-Cause Problem Repair",
    icon: "layers",
    description: "Identify exactly where reasoning broke down and test your repair.",
  },
  {
    id: "explain",
    title: "Explain & Teach",
    subtitle: "Active Feynman Method",
    icon: "book-open",
    description: "Explain concepts simply to an AI apprentice to find your knowledge gaps.",
  },
  {
    id: "viva",
    title: "Viva / Test Practice",
    subtitle: "Socratic Voice & Defense",
    icon: "mic",
    description: "Practice oral exams, defend your logic out loud, and build confidence.",
  },
  {
    id: "traps",
    title: "Common Exam Traps",
    subtitle: "Adversarial Stress Test",
    icon: "alert-triangle",
    description: "Spot distractor tricks and boundary traps before real exams.",
  },
];

export function AiTutorView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { mode: routeMode } = useParams<{ mode?: string }>();

  const modeParam = (searchParams.get("mode") || routeMode) as TutorMode | null;
  const topicParam = searchParams.get("topic") || "";
  const subjectParam = searchParams.get("subject") || "";

  const [activeMode, setActiveMode] = useState<TutorMode>(() => {
    if (modeParam && TUTOR_MODES.some((m) => m.id === modeParam)) {
      return modeParam;
    }
    return "solver";
  });

  const [activeTopic, setActiveTopic] = useState<string>(() => {
    if (topicParam) return topicParam;
    const bridge = CognitiveBridge.getPayload();
    return bridge?.topic || "";
  });

  const [activeSubject] = useState<string>(() => {
    if (subjectParam) return subjectParam;
    const bridge = CognitiveBridge.getPayload();
    return bridge?.subject || "General Study";
  });

  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState(activeTopic);

  // Sync mode changes to URL search params
  const handleSelectMode = useCallback(
    (mode: TutorMode) => {
      setActiveMode(mode);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("mode", mode);
      if (activeTopic) nextParams.set("topic", activeTopic);
      if (activeSubject) nextParams.set("subject", activeSubject);
      setSearchParams(nextParams, { replace: true });

      // Update CognitiveBridge so all mode tools share context
      if (activeTopic) {
        CognitiveBridge.setPayload({
          subject: activeSubject || "General",
          topic: activeTopic,
          sourceTool:
            mode === "solver"
              ? "debugger"
              : mode === "explain"
                ? "feynman"
                : mode === "traps"
                  ? "premortem"
                  : "notes",
        });
      }
    },
    [activeSubject, activeTopic, searchParams, setSearchParams],
  );

  const handleSaveTopic = () => {
    const trimmed = topicDraft.trim();
    setActiveTopic(trimmed);
    setIsEditingTopic(false);
    if (trimmed) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("topic", trimmed);
      setSearchParams(nextParams, { replace: true });
      CognitiveBridge.setPayload({
        subject: activeSubject || "General",
        topic: trimmed,
        sourceTool:
          activeMode === "solver"
            ? "debugger"
            : activeMode === "explain"
              ? "feynman"
              : activeMode === "traps"
                ? "premortem"
                : "notes",
      });
    }
  };

  const handleClearTopic = () => {
    setActiveTopic("");
    setTopicDraft("");
    setIsEditingTopic(false);
    CognitiveBridge.clear();
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("topic");
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className={styles.view}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>
          <Icon name="sparkles" size={14} /> Learnora AI
        </span>
        <h1 className={styles.title}>AI Tutor</h1>
        <p className={styles.subtitle}>
          Your unified personal study companion. Switch between step-by-step
          problem solving, teaching to learn, viva exam rehearsal, and spotting
          exam traps.
        </p>
      </header>

      {/* Active Topic Banner */}
      <div className={styles.topicBar}>
        <div className={styles.topicInfo}>
          <span className={styles.topicLabel}>Active Topic:</span>
          {isEditingTopic ? (
            <div className={styles.topicInputGroup}>
              <input
                type="text"
                className={styles.topicInput}
                value={topicDraft}
                placeholder="Enter concept or chapter..."
                onChange={(e) => setTopicDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTopic();
                  if (e.key === "Escape") setIsEditingTopic(false);
                }}
                autoFocus
              />
              <Button size="sm" variant="primary" onClick={handleSaveTopic}>
                Set
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsEditingTopic(false)}
              >
                Cancel
              </Button>
            </div>
          ) : activeTopic ? (
            <>
              <span className={styles.topicPill}>
                <Icon name="book-open" size={13} /> {activeTopic}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setTopicDraft(activeTopic);
                  setIsEditingTopic(true);
                }}
              >
                Change
              </Button>
              <Button size="sm" variant="secondary" onClick={handleClearTopic}>
                Clear
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsEditingTopic(true)}
            >
              + Set study topic
            </Button>
          )}
        </div>
      </div>

      {/* 4 Mode Tabs */}
      <div
        className={styles.modeTabs}
        role="tablist"
        aria-label="AI Tutor learning modes"
      >
        {TUTOR_MODES.map((mode) => {
          const isActive = activeMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              role="tab"
              id={`tutor-tab-${mode.id}`}
              aria-selected={isActive}
              aria-controls={`tutor-panel-${mode.id}`}
              className={`${styles.modeTab} ${isActive ? styles.modeTabActive : ""}`}
              onClick={() => handleSelectMode(mode.id)}
            >
              <div className={styles.modeTabIcon}>
                <Icon name={mode.icon} size={20} />
              </div>
              <div className={styles.modeTabMeta}>
                <span className={styles.modeTabTitle}>{mode.title}</span>
                <span className={styles.modeTabDesc}>{mode.description}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Mode Workspace Panels */}
      <div className={styles.toolFrame}>
        {activeMode === "solver" && (
          <div
            id="tutor-panel-solver"
            role="tabpanel"
            aria-labelledby="tutor-tab-solver"
          >
            <CognitiveDebuggerView />
          </div>
        )}

        {activeMode === "explain" && (
          <div
            id="tutor-panel-explain"
            role="tabpanel"
            aria-labelledby="tutor-tab-explain"
          >
            <FeynmanHubView />
          </div>
        )}

        {activeMode === "viva" && (
          <div
            id="tutor-panel-viva"
            role="tabpanel"
            aria-labelledby="tutor-tab-viva"
          >
            <SocraticSparringView />
          </div>
        )}

        {activeMode === "traps" && (
          <div
            id="tutor-panel-traps"
            role="tabpanel"
            aria-labelledby="tutor-tab-traps"
          >
            <PreMortemHubView />
          </div>
        )}
      </div>
    </div>
  );
}
