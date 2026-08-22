import { useState, useEffect } from "react";
import type { StudyParticipant } from "./types";
import { Icon } from "../../components/Icon";
import styles from "./room.module.css";

export interface StudyDeskCardProps {
  participant: StudyParticipant;
  isSelf: boolean;
  onCheer: (emoji: string) => void;
  onSync?: () => void;
}

const CHEER_EMOJIS = [
  { emoji: "🔥", label: "Fire / Keep going" },
  { emoji: "👏", label: "Clap / Great job" },
  { emoji: "☕", label: "Coffee / Take a breather" },
  { emoji: "🧠", label: "Brain / Big brain focus" },
  { emoji: "💪", label: "Flex / Strong work" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

function formatTimerDigits(totalSeconds: number): string {
  const nonNegative = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(nonNegative / 3600);
  const minutes = Math.floor((nonNegative % 3600) / 60);
  const seconds = nonNegative % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function StudyDeskCard({
  participant,
  isSelf,
  onCheer,
  onSync,
}: StudyDeskCardProps) {
  const [poppingEmoji, setPoppingEmoji] = useState<string | null>(null);

  const participantName =
    participant.fullName?.trim() ||
    participant.name?.trim() ||
    "Learnora Student";

  const rawStatus = (
    participant.timerStatus ||
    participant.status ||
    "idle"
  ).toLowerCase();

  const isFocusing = rawStatus === "focus" || rawStatus === "focusing";
  const isFlow = rawStatus === "flow";
  const isBreak =
    rawStatus === "break" ||
    rawStatus === "short_break" ||
    rawStatus === "long_break";
  const isPaused = rawStatus === "paused";

  // Live timer tick calculation
  const initialSeconds =
    isFlow || participant.timerType === "stopwatch"
      ? (participant.elapsedSeconds ?? participant.elapsed ?? 0)
      : (participant.timeLeft ?? 1500);

  const [liveSeconds, setLiveSeconds] = useState<number>(initialSeconds);

  useEffect(() => {
    const computeCurrentTime = () => {
      const now = Date.now();
      if (isFlow || participant.timerType === "stopwatch") {
        if (participant.startedAt && participant.isRunning !== false) {
          const startTime =
            typeof participant.startedAt === "string"
              ? new Date(participant.startedAt).getTime()
              : participant.startedAt;
          const elapsedSec = Math.max(0, Math.floor((now - startTime) / 1000));
          return (
            (participant.elapsedSeconds ?? participant.elapsed ?? 0) +
            elapsedSec
          );
        }
        return participant.elapsedSeconds ?? participant.elapsed ?? 0;
      } else {
        // Countdown / Pomodoro / Break
        if (participant.targetEndTime && participant.isRunning !== false) {
          const remainingSec = Math.max(
            0,
            Math.ceil((participant.targetEndTime - now) / 1000),
          );
          return remainingSec;
        }
        return participant.timeLeft ?? 1500;
      }
    };

    setLiveSeconds(computeCurrentTime());

    if (participant.isRunning === false || isPaused) {
      return;
    }

    const interval = setInterval(() => {
      setLiveSeconds(computeCurrentTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [
    isFlow,
    isPaused,
    participant.timerType,
    participant.targetEndTime,
    participant.startedAt,
    participant.isRunning,
    participant.timeLeft,
    participant.elapsed,
    participant.elapsedSeconds,
  ]);

  const handleCheerClick = (emoji: string) => {
    setPoppingEmoji(emoji);
    onCheer(emoji);
    setTimeout(() => {
      setPoppingEmoji(null);
    }, 400);
  };

  const pulseClass = isFocusing
    ? styles.pulseFocus
    : isBreak
      ? styles.pulseBreak
      : isFlow
        ? styles.pulseFlow
        : styles.pulseIdle;

  const statusPillClass = isFocusing
    ? styles.statusPillFocus
    : isBreak
      ? styles.statusPillBreak
      : isFlow
        ? styles.statusPillFlow
        : styles.statusPillIdle;

  const statusLabel = isFocusing
    ? "Focusing"
    : isFlow
      ? "In Flow"
      : isBreak
        ? "Break"
        : isPaused
          ? "Paused"
          : "Idle";

  const cardClasses = [styles.deskCard, isSelf ? styles.deskCardSelf : null]
    .filter(Boolean)
    .join(" ");

  const timerModeDisplay = isFlow
    ? "Flowtime"
    : isBreak
      ? "Resting"
      : participant.timerType === "stopwatch"
        ? "Stopwatch"
        : "Focus Session";

  const taskText =
    participant.currentTask?.trim() ||
    participant.task?.trim() ||
    "Deep Focus Session";

  const subjectName =
    participant.activeSubject?.trim() || participant.subject?.trim();

  return (
    <article
      className={cardClasses}
      aria-label={`${participantName}'s study desk`}
    >
      {/* Desk Header: Avatar, Name, Status Pill */}
      <div className={styles.deskHeader}>
        <div className={styles.deskIdentity}>
          <div className={styles.deskAvatarWrapper}>
            <div className={styles.deskAvatar}>
              {participant.avatarUrl ? (
                <img
                  src={participant.avatarUrl}
                  alt={`${participantName}'s avatar`}
                />
              ) : (
                <span>{getInitials(participantName)}</span>
              )}
            </div>
            <div className={styles.statusBadgeWrapper}>
              <div
                className={`${styles.statusIndicatorDot} ${pulseClass}`}
                title={`Status: ${statusLabel}`}
                aria-label={`Status: ${statusLabel}`}
              />
            </div>
          </div>

          <div className={styles.deskNameCol}>
            <div className={styles.deskName}>
              <span className={styles.deskNameText}>{participantName}</span>
              {isSelf && <span className={styles.youBadge}>(You)</span>}
            </div>
            {typeof participant.streak === "number" &&
              participant.streak > 0 && (
                <span className={styles.streakPill}>
                  🔥 {participant.streak} day
                  {participant.streak === 1 ? "" : "s"}
                </span>
              )}
          </div>
        </div>

        <span className={`${styles.statusPill} ${statusPillClass}`}>
          {statusLabel}
        </span>
      </div>

      {/* Timer Section */}
      <div className={styles.deskTimer} aria-live="off">
        <span className={styles.timerDigits}>
          {formatTimerDigits(liveSeconds)}
        </span>
        <span className={styles.timerModeLabel}>{timerModeDisplay}</span>
      </div>

      {/* Task & Subject Section */}
      <div className={styles.deskTask}>
        <div className={styles.taskTitleRow}>
          <Icon name="clock" size={14} className={styles.taskIcon} />
          <p className={styles.taskText} title={taskText}>
            {taskText}
          </p>
        </div>
        {subjectName && (
          <div className={styles.subjectBadge}>
            <span
              className={styles.subjectDot}
              style={
                participant.subjectColor
                  ? { background: participant.subjectColor }
                  : undefined
              }
            />
            <span>{subjectName}</span>
          </div>
        )}
      </div>

      {/* Desk Actions: Cheers & Sync Button */}
      <div className={styles.deskActions}>
        <div
          className={styles.cheerBar}
          role="toolbar"
          aria-label={`Send cheer to ${participantName}`}
        >
          {CHEER_EMOJIS.map(({ emoji, label }) => {
            const isPopping = poppingEmoji === emoji;
            return (
              <button
                key={emoji}
                type="button"
                className={`${styles.cheerBtn} ${isPopping ? styles.cheerBtnPopping : ""}`}
                onClick={() => handleCheerClick(emoji)}
                aria-label={`Send ${label} to ${participantName}`}
                title={label}
              >
                {emoji}
              </button>
            );
          })}
        </div>

        {!isSelf && onSync && (isFocusing || isFlow) && (
          <button
            type="button"
            className={styles.syncBtn}
            onClick={onSync}
            aria-label={`Sync timer with ${participantName}`}
            title="Match your study timer with this student"
          >
            <Icon name="clock" size={14} />
            <span>Sync</span>
          </button>
        )}
      </div>
    </article>
  );
}
