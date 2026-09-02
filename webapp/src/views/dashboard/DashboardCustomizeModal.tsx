import { useState, useEffect } from "react";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { Storage } from "../../lib/storage";

export const DASHBOARD_LAYOUT_KEY = "learnora_dashboard_layout_v2";

export interface DashboardLayoutPreferences {
  visibleSections: {
    todayTimeline: boolean;
    activityRings: boolean;
    recentNotebooks: boolean;
    priorities: boolean;
    continueStudying: boolean;
    progressStreak: boolean;
    sessionsCommunity: boolean;
  };
}

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutPreferences = {
  visibleSections: {
    todayTimeline: true,
    activityRings: true,
    recentNotebooks: true,
    priorities: true,
    continueStudying: true,
    progressStreak: true,
    sessionsCommunity: true,
  },
};

export function loadDashboardLayout(): DashboardLayoutPreferences {
  const stored = Storage.get<Partial<DashboardLayoutPreferences>>(
    DASHBOARD_LAYOUT_KEY,
    DEFAULT_DASHBOARD_LAYOUT,
  );
  /* Merged onto the defaults rather than returned as-is. A student who has
     ever opened this modal has a stored object listing the sections that
     existed *then*, so every section added afterwards reads as `undefined` —
     which is falsy, so a new card ships hidden for exactly the people who
     already use the dashboard, and visible only to new accounts. */
  return {
    ...DEFAULT_DASHBOARD_LAYOUT,
    ...stored,
    visibleSections: {
      ...DEFAULT_DASHBOARD_LAYOUT.visibleSections,
      ...stored?.visibleSections,
    },
  };
}

export function saveDashboardLayout(layout: DashboardLayoutPreferences): void {
  Storage.set(DASHBOARD_LAYOUT_KEY, layout);
}

interface DashboardCustomizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  layout: DashboardLayoutPreferences;
  onSave: (layout: DashboardLayoutPreferences) => void;
}

const SECTION_DESCRIPTIONS: Record<
  keyof DashboardLayoutPreferences["visibleSections"],
  { title: string; desc: string; icon: IconName }
> = {
  todayTimeline: {
    title: "Today's Timeline",
    desc: "Your study blocks placed around your real lectures, shifts and commitments",
    icon: "calendar",
  },
  activityRings: {
    title: "Daily Activity Rings",
    desc: "Apple-style 3-ring focus, flashcards, and task goal visualizer",
    icon: "target",
  },
  recentNotebooks: {
    title: "Recent Notebooks Shelf",
    desc: "Quick access to your active study notebooks and grounded research",
    icon: "folder",
  },
  priorities: {
    title: "Priorities Region",
    desc: "Upcoming countdowns, overdue/today tasks, and daily drill",
    icon: "flame",
  },
  continueStudying: {
    title: "Continue Studying & Focus",
    desc: "Resume last viewed material and quick Pomodoro focus runner",
    icon: "clock",
  },
  progressStreak: {
    title: "Progress, Streak & Memory Decay",
    desc: "Study streak calendar, focus sparklines, and forgetting curve health",
    icon: "activity",
  },
  sessionsCommunity: {
    title: "Sessions & Community",
    desc: "Past focus session logs, Study Circles, and AI Action Tools",
    icon: "users",
  },
};

export function DashboardCustomizeModal({
  isOpen,
  onClose,
  layout,
  onSave,
}: DashboardCustomizeModalProps) {
  const [localState, setLocalState] =
    useState<DashboardLayoutPreferences>(layout);

  useEffect(() => {
    setLocalState(layout);
  }, [layout, isOpen]);

  const toggleSection = (
    key: keyof DashboardLayoutPreferences["visibleSections"],
  ) => {
    setLocalState((prev) => ({
      ...prev,
      visibleSections: {
        ...prev.visibleSections,
        [key]: !prev.visibleSections[key],
      },
    }));
  };

  const handleReset = () => {
    setLocalState(DEFAULT_DASHBOARD_LAYOUT);
  };

  const handleSave = () => {
    onSave(localState);
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Customize Dashboard"
      subtitle="Choose which sections and study widgets appear on your home workspace."
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          margin: "16px 0",
        }}
      >
        {(
          Object.keys(SECTION_DESCRIPTIONS) as Array<
            keyof DashboardLayoutPreferences["visibleSections"]
          >
        ).map((key) => {
          const info = SECTION_DESCRIPTIONS[key];
          const isVisible = localState.visibleSections[key];
          return (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: "var(--r-md, 10px)",
                background: isVisible
                  ? "var(--surface-2, rgba(255, 255, 255, 0.05))"
                  : "var(--surface-1, rgba(255, 255, 255, 0.02))",
                border:
                  "1px solid var(--glass-border-subtle, rgba(255, 255, 255, 0.08))",
                opacity: isVisible ? 1 : 0.6,
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: isVisible
                      ? "var(--primary-subtle, rgba(59, 130, 246, 0.15))"
                      : "var(--surface-3, rgba(255, 255, 255, 0.1))",
                    color: isVisible ? "var(--primary)" : "var(--text-muted)",
                  }}
                >
                  <Icon name={info.icon} size={16} />
                </span>
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                    {info.title}
                  </h4>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    {info.desc}
                  </p>
                </div>
              </div>
              <Button
                variant={isVisible ? "primary" : "secondary"}
                size="sm"
                onClick={() => toggleSection(key)}
              >
                {isVisible ? "Visible" : "Hidden"}
              </Button>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 24,
        }}
      >
        <Button variant="ghost" size="sm" onClick={handleReset}>
          Reset Defaults
        </Button>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            Save Layout
          </Button>
        </div>
      </div>
    </Modal>
  );
}
