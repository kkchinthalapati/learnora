import { describe, expect, it } from "vitest";
import {
  deriveTimerStatus,
  MAX_GROUP_TIMER_MINUTES,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SYNC_MINUTES,
  sanitizeGroupTimer,
  sanitizeParticipant,
  sanitizeRoomMessage,
  sanitizeRoomReaction,
  sanitizeTimerSync,
  formatDuration,
  formatParticipantTime,
  getParticipantInitials,
  getTimerStatusColor,
  getTimerStatusLabel,
  isParticipantActiveFocus,
  type StudyParticipant,
} from "./studyRoom";

describe("studyRoom helpers", () => {
  it("formats status labels accurately", () => {
    expect(getTimerStatusLabel("focus")).toBe("Focusing");
    expect(getTimerStatusLabel("short_break")).toBe("Short Break");
    expect(getTimerStatusLabel("long_break")).toBe("Long Break");
    expect(getTimerStatusLabel("flow")).toBe("In Flow");
    expect(getTimerStatusLabel("paused")).toBe("Paused");
    expect(getTimerStatusLabel("idle")).toBe("Idle");
  });

  it("returns color tokens for all timer statuses", () => {
    expect(getTimerStatusColor("focus")).toBe("#6366f1");
    expect(getTimerStatusColor("flow")).toBe("#8b5cf6");
    expect(getTimerStatusColor("short_break")).toBe("#10b981");
    expect(getTimerStatusColor("long_break")).toBe("#06b6d4");
    expect(getTimerStatusColor("paused")).toBe("#f59e0b");
    expect(getTimerStatusColor("idle")).toBe("#64748b");
  });

  it("checks if status is in active focus/flow", () => {
    expect(isParticipantActiveFocus("focus")).toBe(true);
    expect(isParticipantActiveFocus("flow")).toBe(true);
    expect(isParticipantActiveFocus("short_break")).toBe(false);
    expect(isParticipantActiveFocus("long_break")).toBe(false);
    expect(isParticipantActiveFocus("paused")).toBe(false);
    expect(isParticipantActiveFocus("idle")).toBe(false);
  });

  it("formats duration strings correctly", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(45)).toBe("00:45");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(1500)).toBe("25:00");
    expect(formatDuration(3665)).toBe("1:01:05");
  });

  it("formats participant time based on status", () => {
    const base: StudyParticipant = {
      userId: "u1",
      fullName: "Alex Rivera",
      avatarUrl: null,
      timerStatus: "idle",
      currentTask: "",
      activeSubject: null,
      targetEndTime: null,
      elapsedSeconds: 0,
      startedAt: null,
      joinedAt: 1000,
    };

    expect(formatParticipantTime(base)).toBe("—");

    const idleWithElapsed: StudyParticipant = {
      ...base,
      elapsedSeconds: 120,
    };
    expect(formatParticipantTime(idleWithElapsed)).toBe("02:00");

    const now = 1000000;
    const focusParticipant: StudyParticipant = {
      ...base,
      timerStatus: "focus",
      targetEndTime: now + 600000, // 10 minutes left
    };
    expect(formatParticipantTime(focusParticipant, now)).toBe("10:00");

    const flowParticipant: StudyParticipant = {
      ...base,
      timerStatus: "flow",
      elapsedSeconds: 300,
      startedAt: now - 60000, // 1 minute passed since start
    };
    expect(formatParticipantTime(flowParticipant, now)).toBe("06:00");
  });

  it("derives timer status from timer state accurately", () => {
    expect(
      deriveTimerStatus({
        isRunning: false,
        type: "pomodoro",
        mode: "Focus",
        timeLeft: 1500,
        totalTime: 1500,
        elapsed: 0,
      }),
    ).toBe("idle");

    expect(
      deriveTimerStatus({
        isRunning: false,
        type: "pomodoro",
        mode: "Focus",
        timeLeft: 1200,
        totalTime: 1500,
        elapsed: 0,
      }),
    ).toBe("paused");

    expect(
      deriveTimerStatus({
        isRunning: true,
        type: "pomodoro",
        mode: "Focus",
        timeLeft: 1200,
        totalTime: 1500,
        elapsed: 0,
      }),
    ).toBe("focus");

    expect(
      deriveTimerStatus({
        isRunning: true,
        type: "pomodoro",
        mode: "ShortBreak",
        timeLeft: 300,
        totalTime: 300,
        elapsed: 0,
      }),
    ).toBe("short_break");

    expect(
      deriveTimerStatus({
        isRunning: true,
        type: "pomodoro",
        mode: "LongBreak",
        timeLeft: 900,
        totalTime: 900,
        elapsed: 0,
      }),
    ).toBe("long_break");

    expect(
      deriveTimerStatus({
        isRunning: true,
        type: "flowtime",
        mode: "Focus",
        timeLeft: 0,
        totalTime: 0,
        elapsed: 100,
      }),
    ).toBe("flow");

    expect(
      deriveTimerStatus({
        isRunning: true,
        type: "flowtime",
        mode: "Break",
        timeLeft: 120,
        totalTime: 120,
        elapsed: 0,
      }),
    ).toBe("short_break");

    expect(
      deriveTimerStatus({
        isRunning: true,
        type: "stopwatch",
        mode: "Focus",
        timeLeft: 0,
        totalTime: 0,
        elapsed: 50,
      }),
    ).toBe("flow");

    expect(
      deriveTimerStatus({
        isRunning: true,
        type: "countdown",
        mode: "Focus",
        timeLeft: 900,
        totalTime: 900,
        elapsed: 0,
      }),
    ).toBe("focus");
  });

  it("extracts participant initials", () => {
    expect(getParticipantInitials("Jane Doe")).toBe("JD");
    expect(getParticipantInitials("Alice")).toBe("AL");
    expect(getParticipantInitials("John Michael Smith")).toBe("JS");
    expect(getParticipantInitials(null)).toBe("?");
    expect(getParticipantInitials("")).toBe("?");
  });
});

