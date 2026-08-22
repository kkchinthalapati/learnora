import { describe, expect, it } from "vitest";
import {
  deriveTimerStatus,
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
