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
  /** Set only on the presence entry of whoever is hosting a group Pomodoro;
   *  null/absent otherwise. */
  groupTimer?: GroupTimerSyncPayload | null;
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

export type GroupTimerMode = "focus" | "short_break" | "long_break";

/** The host's shared Pomodoro cycle, as opposed to TimerSyncPayload's
 *  one-shot "I started a timer, want to join?" broadcast. Carried in the
 *  host's own presence payload (so a late joiner gets it for free from
 *  presence sync) and also broadcast on every change for low-latency
 *  updates to peers already in the room. */
export interface GroupTimerSyncPayload {
  hostUserId: string;
  hostName: string;
  mode: GroupTimerMode;
  durationMinutes: number;
  /** Countdown target while running; null while paused. */
  endsAtEpochMs: number | null;
  /** Remaining time frozen at the moment of pause. Authoritative only while
   *  isRunning is false — ignored while running, where endsAtEpochMs drives
   *  the countdown instead. */
  pausedRemainingMs: number | null;
  isRunning: boolean;
  cycleIndex: number;
}

export interface RoomMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  type?: "chat" | "system";
}

/* =========================================================================
   UNTRUSTED PEER INPUT

   Everything a room hands its participants — presence entries, chat,
   reactions, timer syncs — arrives over a Supabase Realtime channel that any
   signed-in user can join and send on. Broadcast payloads are relayed
   verbatim and are not signed, so a peer chooses every byte of them; the
   receiving code was casting them straight to their interfaces (`payload as
   RoomMessage`), which is an assertion about a value nobody checked.

   Two things went wrong with that. A non-string `text` reaches JSX as-is and
   React throws "Objects are not valid as a React child", taking the whole
   room down for everyone in it; and the chat list grew without a bound, so a
   peer looping `send()` could push every other tab into swap. The helpers
   below are the boundary: shape-check, coerce, clamp, and drop anything that
   cannot be made sense of.

   What they deliberately do *not* do is authenticate the sender. `userId`
   and `userName` are self-asserted, and no client-side check can make them
   otherwise — a peer can always claim someone else's name. Fixing that needs
   the server to stamp identity on the message; until then the room is
   "anyone here can say they are anyone", which is worth knowing before it is
   used for anything but encouragement between friends.
   ========================================================================= */

/** Longest chat message kept. Matches the composer's own `maxLength`. */
export const MAX_MESSAGE_LENGTH = 500;
/** Longest display name rendered beside a message or on a desk card. */
export const MAX_NAME_LENGTH = 60;
/** How many chat messages a room retains. Oldest are dropped past this. */
export const MAX_ROOM_MESSAGES = 200;

/** How many people one study room holds, the host included.
 *
 *  A room had no ceiling at all, and its invite link is a plain URL — one
 *  posted in a class group chat or on a forum admits everyone who clicks it.
 *  That is not only a crowded screen: presence is O(n²) chatter, every
 *  participant re-rendering a desk card for every other, so a room that grows
 *  without limit degrades for the people who were studying in it first.
 *
 *  Twelve is a study group, not a lecture hall. It is above any real
 *  friend-group session and well below the point where the desk grid stops
 *  being readable or presence traffic becomes the reason a laptop fan spins
 *  up. */
export const MAX_ROOM_PARTICIPANTS = 12;

function asString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  /* Sliced before trimming so a megabyte of whitespace is bounded too. */
  return value.slice(0, max).trim();
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* `crypto.randomUUID` is only defined in a secure context, so it is absent
 * over plain http — the same guard the room's own id generation already
 * uses. Uniqueness is all that is wanted here (these ids only de-duplicate a
 * list), not unpredictability. */
function localId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Normalises an inbound chat broadcast, or returns null to drop it. */
export function sanitizeRoomMessage(payload: unknown): RoomMessage | null {
  if (!isRecord(payload)) return null;

  const text = asString(payload.text, MAX_MESSAGE_LENGTH);
  if (!text) return null;

  /* A peer that omits `id` (or sends a non-string one) would otherwise
     collide with every other such message under the de-duplication check,
     so an id is minted here rather than trusted. */
  const id = asString(payload.id, 120) || localId("peer");

  return {
    id,
    userId: asString(payload.userId, 64),
    userName: asString(payload.userName, MAX_NAME_LENGTH) || "Student",
    text,
    timestamp: asFiniteNumber(payload.timestamp, Date.now()),
    type: payload.type === "system" ? "system" : "chat",
  };
}

/** Normalises an inbound reaction broadcast, or returns null to drop it. */
export function sanitizeRoomReaction(payload: unknown): RoomReaction | null {
  if (!isRecord(payload)) return null;

  /* Emoji are a handful of code points; the cap is generous enough for a
     flag or a skin-tone sequence and mean enough to keep a wall of text out
     of the floating-reaction overlay. */
  const emoji = asString(payload.emoji, 16);
  if (!emoji) return null;

  const senderName = asString(payload.senderName, MAX_NAME_LENGTH);
  const recipientId = asString(payload.recipientId, 64);

  return {
    id: asString(payload.id, 120) || localId("peer"),
    emoji,
    timestamp: asFiniteNumber(payload.timestamp, Date.now()),
    senderId: asString(payload.senderId, 64),
    senderName: senderName || "Someone",
    recipientId: recipientId || null,
    message: asString(payload.message, MAX_MESSAGE_LENGTH),
    fromName: senderName || "Someone",
    userName: senderName || "Someone",
  };
}