/* Every input below is something a peer can put on the wire: Realtime
   broadcast payloads are relayed verbatim and unsigned, so these are the
   values the room actually has to survive, not hypotheticals. */
describe("realtime payload sanitisers", () => {
  describe("sanitizeRoomMessage", () => {
    it("keeps a well-formed message", () => {
      const msg = sanitizeRoomMessage({
        id: "m1",
        userId: "u1",
        userName: "Ada",
        text: "hello",
        timestamp: 1000,
        type: "chat",
      });
      expect(msg).toMatchObject({
        id: "m1",
        userId: "u1",
        userName: "Ada",
        text: "hello",
        timestamp: 1000,
        type: "chat",
      });
    });

    it("drops a payload whose text is not a string", () => {
      // The crash case: an object reaching JSX throws "Objects are not valid
      // as a React child" and takes the whole room down.
      expect(sanitizeRoomMessage({ text: { toString: "nope" } })).toBeNull();
      expect(sanitizeRoomMessage({ text: 42 })).toBeNull();
      expect(sanitizeRoomMessage({ text: "   " })).toBeNull();
    });

    it("drops non-objects entirely", () => {
      expect(sanitizeRoomMessage(null)).toBeNull();
      expect(sanitizeRoomMessage("hello")).toBeNull();
      expect(sanitizeRoomMessage(["hello"])).toBeNull();
    });

    it("truncates an oversized message and name", () => {
      const msg = sanitizeRoomMessage({
        text: "x".repeat(10_000),
        userName: "y".repeat(500),
      });
      expect(msg?.text).toHaveLength(MAX_MESSAGE_LENGTH);
      expect(msg?.userName).toHaveLength(MAX_NAME_LENGTH);
    });

    it("mints an id when the peer omits one, so de-duplication still works", () => {
      const a = sanitizeRoomMessage({ text: "one" });
      const b = sanitizeRoomMessage({ text: "two" });
      expect(a?.id).toBeTruthy();
      expect(a?.id).not.toBe(b?.id);
    });

    it("normalises an unknown message type to chat", () => {
      expect(sanitizeRoomMessage({ text: "hi", type: "admin" })?.type).toBe(
        "chat",
      );
      expect(sanitizeRoomMessage({ text: "hi", type: "system" })?.type).toBe(
        "system",
      );
    });

    it("replaces a non-finite timestamp with a usable one", () => {
      const msg = sanitizeRoomMessage({ text: "hi", timestamp: NaN });
      expect(Number.isFinite(msg?.timestamp)).toBe(true);
    });
  });

  describe("sanitizeRoomReaction", () => {
    it("keeps a well-formed reaction", () => {
      expect(
        sanitizeRoomReaction({
          id: "r1",
          emoji: "🎉",
          senderId: "u1",
          senderName: "Ada",
          timestamp: 5,
        }),
      ).toMatchObject({ id: "r1", emoji: "🎉", senderName: "Ada" });
    });

    it("drops a reaction with no usable emoji", () => {
      expect(sanitizeRoomReaction({ emoji: "" })).toBeNull();
      expect(sanitizeRoomReaction({ emoji: 7 })).toBeNull();
      expect(sanitizeRoomReaction(undefined)).toBeNull();
    });

    it("caps an emoji field being used to smuggle a wall of text", () => {
      const r = sanitizeRoomReaction({ emoji: "a".repeat(1000) });
      expect(r?.emoji.length).toBeLessThanOrEqual(16);
    });

    it("normalises a missing recipient to a room-wide null", () => {
      expect(sanitizeRoomReaction({ emoji: "👍" })?.recipientId).toBeNull();
    });
  });

  describe("sanitizeTimerSync", () => {
    it("keeps a well-formed sync", () => {
      expect(
        sanitizeTimerSync({
          senderId: "u1",
          senderName: "Ada",
          targetMinutes: 25,
          mode: "Focus",
          targetEndTime: 123,
        }),
      ).toEqual({
        senderId: "u1",
        senderName: "Ada",
        targetMinutes: 25,
        mode: "Focus",
        targetEndTime: 123,
      });
    });

    it("clamps an absurd duration instead of writing it to the timer", () => {
      expect(
        sanitizeTimerSync({ senderId: "u1", targetMinutes: 99_999_999 })
          ?.targetMinutes,
      ).toBe(MAX_SYNC_MINUTES);
      expect(
        sanitizeTimerSync({ senderId: "u1", targetMinutes: -5 })?.targetMinutes,
      ).toBe(1);
    });

    it("drops a sync with no sender or an unusable duration", () => {
      expect(sanitizeTimerSync({ targetMinutes: 25 })).toBeNull();
      expect(sanitizeTimerSync({ senderId: "u1" })).toBeNull();
      expect(
        sanitizeTimerSync({ senderId: "u1", targetMinutes: NaN }),
      ).toBeNull();
    });

    it("falls back to Focus for an unrecognised mode", () => {
      expect(
        sanitizeTimerSync({ senderId: "u1", targetMinutes: 5, mode: "Party" })
          ?.mode,
      ).toBe("Focus");
    });
  });

  describe("sanitizeGroupTimer", () => {
    it("keeps a well-formed running group timer", () => {
      expect(
        sanitizeGroupTimer({
          hostUserId: "u1",
          hostName: "Ada",
          mode: "focus",
          durationMinutes: 25,
          endsAtEpochMs: 123456,
          pausedRemainingMs: null,
          isRunning: true,
          cycleIndex: 2,
        }),
      ).toEqual({
        hostUserId: "u1",
        hostName: "Ada",
        mode: "focus",
        durationMinutes: 25,
        endsAtEpochMs: 123456,
        pausedRemainingMs: null,
        isRunning: true,
        cycleIndex: 2,
      });
    });

    it("keeps a paused group timer's frozen remainder", () => {
      const gt = sanitizeGroupTimer({
        hostUserId: "u1",
        durationMinutes: 25,
        endsAtEpochMs: null,
        pausedRemainingMs: 90_000,
        isRunning: false,
      });
      expect(gt?.isRunning).toBe(false);
      expect(gt?.pausedRemainingMs).toBe(90_000);
      expect(gt?.endsAtEpochMs).toBeNull();
    });

    it("drops a payload with no host or an unusable duration", () => {
      expect(sanitizeGroupTimer({ durationMinutes: 25 })).toBeNull();
      expect(sanitizeGroupTimer({ hostUserId: "u1" })).toBeNull();
      expect(
        sanitizeGroupTimer({ hostUserId: "u1", durationMinutes: NaN }),
      ).toBeNull();
    });

    it("clamps an absurd block length instead of writing it to the banner", () => {
      expect(
        sanitizeGroupTimer({ hostUserId: "u1", durationMinutes: 99_999 })
          ?.durationMinutes,
      ).toBe(MAX_GROUP_TIMER_MINUTES);
      expect(
        sanitizeGroupTimer({ hostUserId: "u1", durationMinutes: -5 })
          ?.durationMinutes,
      ).toBe(1);
    });

    it("falls back to focus mode and a default host name", () => {
      const gt = sanitizeGroupTimer({
        hostUserId: "u1",
        durationMinutes: 25,
        mode: "party_mode",
      });
      expect(gt?.mode).toBe("focus");
      expect(gt?.hostName).toBe("Room Host");
    });

    it("drops non-objects entirely", () => {
      expect(sanitizeGroupTimer(null)).toBeNull();
      expect(sanitizeGroupTimer("hello")).toBeNull();
    });
  });

  describe("sanitizeParticipant", () => {
    it("bounds the names and tasks a peer advertises", () => {
      const p = sanitizeParticipant({
        userId: "u1",
        fullName: "n".repeat(500),
        currentTask: "t".repeat(5000),
      });
      expect(p.fullName).toHaveLength(MAX_NAME_LENGTH);
      expect(p.currentTask).toHaveLength(MAX_MESSAGE_LENGTH);
    });

    it("only lets an http(s) avatar through to the <img>", () => {
      expect(
        sanitizeParticipant({ avatarUrl: "https://cdn.example/a.png" })
          .avatarUrl,
      ).toBe("https://cdn.example/a.png");
      expect(
        sanitizeParticipant({ avatarUrl: "javascript:alert(1)" }).avatarUrl,
      ).toBeNull();
      expect(
        sanitizeParticipant({ avatarUrl: "data:image/svg+xml,<svg/>" })
          .avatarUrl,
      ).toBeNull();
    });

    it("keeps the fields it does not police", () => {
      expect(
        sanitizeParticipant({ userId: "u1", timerStatus: "focus" }).timerStatus,
      ).toBe("focus");
    });
  });
});
