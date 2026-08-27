import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { useTimer } from "../../context/timer";
import { useFolders } from "../../hooks/useFolders";
import {
  format,
  isActive,
  isCountUp,
  modeLabel,
  progressFraction,
} from "../../lib/timer";
import styles from "./FocusStudyHUD.module.css";

export const SCRATCHPAD_STORAGE_KEY = "learnora_quick_scratchpad";

export function FocusStudyHUD() {
  const { state, toggle, extend, activeTask, activeFolderId } = useTimer();
  const { data: folders } = useFolders();
  const location = useLocation();
  const navigate = useNavigate();

  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [scratchpadText, setScratchpadText] = useState(() => {
    try {
      return localStorage.getItem(SCRATCHPAD_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isVisible = isActive(state) && location.pathname !== "/timer";

  useEffect(() => {
    if (isVisible) {
      document.documentElement.dataset.hasMiniTimer = "true";
    } else {
      delete document.documentElement.dataset.hasMiniTimer;
    }
    return () => {
      delete document.documentElement.dataset.hasMiniTimer;
    };
  }, [isVisible]);

  // Global Alt+N shortcut to toggle scratchpad popover
  useEffect(() => {
    if (!isVisible) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && (e.key === "n" || e.key === "N" || e.code === "KeyN")) {
        e.preventDefault();
        setIsScratchpadOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isVisible]);

  // Auto-focus textarea when scratchpad popover opens
  useEffect(() => {
    if (isScratchpadOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isScratchpadOpen]);

  if (!isVisible) return null;

  const seconds = isCountUp(state) ? state.elapsed : state.timeLeft;
  const currentFolder = folders?.find((f) => f.id === activeFolderId);
  const subjectColor = currentFolder?.color;

  const taskTitle =
    activeTask && activeTask !== "None"
      ? activeTask
      : currentFolder?.name
        ? currentFolder.name
        : "General Study";

  const handleScratchpadChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const val = e.target.value;
    setScratchpadText(val);
    try {
      localStorage.setItem(SCRATCHPAD_STORAGE_KEY, val);
    } catch (err) {
      console.warn("Failed to persist scratchpad:", err);
    }
  };

  const handleClearScratchpad = () => {
    setScratchpadText("");
    try {
      localStorage.setItem(SCRATCHPAD_STORAGE_KEY, "");
    } catch (err) {
      console.warn("Failed to clear scratchpad:", err);
    }
  };

  const progress = progressFraction(state);
  const progressPercent = Math.min(100, Math.max(0, Math.round(progress * 100)));

  return (
    <aside
      className={`${styles.hudContainer}${state.isRunning ? ` ${styles.running}` : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Focus Study HUD"
    >
      {/* Quick Distraction Scratchpad Popover */}
      {isScratchpadOpen && (
        <div
          className={styles.scratchpadPopover}
          role="dialog"
          aria-label="Distraction scratchpad"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setIsScratchpadOpen(false);
            }
          }}
        >
          <div className={styles.scratchpadHeader}>
            <div className={styles.scratchpadTitle}>
              <Icon name="pencil" size={14} className={styles.scratchpadIcon} />
              <span>Distraction Scratchpad</span>
              <kbd className={styles.kbdBadge}>Alt+N</kbd>
            </div>
            <div className={styles.scratchpadActions}>
              {scratchpadText && (
                <button
                  type="button"
                  className={styles.scratchpadClearBtn}
                  onClick={handleClearScratchpad}
                  title="Clear note"
                  aria-label="Clear note"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className={styles.scratchpadCloseBtn}
                onClick={() => setIsScratchpadOpen(false)}
                aria-label="Close scratchpad"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>
          <textarea
            ref={textareaRef}
            className={styles.scratchpadTextarea}
            value={scratchpadText}
            onChange={handleScratchpadChange}
            placeholder="Jot fleeting thoughts or distractions to park them for later..."
            aria-label="Scratchpad notes"
            rows={4}
          />
          <div className={styles.scratchpadFooter}>
            <span className={styles.scratchpadAutoSave}>
              <Icon name="check" size={12} /> Auto-saved
            </span>
          </div>
        </div>
      )}

      <div className={styles.hudCard}>
        {/* Main interactive area that navigates to /timer */}
        <button
          type="button"
          className={styles.main}
          aria-label="Open the timer"
          onClick={() => void navigate("/timer")}
        >
          <span
            className={styles.dot}
            style={subjectColor ? { backgroundColor: subjectColor } : undefined}
            data-testid="subject-dot"
            aria-hidden="true"
            title={currentFolder?.name ? `Subject: ${currentFolder.name}` : undefined}
          />
          <div className={styles.info}>
            <div className={styles.taskLabel} title={taskTitle}>
              {taskTitle}
            </div>
            <div className={styles.timeRow}>
              <span className={styles.modeLabel}>{modeLabel(state)}</span>
              <span className={styles.time}>{format(seconds)}</span>
            </div>
          </div>
        </button>

        {/* Action Controls */}
        <div className={styles.controls}>
          {/* Quick Extender (+5m) */}
          <button
            type="button"
            className={`${styles.btn} ${styles.extendBtn}`}
            aria-label="+5 minutes"
            title="Add 5 minutes to timer"
            onClick={extend}
          >
            +5m
          </button>

          {/* Distraction Scratchpad Toggle */}
          <button
            type="button"
            className={`${styles.btn} ${isScratchpadOpen ? styles.btnActive : ""}`}
            aria-label="Distraction scratchpad"
            aria-expanded={isScratchpadOpen}
            title="Quick Distraction Scratchpad (Alt+N)"
            onClick={() => setIsScratchpadOpen((prev) => !prev)}
          >
            <Icon name="pencil" size={15} />
          </button>

          {/* Play/Pause Toggle */}
          <button
            type="button"
            className={`${styles.btn} ${styles.playPauseBtn}`}
            aria-label={state.isRunning ? "Pause timer" : "Resume timer"}
            onClick={toggle}
          >
            <Icon name={state.isRunning ? "pause" : "play"} size={16} />
          </button>
        </div>

        {/* Continuous Progress Bar */}
        <div
          className={styles.bar}
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Timer progress"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </aside>
  );
}
