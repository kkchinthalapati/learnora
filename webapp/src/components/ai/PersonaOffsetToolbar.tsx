import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../Icon";
import styles from "./personaOffset.module.css";

export type PersonaDepth = 1 | 2 | 3 | 4 | 5;

export const DEPTH_LABELS: Record<PersonaDepth, string> = {
  1: "Quick Intuition",
  2: "Conceptual Foundations",
  3: "Standard",
  4: "Advanced Analysis",
  5: "Deep Academic",
};

export type StudyStyle = "visual" | "rigorous" | "exam_trap" | "concise";

export interface StudyStyleOption {
  id: StudyStyle;
  label: string;
  description: string;
}

export const STUDY_STYLES: ReadonlyArray<StudyStyleOption> = [
  {
    id: "visual",
    label: "Visual 🎨",
    description: "Diagrams, mental models, and visual analogies",
  },
  {
    id: "rigorous",
    label: "Rigorous 📐",
    description: "Formal proofs, mathematical precision, and edge cases",
  },
  {
    id: "exam_trap",
    label: "Exam Trap 🎯",
    description: "Common pitfalls, marking criteria, and high-yield traps",
  },
  {
    id: "concise",
    label: "Concise ⚡",
    description: "High-density takeaways with zero fluff",
  },
];

export type SourceMode = "web" | "notebook" | "hybrid";

export interface SourceModeOption {
  id: SourceMode;
  label: string;
  description: string;
}

export const SOURCE_MODES: ReadonlyArray<SourceModeOption> = [
  { id: "web", label: "🌐 Web", description: "Live web intelligence" },
  {
    id: "notebook",
    label: "📚 Notebook",
    description: "Grounded strictly in your notes",
  },
  {
    id: "hybrid",
    label: "🔀 Hybrid",
    description: "Notebook notes + live web search",
  },
];

export interface PersonaOffsetConfig {
  depth: PersonaDepth;
  style: StudyStyle;
  sourceMode: SourceMode;
}

export interface PersonaOffsetToolbarProps {
  depth?: PersonaDepth;
  style?: StudyStyle;
  sourceMode?: SourceMode;
  onDepthChange?: (depth: PersonaDepth) => void;
  onStyleChange?: (style: StudyStyle) => void;
  onSourceModeChange?: (mode: SourceMode) => void;
  onChange?: (config: PersonaOffsetConfig) => void;
  compact?: boolean;
  className?: string;
}

