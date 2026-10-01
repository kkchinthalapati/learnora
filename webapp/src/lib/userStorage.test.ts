import { beforeEach, describe, expect, it } from "vitest";
import {
  claimLocalStorageFor,
  clearUserLocalData,
  STORAGE_OWNER_KEY,
} from "./userStorage";

describe("claimLocalStorageFor", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("clears the previous student's data when a different account signs in", () => {
    localStorage.setItem(STORAGE_OWNER_KEY, "user-a");
    localStorage.setItem("learnora:study_continuity_snapshot", "{}");
    localStorage.setItem("learnora_quiz_draft_q1", "{}");
    localStorage.setItem("learnora:offline_queue", "[]");
    localStorage.setItem("fav_times", "[]");
    sessionStorage.setItem("learnora_onboarding_draft:user-a", "{}");

    expect(claimLocalStorageFor("user-b")).toBe(true);

    expect(localStorage.getItem("learnora:study_continuity_snapshot")).toBeNull();
    expect(localStorage.getItem("learnora_quiz_draft_q1")).toBeNull();
    expect(localStorage.getItem("learnora:offline_queue")).toBeNull();
    expect(localStorage.getItem("fav_times")).toBeNull();
    expect(sessionStorage.getItem("learnora_onboarding_draft:user-a")).toBeNull();
    expect(localStorage.getItem(STORAGE_OWNER_KEY)).toBe("user-b");
  });

  it("keeps everything when the same student signs back in", () => {
    localStorage.setItem(STORAGE_OWNER_KEY, "user-a");
    localStorage.setItem("learnora:offline_queue", "[1]");

    expect(claimLocalStorageFor("user-a")).toBe(false);
    expect(localStorage.getItem("learnora:offline_queue")).toBe("[1]");
  });

  /* Data written before the owner marker existed cannot be attributed; it is
     far more likely the same student's than a stranger's. */
  it("claims an unowned browser without clearing it", () => {
    localStorage.setItem("learnora_quiz_draft_q1", "{}");

    expect(claimLocalStorageFor("user-a")).toBe(false);
    expect(localStorage.getItem("learnora_quiz_draft_q1")).toBe("{}");
    expect(localStorage.getItem(STORAGE_OWNER_KEY)).toBe("user-a");
  });
});

describe("clearUserLocalData", () => {
  beforeEach(() => localStorage.clear());

  it("keeps device keys, auth tokens and guest sessions awaiting import", () => {
    localStorage.setItem("learnora_sidebar_collapsed_sections", "[]");
    localStorage.setItem("sb-project-auth-token", "token");
    localStorage.setItem(
      "sessions",
      JSON.stringify([
        { id: 1, minutes: 25, guest: true, guestSessionId: "g1" },
        { id: 2, minutes: 30, guest: false },
      ]),
    );

    clearUserLocalData();

    expect(localStorage.getItem("learnora_sidebar_collapsed_sections")).toBe("[]");
    expect(localStorage.getItem("sb-project-auth-token")).toBe("token");
    expect(JSON.parse(localStorage.getItem("sessions") ?? "[]")).toEqual([
      { id: 1, minutes: 25, guest: true, guestSessionId: "g1" },
    ]);
  });

  it("drops the sessions key when none of it was a guest's", () => {
    localStorage.setItem("sessions", JSON.stringify([{ id: 2, minutes: 30 }]));
    clearUserLocalData();
    expect(localStorage.getItem("sessions")).toBeNull();
  });
});
