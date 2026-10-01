import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_SESSIONS_KEY,
  MAX_LOCAL_SESSIONS,
  SESSION_LOGGED_EVENT,
  appendLocalSession,
  readLocalSessions,
} from "./localSessions";

const entry = (
  over: Partial<Parameters<typeof appendLocalSession>[0]> = {},
) => ({
  minutes: 25,
  task: "General Study",
  folderId: null,
  timerType: "pomodoro",
  isGuest: false,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
});

describe("readLocalSessions", () => {
  it("is empty with nothing stored", () => {
    expect(readLocalSessions()).toEqual([]);
  });

  it("degrades to empty rather than throwing on malformed content", () => {
    localStorage.setItem(LOCAL_SESSIONS_KEY, "{not json");
    expect(readLocalSessions()).toEqual([]);
  });

  it("degrades to empty when the stored value is not an array", () => {
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify({ nope: true }));
    expect(readLocalSessions()).toEqual([]);
  });
});

describe("appendLocalSession", () => {
  it("keeps a trimmed coverage note in the local recovery copy", () => {
    appendLocalSession(entry({ notes: "  Equilibrium problems 1-12  " }));
    expect(readLocalSessions()[0].notes).toBe("Equilibrium problems 1-12");
  });

  it("writes to the key the vanilla app and the dashboard both read", () => {
    appendLocalSession(entry());
    expect(LOCAL_SESSIONS_KEY).toBe("sessions");
    expect(readLocalSessions()).toHaveLength(1);
  });

  it("puts the newest session first", () => {
    appendLocalSession(entry({ task: "older" }));
    appendLocalSession(entry({ task: "newer" }));
    expect(readLocalSessions().map((s) => s.task)).toEqual(["newer", "older"]);
  });

  it("derives startedAt by winding back the logged minutes", () => {
    appendLocalSession(entry({ minutes: 10 }));
    const [session] = readLocalSessions();
    const startedAt = new Date(session.startedAt!).getTime();
    expect(session.id - startedAt).toBe(10 * 60_000);
  });

  it("records the timer type so review and quiz sessions stay distinguishable", () => {
    appendLocalSession(
      entry({ timerType: "review", task: "Organic Chemistry" }),
    );
    const [session] = readLocalSessions();
    expect(session.timerType).toBe("review");
    expect(session.task).toBe("Organic Chemistry");
  });

  it("stamps a guest session with an id so signup migration can dedupe it", () => {
    appendLocalSession(entry({ isGuest: true }));
    const [session] = readLocalSessions();
    expect(session.guest).toBe(true);
    expect(typeof session.guestSessionId).toBe("string");
  });

  it("leaves the guest fields off an authenticated session", () => {
    appendLocalSession(entry({ isGuest: false }));
    const [session] = readLocalSessions();
    expect(session.guest).toBe(false);
    expect(session.guestSessionId).toBeUndefined();
  });

  it("caps the stored history, dropping the oldest", () => {
    for (let i = 0; i < MAX_LOCAL_SESSIONS + 5; i++) {
      appendLocalSession(entry({ task: `s${i}` }));
    }
    const stored = readLocalSessions();
    expect(stored).toHaveLength(MAX_LOCAL_SESSIONS);
    expect(stored[0].task).toBe(`s${MAX_LOCAL_SESSIONS + 4}`);
  });

  it("dispatches the event the dashboard listens on, after the write lands", () => {
    const seen: number[] = [];
    const listener = vi.fn(() => seen.push(readLocalSessions().length));
    window.addEventListener(SESSION_LOGGED_EVENT, listener);

    appendLocalSession(entry());

    expect(listener).toHaveBeenCalledTimes(1);
    // A listener that re-reads storage must see the new session already there.
    expect(seen).toEqual([1]);
    window.removeEventListener(SESSION_LOGGED_EVENT, listener);
  });
});