export function PersonaOffsetToolbar({
  depth: controlledDepth,
  style: controlledStyle,
  sourceMode: controlledSourceMode,
  onDepthChange,
  onStyleChange,
  onSourceModeChange,
  onChange,
  compact = true,
  className,
}: PersonaOffsetToolbarProps) {
  const [internalDepth, setInternalDepth] = useState<PersonaDepth>(3);
  const [internalStyle, setInternalStyle] = useState<StudyStyle>("concise");
  const [internalSourceMode, setInternalSourceMode] =
    useState<SourceMode>("hybrid");
  const [isDrawerOpen, setIsDrawerOpen] = useState(!compact);

  const depth = controlledDepth ?? internalDepth;
  const style = controlledStyle ?? internalStyle;
  const sourceMode = controlledSourceMode ?? internalSourceMode;

  const containerRef = useRef<HTMLDivElement>(null);
  const sliderId = useId();

  const updateDepth = (newDepth: PersonaDepth) => {
    setInternalDepth(newDepth);
    onDepthChange?.(newDepth);
    onChange?.({ depth: newDepth, style, sourceMode });
  };

  const updateStyle = (newStyle: StudyStyle) => {
    setInternalStyle(newStyle);
    onStyleChange?.(newStyle);
    onChange?.({ depth, style: newStyle, sourceMode });
  };

  const updateSourceMode = (newMode: SourceMode) => {
    setInternalSourceMode(newMode);
    onSourceModeChange?.(newMode);
    onChange?.({ depth, style, sourceMode: newMode });
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
  const activeSourceObj = SOURCE_MODES.find((s) => s.id === sourceMode);

  return (
    <div
      ref={containerRef}
      className={`${styles.toolbar}${className ? ` ${className}` : ""}`}
      role="region"
      aria-label="AI Study Persona & Source Settings"
    >
      {/* Compact Quick-Pills Row */}
      <div className={styles.compactRow} role="toolbar" aria-label="Quick controls">
        <div className={styles.quickPillGroup}>
          {/* Depth Quick Pill */}
          <button
            type="button"
            className={`${styles.quickPill} ${styles.quickPillActive}`}
            onClick={() => setIsDrawerOpen((prev) => !prev)}
            aria-label={`Depth Level ${depth}: ${DEPTH_LABELS[depth]}. Click to adjust.`}
            title={`Depth Level ${depth}: ${DEPTH_LABELS[depth]}`}
          >
            <span>🎯 Lvl {depth}: {DEPTH_LABELS[depth]}</span>
          </button>

          {/* Style Quick Pill */}
          <button
            type="button"
            className={styles.quickPill}
            onClick={() => setIsDrawerOpen((prev) => !prev)}
            aria-label={`Style: ${activeStyleObj?.label ?? style}. Click to adjust.`}
            title={`Style: ${activeStyleObj?.label ?? style}`}
          >
            <span>{activeStyleObj?.label ?? style}</span>
          </button>

          {/* Source Mode Toggle Pills */}
          {SOURCE_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`${styles.quickPill}${
                sourceMode === mode.id ? ` ${styles.quickPillActive}` : ""
              }`}
              onClick={() => updateSourceMode(mode.id)}
              aria-pressed={sourceMode === mode.id}
              aria-label={`Source mode ${mode.label}`}
              title={mode.description}
            >
              <span>{mode.label}</span>
            </button>
          ))}
        </div>

        {/* Adjust Drawer Toggle */}
        <button
          type="button"
          className={`${styles.adjustBtn}${
            isDrawerOpen ? ` ${styles.adjustBtnActive}` : ""
          }`}
          onClick={() => setIsDrawerOpen((prev) => !prev)}
          aria-expanded={isDrawerOpen}
          aria-controls="persona-offset-drawer"
          aria-label="Adjust AI study persona"
        >
          <Icon name="sparkles" size={14} />
          <span>{isDrawerOpen ? "Close" : "Adjust"}</span>
        </button>
      </div>

      {/* Popover / Drawer for Full Adjustment */}
      {isDrawerOpen && (
        <div
          id="persona-offset-drawer"
          className={styles.drawer}
          role="dialog"
          aria-label="AI Study Persona Settings Drawer"
        >
          <div className={styles.drawerHeader}>
            <h3 className={styles.drawerTitle}>
              <Icon name="sparkles" size={16} />
              AI Study Persona & Intelligence
            </h3>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => setIsDrawerOpen(false)}
              aria-label="Close persona drawer"
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* Depth Level Stepper & Slider */}
          <section className={styles.section} aria-labelledby="persona-depth-title">
            <div className={styles.sectionLabelRow}>
              <span id="persona-depth-title" className={styles.sectionTitle}>
                Depth Level
              </span>
              <span className={styles.sectionValue}>
                Level {depth}: {DEPTH_LABELS[depth]}
              </span>
            </div>

            <div className={styles.stepperRow}>
              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => updateDepth(Math.max(1, depth - 1) as PersonaDepth)}
                disabled={depth <= 1}
                aria-label="Decrease depth level"
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
                  aria-label="Depth level slider"
                  aria-valuemin={1}
                  aria-valuemax={5}
                  aria-valuenow={depth}
                  aria-valuetext={`Level ${depth}: ${DEPTH_LABELS[depth]}`}
                />
              </div>

              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => updateDepth(Math.min(5, depth + 1) as PersonaDepth)}
                disabled={depth >= 5}
                aria-label="Increase depth level"
              >
                +
              </button>
            </div>
          </section>

          {/* Study Style Selector Chips */}
          <section className={styles.section} aria-labelledby="persona-style-title">
            <div className={styles.sectionLabelRow}>
              <span id="persona-style-title" className={styles.sectionTitle}>
                Study Style
              </span>
              <span className={styles.sectionValue}>{activeStyleObj?.label}</span>
            </div>
            <div className={styles.chipGroup} role="radiogroup" aria-label="Study style">
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

          {/* Source Mode Toggle Pills */}
          <section className={styles.section} aria-labelledby="persona-source-title">
            <div className={styles.sectionLabelRow}>
              <span id="persona-source-title" className={styles.sectionTitle}>
                Source Mode
              </span>
              <span className={styles.sectionValue}>
                {activeSourceObj?.label}
              </span>
            </div>
            <div className={styles.chipGroup} role="radiogroup" aria-label="Source mode">
              {SOURCE_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={sourceMode === m.id}
                  className={`${styles.chip}${
                    sourceMode === m.id ? ` ${styles.chipActive}` : ""
                  }`}
                  onClick={() => updateSourceMode(m.id)}
                  title={m.description}
                >
                  {m.label}
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