/** Bounds on a peer-proposed timer, so "sync with them" can't be handed a
 *  NaN or a thousand-hour session. One minute to a full day. */
export const MIN_SYNC_MINUTES = 1;
export const MAX_SYNC_MINUTES = 1440;

/** Normalises an inbound timer-sync broadcast, or returns null to drop it. */
export function sanitizeTimerSync(payload: unknown): TimerSyncPayload | null {
  if (!isRecord(payload)) return null;

  const senderId = asString(payload.senderId, 64);
  if (!senderId) return null;

  const rawMinutes = asFiniteNumber(payload.targetMinutes, NaN);
  if (!Number.isFinite(rawMinutes)) return null;
  const targetMinutes = Math.min(
    MAX_SYNC_MINUTES,
    Math.max(MIN_SYNC_MINUTES, Math.round(rawMinutes)),
  );

  const mode = payload.mode;
  return {
    senderId,
    senderName: asString(payload.senderName, MAX_NAME_LENGTH) || "Someone",
    targetMinutes,
    mode: mode === "Break" || mode === "Flow" ? mode : "Focus",
    targetEndTime:
      typeof payload.targetEndTime === "number" &&
      Number.isFinite(payload.targetEndTime)
        ? payload.targetEndTime
        : null,
  };
}

/** Bounds on a hosted group timer's block length. One minute to three
 *  hours — long enough for a deep-work block, short enough that a stray
 *  value can't leave a banner counting down for a week. */
export const MIN_GROUP_TIMER_MINUTES = 1;
export const MAX_GROUP_TIMER_MINUTES = 180;

/** Normalises a group-timer payload (carried on a host's presence entry, and
 *  broadcast on every change), or returns null to drop it. */
export function sanitizeGroupTimer(payload: unknown): GroupTimerSyncPayload | null {
  if (!isRecord(payload)) return null;

  const hostUserId = asString(payload.hostUserId, 64);
  if (!hostUserId) return null;

  const rawDuration = asFiniteNumber(payload.durationMinutes, NaN);
  if (!Number.isFinite(rawDuration)) return null;
  const durationMinutes = Math.min(
    MAX_GROUP_TIMER_MINUTES,
    Math.max(MIN_GROUP_TIMER_MINUTES, Math.round(rawDuration)),
  );

  const mode: GroupTimerMode =
    payload.mode === "short_break" || payload.mode === "long_break"
      ? payload.mode
      : "focus";

  const endsAtEpochMs =
    typeof payload.endsAtEpochMs === "number" &&
    Number.isFinite(payload.endsAtEpochMs)
      ? payload.endsAtEpochMs
      : null;

  const pausedRemainingMs =
    typeof payload.pausedRemainingMs === "number" &&
    Number.isFinite(payload.pausedRemainingMs)
      ? Math.max(0, payload.pausedRemainingMs)
      : null;

  const cycleIndex = Math.max(
    0,
    Math.round(asFiniteNumber(payload.cycleIndex, 0)),
  );

  return {
    hostUserId,
    hostName: asString(payload.hostName, MAX_NAME_LENGTH) || "Room Host",
    mode,
    durationMinutes,
    endsAtEpochMs,
    pausedRemainingMs,
    isRunning: payload.isRunning === true,
    cycleIndex,
  };
}

/** Clamps the free-text fields of a presence entry. Presence keys are set by
 *  the channel rather than the payload, so the identity here is already the
 *  peer's own — only the strings it renders need bounding. */
export function sanitizeParticipant(
  participant: StudyParticipant,
): StudyParticipant {
  const name = asString(
    participant.fullName ?? participant.name,
    MAX_NAME_LENGTH,
  );
  const task = asString(
    participant.currentTask ?? participant.task,
    MAX_MESSAGE_LENGTH,
  );
  const subject = asString(
    participant.activeSubject ?? participant.subject,
    MAX_NAME_LENGTH,
  );

  /* Only http(s) images are rendered. An avatar URL is peer-supplied and
     lands in an <img src>, where a `data:` or `javascript:` value has no
     business being. */
  const rawAvatar = asString(participant.avatarUrl, 2048);
  const avatarUrl = /^https?:\/\//i.test(rawAvatar) ? rawAvatar : null;

  return {
    ...participant,
    fullName: name,
    name,
    avatarUrl,
    currentTask: task,
    task,
    activeSubject: subject || null,
    subject: subject || null,
    groupTimer: sanitizeGroupTimer(participant.groupTimer),
  };
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
