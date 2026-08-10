import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useDialog } from "../../context/dialog";
import { useTimer } from "../../context/timer";
import { useSessionsSince } from "../../hooks/useSessions";
import { WORKFLOW_PRESETS } from "../../lib/timer";
import { formatFocusTime, localTotals, remoteTotals } from "./analytics";
import { useLocalSessions } from "./useLocalSessions";
import styles from "./dashboard.module.css";

const PRESETS = [
  { key: "light" as const, label: "20m" },
  { key: "cram" as const, label: "45m" },
  { key: "deep" as const, label: "90m" },
];

export function FocusCard() {
  const localSessions = useLocalSessions();
  const { data: remoteSessions, isSuccess } = useSessionsSince(90);
  const { state, startPreset } = useTimer();
  const { confirm } = useDialog();
  const navigate = useNavigate();

  const { total, today } =
    isSuccess && remoteSessions
      ? remoteTotals(remoteSessions)
      : localTotals(localSessions);

  async function startFocusPreset(key: keyof typeof WORKFLOW_PRESETS) {
    if (state.isRunning) {
      const ok = await confirm(
        "A timer is currently running. Start a new focus session and reset it now?",
        {
          title: "Timer running",
          confirmText: "Start new session",
          cancelText: "Keep running",
          danger: true,
        },
      );
      if (!ok) return;
    }
    startPreset(WORKFLOW_PRESETS[key]);
    void navigate("/timer");
  }

  return (
    <Card variant="elevated" className={styles.focusCard}>
      <span className={styles.eyebrow}>Focus</span>
      <h2 className={styles.statNumberLeft}>
        {formatFocusTime(total)} <span>total</span>
      </h2>
      <p className={styles.sub}>
        <strong>{formatFocusTime(today)}</strong> logged today
      </p>
      <div
        className={styles.focusPresets}
        role="group"
        aria-label="Quick-start a focus session"
      >
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={styles.focusPresetBtn}
            onClick={() => void startFocusPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Button
        variant="primary"
        className={styles.fullWidthBtn}
        onClick={() => void navigate("/timer")}
      >
        Start a focus session
      </Button>
    </Card>
  );
}
