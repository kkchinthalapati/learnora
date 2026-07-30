import { describe, expect, it, vi } from "vitest";
import {
  executeActions,
  pathForNavigateTarget,
  MAX_TASKS_PER_REPLY,
  type ActionHandlers,
} from "./chatActions";
import type { ActionWidget, ReplyPart } from "../context/chat";

function handlers(overrides: Partial<ActionHandlers> = {}): ActionHandlers {
  return {
    confirm: vi.fn().mockResolvedValue(true),
    addTask: vi.fn().mockResolvedValue(undefined),
    startTimer: vi.fn(),
    setTheme: vi.fn().mockReturnValue(true),
    navigate: vi.fn().mockReturnValue(true),
    generateQuiz: vi.fn(),
    generatePlan: vi.fn(),
    ...overrides,
  };
}

const widgets = (parts: ReplyPart[]): ActionWidget[] =>
  parts.filter((p) => p.kind === "widget").map((p) => p.widget);

const text = (parts: ReplyPart[]): string =>
  parts
    .filter((p) => p.kind === "text")
    .map((p) => p.text)
    .join("");

describe("executeActions", () => {
  it("leaves a reply with no tags as one text part", async () => {
    const parts = await executeActions("Just an answer.", handlers());
    expect(parts).toEqual([{ kind: "text", text: "Just an answer." }]);
  });

  it("keeps the text either side of a tag, in order", async () => {
    const parts = await executeActions(
      "Done — <ADD_TASK>Read ch. 3</ADD_TASK> good luck!",
      handlers(),
    );
    expect(parts.map((p) => p.kind)).toEqual(["text", "widget", "text"]);
    expect(text(parts)).toBe("Done —  good luck!");
  });

  describe("ADD_TASK", () => {
    it("asks first, then creates the task", async () => {
      const h = handlers();
      const parts = await executeActions(
        "<ADD_TASK>Read chapter 3</ADD_TASK>",
        h,
      );

      expect(h.confirm).toHaveBeenCalledWith(
        expect.stringContaining("Read chapter 3"),
        expect.objectContaining({ title: "AI Task Creation" }),
      );
      expect(h.addTask).toHaveBeenCalledWith("Read chapter 3");
      expect(widgets(parts)[0]).toMatchObject({
        cancelled: false,
        subject: "Read chapter 3",
      });
    });

    it("creates nothing when the student declines, and says so", async () => {
      const h = handlers({ confirm: vi.fn().mockResolvedValue(false) });
      const parts = await executeActions("<ADD_TASK>Nope</ADD_TASK>", h);

      expect(h.addTask).not.toHaveBeenCalled();
      expect(widgets(parts)[0]).toMatchObject({
        cancelled: true,
        subject: "Nope",
      });
    });

    it("is the one tag that runs more than once in a reply", async () => {
      const h = handlers();
      await executeActions(
        "<ADD_TASK>one</ADD_TASK><ADD_TASK>two</ADD_TASK>",
        h,
      );
      expect(h.addTask).toHaveBeenCalledTimes(2);
    });

    /* A reply that tries to create fifty tasks is a malfunction, not a
       request. */
    it("stops after MAX_TASKS_PER_REPLY", async () => {
      const h = handlers();
      const reply = Array.from(
        { length: MAX_TASKS_PER_REPLY + 3 },
        (_, i) => `<ADD_TASK>task ${i}</ADD_TASK>`,
      ).join(" ");

      const parts = await executeActions(reply, h);

      expect(h.addTask).toHaveBeenCalledTimes(MAX_TASKS_PER_REPLY);
      expect(widgets(parts).filter((w) => w.cancelled)).toHaveLength(3);
    });

    it("ignores an empty task name rather than creating a blank task", async () => {
      const h = handlers();
      const parts = await executeActions("<ADD_TASK>  </ADD_TASK>", h);
      expect(h.confirm).not.toHaveBeenCalled();
      expect(widgets(parts)).toHaveLength(0);
    });
  });

  describe("START_TIMER", () => {
    it("starts the named duration without asking", async () => {
      const h = handlers();
      const parts = await executeActions("<START_TIMER>45</START_TIMER>", h);

      expect(h.startTimer).toHaveBeenCalledWith(45);
      expect(h.confirm).not.toHaveBeenCalled();
      expect(widgets(parts)[0].text).toBe("Started focus timer for 45m");
    });

    it("starts nothing when the payload is not a duration", async () => {
      const h = handlers();
      const parts = await executeActions("<START_TIMER>soon</START_TIMER>", h);
      expect(h.startTimer).not.toHaveBeenCalled();
      expect(widgets(parts)[0].cancelled).toBe(true);
    });

    /* The vanilla executed only the first occurrence but rendered a success
       widget for every one, so a reply with two blocks claimed two timers had
       started when one had. */
    it("runs once and marks a repeat as cancelled", async () => {
      const h = handlers();
      const parts = await executeActions(
        "<START_TIMER>25</START_TIMER><START_TIMER>50</START_TIMER>",
        h,
      );

      expect(h.startTimer).toHaveBeenCalledTimes(1);
      expect(h.startTimer).toHaveBeenCalledWith(25);
      expect(widgets(parts).map((w) => w.cancelled)).toEqual([false, true]);
    });
  });

  describe("SET_THEME", () => {
    it("applies a theme the app has", async () => {
      const h = handlers();
      const parts = await executeActions("<SET_THEME>Dark</SET_THEME>", h);
      expect(h.setTheme).toHaveBeenCalledWith("dark");
      expect(widgets(parts)[0].text).toBe("Switched theme to dark");
    });

    it("reports a failure when the app has no such theme", async () => {
      const h = handlers({ setTheme: vi.fn().mockReturnValue(false) });
      const parts = await executeActions("<SET_THEME>plaid</SET_THEME>", h);
      expect(widgets(parts)[0]).toMatchObject({
        cancelled: true,
        text: "Failed to switch theme",
      });
    });
  });

  describe("NAVIGATE", () => {
    it("navigates and says where", async () => {
      const h = handlers();
      const parts = await executeActions("<NAVIGATE>timer</NAVIGATE>", h);
      expect(h.navigate).toHaveBeenCalledWith("timer");
      expect(widgets(parts)[0].text).toBe("Navigated to timer");
    });

    /* The vanilla rendered nothing for a failed navigation rather than telling
       the student an action was cancelled they never asked for. */
    it("renders nothing when the destination does not exist", async () => {
      const h = handlers({ navigate: vi.fn().mockReturnValue(false) });
      const parts = await executeActions(
        "before<NAVIGATE>atlantis</NAVIGATE>after",
        h,
      );
      expect(widgets(parts)).toHaveLength(0);
      expect(text(parts)).toBe("beforeafter");
    });
  });

  /* Parsed so the tag never survives into the visible reply, but not executed:
     the vanilla clicked the review screen's score buttons and there is no
     React flashcard review until step 18. */
  it("swallows GRADE_FLASHCARD without executing or rendering it", async () => {
    const parts = await executeActions(
      "Nice work <GRADE_FLASHCARD>3</GRADE_FLASHCARD> keep going",
      handlers(),
    );
    expect(widgets(parts)).toHaveLength(0);
    expect(text(parts)).toBe("Nice work  keep going");
  });

  describe("ADD_QUIZ", () => {
    it("asks first, then kicks off generation", async () => {
      const h = handlers();
      const parts = await executeActions(
        "<ADD_QUIZ>Photosynthesis</ADD_QUIZ>",
        h,
      );

      expect(h.confirm).toHaveBeenCalledWith(
        expect.stringContaining("Photosynthesis"),
        expect.objectContaining({ title: "AI Quiz Generation" }),
      );
      expect(h.generateQuiz).toHaveBeenCalledWith("Photosynthesis");
      expect(widgets(parts)[0]).toMatchObject({
        cancelled: false,
        subject: "Photosynthesis",
      });
    });

    it("generates nothing when declined", async () => {
      const h = handlers({ confirm: vi.fn().mockResolvedValue(false) });
      const parts = await executeActions("<ADD_QUIZ>Topic</ADD_QUIZ>", h);
      expect(h.generateQuiz).not.toHaveBeenCalled();
      expect(widgets(parts)[0].cancelled).toBe(true);
    });
  });

  describe("ADD_PLAN", () => {
    it("asks with the danger styling the vanilla used, then generates", async () => {
      const h = handlers();
      const parts = await executeActions("<ADD_PLAN></ADD_PLAN>", h);

      expect(h.confirm).toHaveBeenCalledWith(
        expect.stringContaining("weekly study schedule"),
        expect.objectContaining({ danger: true }),
      );
      expect(h.generatePlan).toHaveBeenCalled();
      expect(widgets(parts)[0].cancelled).toBe(false);
    });

    it("generates nothing when declined", async () => {
      const h = handlers({ confirm: vi.fn().mockResolvedValue(false) });
      await executeActions("<ADD_PLAN></ADD_PLAN>", h);
      expect(h.generatePlan).not.toHaveBeenCalled();
    });
  });

  it("executes several different tags in one reply, in order", async () => {
    const h = handlers();
    const parts = await executeActions(
      "Sure. <ADD_TASK>Revise</ADD_TASK> and <START_TIMER>30</START_TIMER>",
      h,
    );

    expect(h.addTask).toHaveBeenCalledWith("Revise");
    expect(h.startTimer).toHaveBeenCalledWith(30);
    expect(parts.map((p) => p.kind)).toEqual([
      "text",
      "widget",
      "text",
      "widget",
    ]);
  });

  it("does not treat an unclosed tag as an action", async () => {
    const h = handlers();
    const parts = await executeActions("<ADD_TASK>never closed", h);
    expect(h.addTask).not.toHaveBeenCalled();
    expect(parts).toEqual([{ kind: "text", text: "<ADD_TASK>never closed" }]);
  });
});

describe("pathForNavigateTarget", () => {
  it("maps the vanilla's hash names onto React paths", () => {
    expect(pathForNavigateTarget("todo")).toBe("/tasks");
    expect(pathForNavigateTarget("dashboard")).toBe("/");
    expect(pathForNavigateTarget("quizzes")).toBe("/library/quizzes");
    expect(pathForNavigateTarget("settings")).toBe("/settings");
  });

  /* An invented destination is ignored rather than pushing the student onto
     the not-found page. */
  it("returns null for a route the app does not have", () => {
    expect(pathForNavigateTarget("atlantis")).toBeNull();
  });
});
