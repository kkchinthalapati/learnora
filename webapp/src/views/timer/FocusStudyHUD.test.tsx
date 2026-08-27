import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import {
  initialTimerState,
  persistTimerState,
} from "../../lib/timer";
import { useTimer } from "../../context/timer";
import { FocusStudyHUD, SCRATCHPAD_STORAGE_KEY } from "./FocusStudyHUD";

function SetupActiveTaskAndFolder({
  task,
  folderId,
}: {
  task?: string;
  folderId?: string;
}) {
  const { setActiveTask, setActiveFolderId } = useTimer();
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (task) setActiveTask(task);
          if (folderId) setActiveFolderId(folderId);
        }}
      >
        Bind Session
      </button>
    </div>
  );
}

function renderHUD(
  path = "/tasks",
  extra?: { task?: string; folderId?: string },
) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              {extra && (
                <SetupActiveTaskAndFolder
                  task={extra.task}
                  folderId={extra.folderId}
                />
              )}
              <FocusStudyHUD />
              <div id="route-view">Current route: {path}</div>
            </>
          }
        />
        <Route path="/timer" element={<div>Full Timer View</div>} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
    { withTimer: true },
  );
}

describe("FocusStudyHUD", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/tasks`, () => HttpResponse.json([])),
      http.get(`${SUPABASE_URL}/rest/v1/folders`, () =>
        HttpResponse.json([
          {
            id: "folder-bio",
            user_id: "user-1",
            name: "Cell Biology",
            color: "#E11D48",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays hidden while no session is live", () => {
    renderHUD("/tasks");
    expect(screen.queryByRole("button", { name: "Open the timer" })).toBeNull();
    expect(document.documentElement.dataset.hasMiniTimer).toBeUndefined();
  });

  it("stays hidden on /timer route even when a session is active", () => {
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 1500,
      isRunning: true,
    });
    renderHUD("/timer");

    expect(screen.queryByRole("button", { name: "Open the timer" })).toBeNull();
    expect(document.documentElement.dataset.hasMiniTimer).toBeUndefined();
  });

  it("docks on another route once a countdown is active", () => {
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 1500,
    });
    renderHUD("/tasks");

    expect(
      screen.getByRole("button", { name: "Open the timer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("General Study")).toBeInTheDocument();
    expect(document.documentElement.dataset.hasMiniTimer).toBe("true");
  });

  it("announces itself politely via role='status' and aria-live='polite'", () => {
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 1500,
    });
    renderHUD("/tasks");

    const hud = screen
      .getByRole("button", { name: "Open the timer" })
      .closest('[role="status"]')!;
    expect(hud).toHaveAttribute("aria-live", "polite");
  });

  it("reports continuous progress on the progress bar", () => {
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 600,
    });
    renderHUD("/tasks");

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "50");
  });

  it("displays bound task label and active subject color", async () => {
    const user = userEvent.setup();
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 1500,
    });
    renderHUD("/tasks", {
      task: "Read Chapter 4: Mitochondria",
      folderId: "folder-bio",
    });

    await user.click(screen.getByRole("button", { name: "Bind Session" }));

    expect(
      screen.getByText("Read Chapter 4: Mitochondria"),
    ).toBeInTheDocument();

    const dot = screen.getByTestId("subject-dot");
    expect(dot).toHaveStyle({ backgroundColor: "rgb(225, 29, 72)" });
  });

  it("toggles the timer between pause and resume", async () => {
    const user = userEvent.setup();
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 1500,
      isRunning: false,
    });
    renderHUD("/tasks");

    const toggleBtn = screen.getByRole("button", { name: "Resume timer" });
    await user.click(toggleBtn);

    expect(
      screen.getByRole("button", { name: "Pause timer" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pause timer" }));
    expect(
      screen.getByRole("button", { name: "Resume timer" }),
    ).toBeInTheDocument();
  });

  it("adds five minutes to countdown with the +5m button", async () => {
    const user = userEvent.setup();
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 1500,
    });
    renderHUD("/tasks");

    expect(screen.getByText("05:00")).toBeInTheDocument();

    const extendBtn = screen.getByRole("button", { name: "+5 minutes" });
    await user.click(extendBtn);

    expect(screen.getByText("10:00")).toBeInTheDocument();
  });

  it("navigates to /timer when clicking Open the timer", async () => {
    const user = userEvent.setup();
    persistTimerState({
      ...initialTimerState(),
      timeLeft: 300,
      totalTime: 1500,
    });
    renderHUD("/tasks");

    await user.click(screen.getByRole("button", { name: "Open the timer" }));

    expect(await screen.findByText("Full Timer View")).toBeInTheDocument();
  });

  describe("Distraction Scratchpad", () => {
    it("opens and closes scratchpad popover on button click", async () => {
      const user = userEvent.setup();
      persistTimerState({
        ...initialTimerState(),
        timeLeft: 300,
        totalTime: 1500,
      });
      renderHUD("/tasks");

      const scratchpadBtn = screen.getByRole("button", {
        name: "Distraction scratchpad",
      });
      expect(scratchpadBtn).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("dialog")).toBeNull();

      // Open scratchpad
      await user.click(scratchpadBtn);
      expect(scratchpadBtn).toHaveAttribute("aria-expanded", "true");
      expect(
        screen.getByRole("dialog", { name: "Distraction scratchpad" }),
      ).toBeInTheDocument();

      const textarea = screen.getByRole("textbox", { name: "Scratchpad notes" });
      expect(textarea).toHaveFocus();

      // Close scratchpad via close button
      await user.click(screen.getByRole("button", { name: "Close scratchpad" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("opens and toggles scratchpad popover using Alt+N global shortcut", async () => {
      persistTimerState({
        ...initialTimerState(),
        timeLeft: 300,
        totalTime: 1500,
      });
      renderHUD("/tasks");

      expect(screen.queryByRole("dialog")).toBeNull();

      // Trigger Alt+N
      fireEvent.keyDown(window, { key: "n", altKey: true });
      expect(
        screen.getByRole("dialog", { name: "Distraction scratchpad" }),
      ).toBeInTheDocument();

      // Trigger Alt+N again to toggle closed
      fireEvent.keyDown(window, { key: "n", altKey: true });
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("persists typed notes into localStorage under learnora_quick_scratchpad", async () => {
      const user = userEvent.setup();
      persistTimerState({
        ...initialTimerState(),
        timeLeft: 300,
        totalTime: 1500,
      });
      renderHUD("/tasks");

      await user.click(
        screen.getByRole("button", { name: "Distraction scratchpad" }),
      );

      const textarea = screen.getByRole("textbox", { name: "Scratchpad notes" });
      await user.type(textarea, "Check ATP cycle details later");

      expect(localStorage.getItem(SCRATCHPAD_STORAGE_KEY)).toBe(
        "Check ATP cycle details later",
      );
    });

    it("loads pre-existing note from localStorage on mount", async () => {
      const user = userEvent.setup();
      localStorage.setItem(
        SCRATCHPAD_STORAGE_KEY,
        "Remember to email professor about deadline",
      );

      persistTimerState({
        ...initialTimerState(),
        timeLeft: 300,
        totalTime: 1500,
      });
      renderHUD("/tasks");

      await user.click(
        screen.getByRole("button", { name: "Distraction scratchpad" }),
      );

      const textarea = screen.getByRole("textbox", { name: "Scratchpad notes" });
      expect(textarea).toHaveValue(
        "Remember to email professor about deadline",
      );
    });

    it("clears scratchpad notes when Clear button is clicked", async () => {
      const user = userEvent.setup();
      localStorage.setItem(
        SCRATCHPAD_STORAGE_KEY,
        "Some fleeting thought",
      );

      persistTimerState({
        ...initialTimerState(),
        timeLeft: 300,
        totalTime: 1500,
      });
      renderHUD("/tasks");

      await user.click(
        screen.getByRole("button", { name: "Distraction scratchpad" }),
      );

      const clearBtn = screen.getByRole("button", { name: "Clear note" });
      await user.click(clearBtn);

      const textarea = screen.getByRole("textbox", { name: "Scratchpad notes" });
      expect(textarea).toHaveValue("");
      expect(localStorage.getItem(SCRATCHPAD_STORAGE_KEY)).toBe("");
    });

    it("closes scratchpad popover when Escape key is pressed inside dialog", async () => {
      const user = userEvent.setup();
      persistTimerState({
        ...initialTimerState(),
        timeLeft: 300,
        totalTime: 1500,
      });
      renderHUD("/tasks");

      await user.click(
        screen.getByRole("button", { name: "Distraction scratchpad" }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Distraction scratchpad",
      });
      expect(dialog).toBeInTheDocument();

      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
