import { useState, useRef, useEffect } from "react";
import type { StudyBuddyCheckItem } from "../../hooks/useStudyBuddyChecks";
import { StudyBuddyCard } from "./StudyBuddyCard";
import { Icon } from "../../components/Icon";
import styles from "./studyBuddy.module.css";

interface StudyBuddyGutterProps {
  checks: StudyBuddyCheckItem[];
  isScanning?: boolean;
  onAcceptFix?: (check: StudyBuddyCheckItem) => void;
  onDismiss?: (id: string) => void;
}

export function StudyBuddyGutter({
  checks,
  isScanning = false,
  onAcceptFix,
  onDismiss,
}: StudyBuddyGutterProps) {
  const [activeCheckId, setActiveCheckId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover if clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setActiveCheckId(null);
      }
    }

    if (activeCheckId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [activeCheckId]);

  if (checks.length === 0 && !isScanning) {
    return null;
  }

  const getBadgeClass = (type: StudyBuddyCheckItem["type"]) => {
    switch (type) {
      case "contradiction":
        return `${styles.gutterBadgeBtn} ${styles.badgeContradiction}`;
      case "logic_jump":
        return `${styles.gutterBadgeBtn} ${styles.badgeLogicJump}`;
      case "muddy_concept":
        return `${styles.gutterBadgeBtn} ${styles.badgeMuddyConcept}`;
      case "exam_trap_risk":
        return `${styles.gutterBadgeBtn} ${styles.badgeExamTrapRisk}`;
      default:
        return styles.gutterBadgeBtn;
    }
  };

  return (
    <div
      ref={containerRef}
      className={styles.gutterContainer}
      aria-label="Study Buddy Checks Gutter"
    >
      {/* Summary Pill */}
      <button
        type="button"
        className={`${styles.gutterPill} ${
          activeCheckId ? styles.gutterPillActive : styles.gutterPillAlert
        }`}
        onClick={() =>
          setActiveCheckId((prev) => (prev ? null : checks[0]?.id || null))
        }
        title={
          isScanning
            ? "Study Buddy is reviewing your notes…"
            : `${checks.length} helpful tips detected`
        }
      >
        <Icon name="sparkles" size={12} />
        <span>
          {isScanning
            ? "Scanning…"
            : `${checks.length} Buddy ${checks.length === 1 ? "Tip" : "Tips"}`}
        </span>
      </button>

      {/* Individual Badges */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-1)" }}>
        {checks.map((check, idx) => {
          const isActive = check.id === activeCheckId;
          return (
            <div key={check.id} style={{ position: "relative" }}>
              <button
                type="button"
                className={getBadgeClass(check.type)}
                onClick={() =>
                  setActiveCheckId((prev) => (prev === check.id ? null : check.id))
                }
                title={`${check.title}: ${check.friendlyMessage}`}
                aria-expanded={isActive}
              >
                {idx + 1}
              </button>

              {/* Popover Card */}
              {isActive && (
                <div className={styles.popoverOverlay}>
                  <StudyBuddyCard
                    check={check}
                    onAcceptFix={(item) => {
                      onAcceptFix?.(item);
                      setActiveCheckId(null);
                    }}
                    onDismiss={(id) => {
                      onDismiss?.(id);
                      setActiveCheckId(null);
                    }}
                    onClose={() => setActiveCheckId(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
