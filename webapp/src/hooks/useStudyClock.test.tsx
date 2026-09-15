import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStudyClock } from "./useStudyClock";
import { readLocalSessions } from "../lib/localSessions";

const logMinutes = vi.fn();
let authSession: { user: { id: string } } | null = { user: { id: "u1" } };
let timerApi: unknown = null;

vi.mock("./useSessions", () => ({
  useLogSession: () => ({ mutate: logMinutes }),
}));
vi.mock("../context/auth", () => ({
  useAuth: () => ({ session: authSession }),
}));
vi.mock("../context/timer", () => ({
  useOptionalTimer: () => timerApi,
}));

const runningFocusTimer = {
  state: { isRunning: true, mode: "Focus" },
};
const runningBreakTimer = {
  state: { isRunning: true, mode: "ShortBreak" },
};

/** Drives Date.now() so marks land at chosen offsets without fake timers. */
let clock = 0;
const advance = (ms: number) => {
  clock += ms;
};

beforeEach(() => {
  localStorage.clear();
  logMinutes.mockClear();
  authSession = { user: { id: "u1" } };
  timerApi = null;
  clock = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const setup = (over: Partial<Parameters<typeof useStudyClock>[0]> = {}) =>
  renderHook(() =>
    useStudyClock({
      timerType: "review",
      task: "Organic Chemistry",
      folderId: "folder-1",
      ...over,
    }),
  );

describe("useStudyClock", () => {
  it("logs the credited minutes once the session commits", () => {
    const { result } = setup();

    act(() => result.current.mark());
    advance(4 * 60_000);
    act(() => result.current.mark());
    advance(60_000);
    act(() => result.current.mark());
    act(() => result.current.commit());

    // Two 1-2min-capped gaps: 2min + 1min.
    expect(logMinutes).toHaveBeenCalledTimes(1);
    expect(logMinutes.mock.calls[0][0]).toEqual({
      minutes: 3,
      task: "Organic Chemistry",
      folderId: "folder-1",
      timerType: "review",
    });
  });

  it("writes the local mirror as well as Supabase", () => {
    const { result } = setup();
    act(() => result.current.mark());
    advance(90_000);
    act(() => result.current.mark());
    act(() => result.current.commit());

    const [stored] = readLocalSessions();
    expect(stored.minutes).toBe(2);
    expect(stored.timerType).toBe("review");
    expect(stored.task).toBe("Organic Chemistry");
  });

  it("logs nothing at all when the session is under a minute", () => {
    const { result } = setup();
    act(() => result.current.mark());
    advance(10_000);
    act(() => result.current.mark());
    act(() => result.current.commit());

    expect(logMinutes).not.toHaveBeenCalled();
    expect(readLocalSessions()).toEqual([]);
  });

  it("commits at most once, however many times it is called", () => {
    const { result } = setup();
    act(() => result.current.mark());
    advance(90_000);
    act(() => result.current.mark());

    act(() => result.current.commit());
    act(() => result.current.commit());
    act(() => result.current.commit());

    expect(logMinutes).toHaveBeenCalledTimes(1);
    expect(readLocalSessions()).toHaveLength(1);
  });

  describe("when the focus timer is running", () => {
    it("suppresses the log rather than double-counting the same wall clock", () => {
      timerApi = runningFocusTimer;
      const { result } = setup();
      act(() => result.current.mark());
      advance(90_000);
      act(() => result.current.mark());
      act(() => result.current.commit());

      expect(logMinutes).not.toHaveBeenCalled();
      expect(readLocalSessions()).toEqual([]);
    });

    it("stays suppressed even if the timer is stopped before the commit", () => {
      timerApi = runningFocusTimer;
      const { result, rerender } = setup();
      act(() => result.current.mark());
      advance(90_000);

      // Student stops the timer mid-session; the minutes it already covered
      // must not be re-credited here.
      timerApi = null;
      rerender();

      act(() => result.current.mark());
      act(() => result.current.commit());

      expect(logMinutes).not.toHaveBeenCalled();
    });

    it("does not suppress while the timer is on a break", () => {
      timerApi = runningBreakTimer;
      const { result } = setup();
      act(() => result.current.mark());
      advance(90_000);
      act(() => result.current.mark());
      act(() => result.current.commit());

      expect(logMinutes).toHaveBeenCalledTimes(1);
    });
  });

  describe("for a guest", () => {
    it("keeps the session locally and skips the Supabase write", () => {
      authSession = null;
      const { result } = setup();
      act(() => result.current.mark());
      advance(90_000);
      act(() => result.current.mark());
      act(() => result.current.commit());

      expect(logMinutes).not.toHaveBeenCalled();
      const [stored] = readLocalSessions();
      expect(stored.minutes).toBe(2);
      // Stamped so signup migration can replay it exactly once.
      expect(stored.guest).toBe(true);
      expect(typeof stored.guestSessionId).toBe("string");
    });
  });

  describe("commit(durationsMs)", () => {
    it("credits pre-measured durations instead of the marks", () => {
      const { result } = setup({ timerType: "quiz" });
      // No mark() calls at all — the quiz runner already timed its questions.
      act(() => result.current.commit([60_000, 45_000, 30 * 60_000]));

      // The third question sat open for 30 minutes; capped to 2.
      expect(logMinutes.mock.calls[0][0].minutes).toBe(4);
      expect(logMinutes.mock.calls[0][0].timerType).toBe("quiz");
    });

    it("logs nothing when no question was ever answered", () => {
      const { result } = setup({ timerType: "quiz" });
      act(() => result.current.commit([]));
      expect(logMinutes).not.toHaveBeenCalled();
    });
  });

  it("swallows a failed Supabase write so a finished session never alarms", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = setup();
    act(() => result.current.mark());
    advance(90_000);
    act(() => result.current.mark());
    act(() => result.current.commit());

    const onError = logMinutes.mock.calls[0][1].onError;
    expect(() => onError(new Error("network down"))).not.toThrow();
    expect(warn).toHaveBeenCalled();
    // The local copy is still there to be migrated and re-read.
    expect(readLocalSessions()).toHaveLength(1);
  });
});
