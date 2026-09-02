import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  detectOfflineStudyBuddyChecks,
  useStudyBuddyChecks,
} from "./useStudyBuddyChecks";

describe("useStudyBuddyChecks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("detectOfflineStudyBuddyChecks heuristic engine", () => {
    it("returns empty array for short or empty notes", () => {
      expect(detectOfflineStudyBuddyChecks("")).toEqual([]);
      expect(detectOfflineStudyBuddyChecks("Short note")).toEqual([]);
    });

    it("detects contradictions like constant velocity with acceleration", () => {
      const note =
        "The satellite moves with constant velocity while accelerating towards earth.";
      const checks = detectOfflineStudyBuddyChecks(note);
      expect(checks.some((c) => c.type === "contradiction")).toBe(true);
      const contradiction = checks.find((c) => c.type === "contradiction");
      expect(contradiction?.friendlyMessage).toContain("constant velocity and acceleration");
      expect(contradiction?.suggestedFix).toBeTruthy();
    });

    it("detects logic jumps with 'therefore obviously'", () => {
      const note =
        "Given the set of real numbers S, therefore obviously the supremum must belong to S.";
      const checks = detectOfflineStudyBuddyChecks(note);
      expect(checks.some((c) => c.type === "logic_jump")).toBe(true);
      const jump = checks.find((c) => c.type === "logic_jump");
      expect(jump?.friendlyMessage).toContain("obviously");
    });

    it("detects muddy explanations with informal placeholder language", () => {
      const note =
        "When the temperature rises, stuff happens inside the cell and enzymes speed up.";
      const checks = detectOfflineStudyBuddyChecks(note);
      expect(checks.some((c) => c.type === "muddy_concept")).toBe(true);
      const muddy = checks.find((c) => c.type === "muddy_concept");
      expect(muddy?.friendlyMessage).toContain("informal or fuzzy");
    });

    it("detects exam trap risks like dividing by a variable without zero check", () => {
      const note =
        "To solve the algebraic expression, divide both sides by x to simplify.";
      const checks = detectOfflineStudyBuddyChecks(note);
      expect(checks.some((c) => c.type === "exam_trap_risk")).toBe(true);
      const trap = checks.find((c) => c.type === "exam_trap_risk");
      expect(trap?.trapId).toBe("edge-case-hazards");
      expect(trap?.friendlyMessage).toContain("cannot be zero");
    });

    it("detects lookalike term confusions between speed and velocity", () => {
      const note =
        "In this physics problem, speed is a vector quantity pointing due north.";
      const checks = detectOfflineStudyBuddyChecks(note);
      expect(checks.some((c) => c.title.includes("Speed vs Velocity"))).toBe(true);
    });
  });

  describe("hook debouncing and interactions", () => {
    it("debounces text changes before scanning", async () => {
      const note =
        "The body moves with constant velocity while accelerating towards earth.";
      const { result, rerender } = renderHook(
        ({ text }) => useStudyBuddyChecks(text, { debounceMs: 500 }),
        { initialProps: { text: "Initial short" } }
      );

      // Initially empty
      expect(result.current.checks).toEqual([]);

      // Update text
      rerender({ text: note });
      expect(result.current.checks).toEqual([]);

      // Fast-forward timer by 400ms (still before 500ms)
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(result.current.checks).toEqual([]);

      // Fast-forward past debounce threshold
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.checks.length).toBeGreaterThan(0);
      expect(result.current.checks[0].type).toBe("contradiction");
    });

    it("allows dismissing a check item", async () => {
      const note =
        "Given the set of real numbers S, therefore obviously the supremum must belong to S.";
      const { result } = renderHook(() =>
        useStudyBuddyChecks(note, { debounceMs: 100 })
      );

      await act(async () => {
        vi.advanceTimersByTime(150);
      });

      expect(result.current.checks.length).toBeGreaterThan(0);
      const targetId = result.current.checks[0].id;

      act(() => {
        result.current.dismissCheck(targetId);
      });

      expect(result.current.checks.find((c) => c.id === targetId)).toBeUndefined();
    });

    it("applies fix callback and dismisses check", async () => {
      const onApplyFix = vi.fn();
      const note =
        "When the temperature rises, stuff happens inside the cell and enzymes speed up.";
      const { result } = renderHook(() =>
        useStudyBuddyChecks(note, { debounceMs: 100, onApplyFix })
      );

      await act(async () => {
        vi.advanceTimersByTime(150);
      });

      expect(result.current.checks.length).toBeGreaterThan(0);
      const item = result.current.checks[0];

      act(() => {
        result.current.applyCheckFix(item);
      });

      expect(onApplyFix).toHaveBeenCalledWith(item);
      expect(result.current.checks.find((c) => c.id === item.id)).toBeUndefined();
    });
  });
});
