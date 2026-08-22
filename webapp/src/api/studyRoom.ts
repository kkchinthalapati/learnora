/* Realtime Study Room types, helpers, and utilities.
 *
 * Provides shared interfaces for real-time presence tracking, reactions, and
 * group timer synchronization in Learnora study rooms. */

export type TimerStatus =
  | "focus"
  | "short_break"
  | "long_break"
  | "flow"
  | "paused"
  | "idle";

export interface StudyParticipant {
  userId?: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  timerStatus?: TimerStatus | string;
  currentTask?: string | null;
  activeSubject?: string | null;
  targetEndTime?: number | null;
  elapsedSeconds?: number;
  startedAt?: number | string | null;
  joinedAt?: number | string;
  /** UI compatibility aliases */
  id?: string;
  name?: string;
  status?: string;
  task?: string | null;
  subject?: string | null;
  timerType?: string;
  isRunning?: boolean;
  isSelf?: boolean;
  timeLeft?: number;
  elapsed?: number;
  totalTime?: number;
  streak?: number;
  subjectColor?: string | null;
}

export interface RoomReaction {
  id: string;
  emoji: string;
  timestamp: number;
  senderId?: string;
  senderName?: string;
  recipientId?: string | null; // null = broadcast to whole room
  message?: string;
  /** UI compatibility aliases */
  fromName?: string;
  userName?: string;
  toName?: string;
  participantId?: string;
}

export interface CheerNotification {
  id: string;
  emoji: string;
  fromName: string;
  toName: string;
  timestamp: number;
}

export interface TimerSyncPayload {
  senderId: string;
  senderName: string;
  targetMinutes: number;
  mode: "Focus" | "Break" | "Flow";
  targetEndTime: number | null;
}

export interface RoomMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  type?: "chat" | "system";
}

export interface CheerNotification {
  id: string;
  emoji: string;
  fromName: string;
  toName: string;
  timestamp: number;
}

export const TIMER_STATUS_LABELS: Record<TimerStatus, string> = {
  focus: "Focusing",
  short_break: "Short Break",
  long_break: "Long Break",
  flow: "In Flow",
  paused: "Paused",
  idle: "Idle",
};

/** Formats a timer status into a human-readable display label. */
export function getTimerStatusLabel(status: TimerStatus): string {
  return TIMER_STATUS_LABELS[status] ?? "Idle";
}

/** Semantic color tokens/hex for participant status badges. */
export function getTimerStatusColor(status: TimerStatus): string {
  switch (status) {
    case "focus":
      return "#6366f1"; // Primary indigo
    case "flow":
      return "#8b5cf6"; // Accent purple
    case "short_break":
      return "#10b981"; // Emerald green
    case "long_break":
      return "#06b6d4"; // Cyan
    case "paused":
      return "#f59e0b"; // Amber
    case "idle":
    default:
      return "#64748b"; // Slate muted
  }
}

/** Determines if a participant is currently in an active focus or flow state. */
export function isParticipantActiveFocus(status: TimerStatus): boolean {
  return status === "focus" || status === "flow";
}

/** Formats raw seconds into mm:ss or h:mm:ss string. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Calculates and formats remaining or elapsed time for a participant. */
export function formatParticipantTime(
  participant: StudyParticipant,
  now = Date.now(),
): string {
  const elapsed = participant.elapsedSeconds ?? participant.elapsed ?? 0;
  if (participant.timerStatus === "idle") {
    return elapsed > 0 ? formatDuration(elapsed) : "—";
  }

  // Count-down mode with active targetEndTime
  if (
    participant.targetEndTime != null &&
    (participant.timerStatus === "focus" ||
      participant.timerStatus === "short_break" ||
      participant.timerStatus === "long_break" ||
      participant.timerStatus === "paused")
  ) {
    const remaining = Math.max(
      0,
      Math.round((participant.targetEndTime - now) / 1000),
    );
    return formatDuration(remaining);
  }

  // Count-up / Flow mode
  if (participant.timerStatus === "flow") {
    const startedAtMs = participant.startedAt
      ? new Date(participant.startedAt).getTime()
      : 0;
    const liveElapsed = startedAtMs
      ? elapsed + Math.floor((now - startedAtMs) / 1000)
      : elapsed;
    return formatDuration(Math.max(0, liveElapsed));
  }

  return formatDuration(elapsed);
}

/** Translates Learnora internal timer state into a study room TimerStatus. */
export function deriveTimerStatus(state: {
  isRunning: boolean;
  type: string;
  mode: string;
  timeLeft: number;
  totalTime: number;
  elapsed: number;
}): TimerStatus {
  if (!state.isRunning) {
    const hasProgress =
      state.elapsed > 0 ||
      (state.timeLeft > 0 && state.timeLeft < state.totalTime);
    return hasProgress ? "paused" : "idle";
  }

  if (state.type === "flowtime") {
    return state.mode === "Break" ? "short_break" : "flow";
  }
  if (state.type === "stopwatch") {
    return "flow";
  }
  if (state.type === "countdown") {
    return "focus";
  }
  if (state.type === "pomodoro") {
    if (state.mode === "ShortBreak") return "short_break";
    if (state.mode === "LongBreak") return "long_break";
    return "focus";
  }

  return "focus";
}

/** Extracts initials from full name or fallback. */
export function getParticipantInitials(fullName: string | null): string {
  if (!fullName || !fullName.trim()) return "?";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
