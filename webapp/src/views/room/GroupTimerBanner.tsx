import { useState, useEffect } from "react";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import type { GroupTimerSyncPayload } from "../../api/studyRoom";
import styles from "./groupTimerBanner.module.css";

export interface GroupTimerBannerProps {
  timerState: GroupTimerSyncPayload | null;
  isHost?: boolean;
  onStartGroupFocus: (minutes: number) => void;
  onPauseGroupTimer: () => void;
  onNextPhase: () => void;
  onSyncMyTimer: (minutes: number) => void;
}

export function GroupTimerBanner({
  timerState,
  isHost = false,
  onStartGroupFocus,
  onPauseGroupTimer,
  onNextPhase,
  onSyncMyTimer,
}: GroupTimerBannerProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);

  useEffect(() => {
    if (!timerState) {
      setSecondsRemaining(0);
      return;
    }

    /* Paused freezes the clock rather than zeroing it: pausedRemainingMs is
       the authoritative count while isRunning is false, set by the host's
       pause action at the moment they paused. */
    if (!timerState.isRunning) {
      setSecondsRemaining(
        Math.ceil(Math.max(0, timerState.pausedRemainingMs ?? 0) / 1000),
      );
      return;
    }

    const endsAt = timerState.endsAtEpochMs;
    if (!endsAt) {
      setSecondsRemaining(0);
      return;
    }

    const update = () => {
      const remainingMs = Math.max(0, endsAt - Date.now());
      setSecondsRemaining(Math.ceil(remainingMs / 1000));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timerState]);

  if (!timerState) {
    return (
      <div
        className={styles.banner}
        role="region"
        aria-label="Synchronized Group Pomodoro"
      >
        <div className={styles.leftSection}>
          <div className={styles.iconBadge}>
            <Icon name="users" size={20} />
          </div>
          <div className={styles.info}>
            <h3 className={styles.title}>Group Focus Mode</h3>
            <p className={styles.hostSubtitle}>
              Study together with synchronized Pomodoro sessions.
            </p>
          </div>
        </div>

        <div className={styles.rightControls}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onStartGroupFocus(25)}
          >
            <Icon name="play" size={14} />
            <span>Start 25m Group Pomodoro</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onStartGroupFocus(50)}
          >
            <span>50m Deep Block</span>
          </Button>
        </div>
      </div>
    );
  }

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const timeFormatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const isBreak =
    timerState.mode === "short_break" || timerState.mode === "long_break";
  const cycleText = timerState.cycleIndex
    ? ` · Block #${timerState.cycleIndex}`
    : "";

  return (
    <div
      className={styles.banner}
      role="region"
      aria-label="Synchronized Group Focus Session"
    >
      <div className={styles.leftSection}>
        <div className={styles.iconBadge}>
          <Icon name={isBreak ? "clock" : "flame"} size={20} />
        </div>
        <div className={styles.info}>
          <div className={styles.titleRow}>
            <h3 className={styles.title}>Group Focus Room</h3>
            <span
              className={`${styles.phaseBadge} ${
                isBreak ? styles.phaseBreak : styles.phaseFocus
              }`}
            >
              {isBreak ? "Break" : "Focus"}
              {cycleText}
            </span>
          </div>
          <p className={styles.hostSubtitle}>
            Hosted by {timerState.hostName || "Room Host"}
          </p>
        </div>
      </div>

      <div className={styles.centerTimer}>
        <span className={styles.digits}>{timeFormatted}</span>
        <span className={styles.statusText}>
          {timerState.isRunning ? "Remaining" : "Paused"}
        </span>
      </div>

      <div className={styles.rightControls}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            onSyncMyTimer(Math.max(1, Math.ceil(secondsRemaining / 60)))
          }
          title="Align your personal focus timer HUD with this room"
        >
          <Icon name="refresh-cw" size={14} />
          <span>Sync My HUD</span>
        </Button>

        {isHost && (
          <>
            <Button
              variant={timerState.isRunning ? "warning" : "primary"}
              size="sm"
              onClick={onPauseGroupTimer}
            >
              <Icon name={timerState.isRunning ? "pause" : "play"} size={14} />
              <span>{timerState.isRunning ? "Pause" : "Resume"}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onNextPhase}>
              <Icon name="play" size={14} />
              <span>{isBreak ? "Next Focus" : "Start Break"}</span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
