import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import styles from "./personaOffset.module.css";

export type PersonaDepth = 1 | 2 | 3 | 4 | 5;

/* Plain words a Grade 9 student can pick between without a legend. The
   old "Lvl 3: Standard" pill read like a game setting, not a choice about
   how long the answer would be. */
export const DEPTH_LABELS: Record<PersonaDepth, string> = {
  1: "Just the gist",
  2: "Simple",
  3: "Standard",
  4: "Detailed",
  5: "In depth",
};

export type StudyStyle = "balanced" | "visual" | "rigorous" | "exam_trap" | "concise";

export interface StudyStyleOption {
  id: StudyStyle;
  label: string;
  description: string;
}

export const STUDY_STYLES: ReadonlyArray<StudyStyleOption> = [
  {
    id: "balanced",
    label: "Balanced",
    description: "A clear explanation with one example",
  },
  {
    id: "visual",
    label: "Visual",
    description: "Diagrams, pictures in words, and analogies",
  },
  {
    id: "rigorous",
    label: "Step by step",
    description: "Every step shown, with the working and the edge cases",
  },
  {
    id: "exam_trap",
    label: "Exam focus",
    description: "What examiners look for and the mistakes that lose marks",
  },
  {
    id: "concise",
    label: "Short",
    description: "The key points, nothing extra",
  },
];

export interface PersonaOffsetConfig {
  depth: PersonaDepth;
  style: StudyStyle;
}

export interface PersonaOffsetToolbarProps {
  depth?: PersonaDepth;
  style?: StudyStyle;
  /** Where answers come from, lower-case: "this lesson", "general
   *  knowledge" (lib/chatSources.ts resolveChatSources). */
  sourceLabel: string;
  /** The controls for choosing sources, shown first in the drawer. */
  sourcesPanel?: ReactNode;
  onDepthChange?: (depth: PersonaDepth) => void;
  onStyleChange?: (style: StudyStyle) => void;
  onChange?: (config: PersonaOffsetConfig) => void;
  compact?: boolean;
  className?: string;
}

export function PersonaOffsetToolbar({
  depth: controlledDepth,
  style: controlledStyle,
  sourceLabel,
  sourcesPanel,
  onDepthChange,
  onStyleChange,
  onChange,
  compact = true,
  className,
}: PersonaOffsetToolbarProps) {
  const [internalDepth, setInternalDepth] = useState<PersonaDepth>(3);
  const [internalStyle, setInternalStyle] = useState<StudyStyle>("balanced");
  const [isDrawerOpen, setIsDrawerOpen] = useState(!compact);

  const depth = controlledDepth ?? internalDepth;
  const style = controlledStyle ?? internalStyle;

  const containerRef = useRef<HTMLDivElement>(null);
  const sliderId = useId();

  const updateDepth = (newDepth: PersonaDepth) => {
    setInternalDepth(newDepth);
    onDepthChange?.(newDepth);
    onChange?.({ depth: newDepth, style });
  };

  const updateStyle = (newStyle: StudyStyle) => {
    setInternalStyle(newStyle);
    onStyleChange?.(newStyle);
    onChange?.({ depth, style: newStyle });
  };

  // Close drawer on outside click or Escape
  useEffect(() => {
    if (!isDrawerOpen) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDrawerOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsDrawerOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDrawerOpen]);

  const activeStyleObj = STUDY_STYLES.find((s) => s.id === style);

  return (
    <div
      ref={containerRef}
      className={`${styles.toolbar}${className ? ` ${className}` : ""}`}
      role="region"
      aria-label="Answer settings"
    >
      {/* One line that says, in words, where answers come from and how long
          they'll be. It replaced six pills ("Lvl 3: Standard", "Hybrid", …)
          that took a quarter of the panel and explained none of it. Where the
          answer comes from is the trust signal, so it leads. */}
      <div className={styles.compactRow}>
        <button
          type="button"
          className={`${styles.summaryBtn}${isDrawerOpen ? ` ${styles.summaryOpen}` : ""}`}
          onClick={() => setIsDrawerOpen((prev) => !prev)}
          aria-expanded={isDrawerOpen}
          aria-controls="persona-offset-drawer"
          aria-label={`Answer settings: from ${sourceLabel}, ${DEPTH_LABELS[depth]} detail, ${activeStyleObj?.label ?? style}. Change`}
        >
          <Icon name="settings" size={14} />
          <span className={styles.summaryText}>
            Answers from <strong>{sourceLabel}</strong>
            {" · "}
            {DEPTH_LABELS[depth]}
            {" · "}
            {activeStyleObj?.label}
          </span>
          <span className={styles.summaryChange}>{isDrawerOpen ? "Close" : "Change"}</span>
        </button>
      </div>

      {/* Popover / Drawer for Full Adjustment */}
      {isDrawerOpen && (
        <div
          id="persona-offset-drawer"
          className={styles.drawer}
          role="dialog"
          aria-label="Answer settings"
        >
          <div className={styles.drawerHeader}>
            <h3 className={styles.drawerTitle}>
              <Icon name="sparkles" size={16} />
              How Learnora answers
            </h3>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => setIsDrawerOpen(false)}
              aria-label="Close answer settings"
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          {sourcesPanel ? (
            <section className={styles.section} aria-labelledby="persona-source-title">
              <div className={styles.sectionLabelRow}>
                <span id="persona-source-title" className={styles.sectionTitle}>
                  Where answers come from
                </span>
                <span className={styles.sectionValue}>{sourceLabel}</span>
              </div>
              {sourcesPanel}
            </section>
          ) : null}

          {/* Depth Level Stepper & Slider */}
          <section className={styles.section} aria-labelledby="persona-depth-title">
            <div className={styles.sectionLabelRow}>
              <span id="persona-depth-title" className={styles.sectionTitle}>
                How much detail
              </span>
              <span className={styles.sectionValue}>
                {DEPTH_LABELS[depth]}
              </span>
            </div>

            <div className={styles.stepperRow}>
              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => updateDepth(Math.max(1, depth - 1) as PersonaDepth)}
                disabled={depth <= 1}
                aria-label="Less detail"
              >
                -
              </button>

              <div className={styles.sliderTrack}>
                <input
                  id={sliderId}
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={depth}
                  onChange={(e) =>
                    updateDepth(Number(e.target.value) as PersonaDepth)
                  }
                  className={styles.slider}
                  aria-label="How much detail"
                  aria-valuemin={1}
                  aria-valuemax={5}
                  aria-valuenow={depth}
                  aria-valuetext={DEPTH_LABELS[depth]}
                />
              </div>

              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => updateDepth(Math.min(5, depth + 1) as PersonaDepth)}
                disabled={depth >= 5}
                aria-label="More detail"
              >
                +
              </button>
            </div>
          </section>

          {/* Study Style Selector Chips */}
          <section className={styles.section} aria-labelledby="persona-style-title">
            <div className={styles.sectionLabelRow}>
              <span id="persona-style-title" className={styles.sectionTitle}>
                Style
              </span>
              <span className={styles.sectionValue}>{activeStyleObj?.label}</span>
            </div>
            <div className={styles.chipGroup} role="radiogroup" aria-label="Style">
              {STUDY_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={style === s.id}
                  className={`${styles.chip}${
                    style === s.id ? ` ${styles.chipActive}` : ""
                  }`}
                  onClick={() => updateStyle(s.id)}
                  title={s.description}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <div className={styles.drawerFooter}>
            <button
              type="button"
              className={styles.applyBtn}
              onClick={() => setIsDrawerOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
