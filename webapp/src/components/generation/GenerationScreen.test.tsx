import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  GenerationScreen,
  type GenerationScreenProps,
} from "./GenerationScreen";
import { stageForMessage, type GenerationJob } from "../../context/generation";

function job(patch: Partial<GenerationJob> = {}): GenerationJob {
  return {
    label: "Photosynthesis",
    stage: "notes",
    message: "Writing summary notes…",
    startedAt: Date.now(),
    minimized: false,
    steps: ["notes", "cards"],
    ...patch,
  };
}

function setup(
  patch: Partial<GenerationJob> = {},
  props: Partial<GenerationScreenProps> = {},
) {
  const handlers = {
    onMinimize: vi.fn(),
    onRestore: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
    onOpen: vi.fn(),
  };
  render(
    <GenerationScreen job={job(patch)} style={null} {...handlers} {...props} />,
  );
  return handlers;
}

describe("GenerationScreen", () => {
  it("shows what is being made and the step in flight, in the pipeline's own words", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Photosynthesis" });
    expect(dialog).toHaveTextContent("Writing summary notes…");
    expect(screen.getByText("Writing your notes")).toBeInTheDocument();
    expect(screen.getByText(/in progress/)).toBeInTheDocument();
    expect(screen.getByText("Making flashcards")).toBeInTheDocument();
  });

  it("lets the student keep working, and minimises on Escape", async () => {
    const user = userEvent.setup();
    const h = setup();
    await user.click(screen.getByRole("button", { name: /Keep working/ }));
    await user.keyboard("{Escape}");
    expect(h.onMinimize).toHaveBeenCalledTimes(2);
  });

  it("says what failed and offers a retry", async () => {
    const user = userEvent.setup();
    const h = setup({ stage: "failed", error: "Couldn't write notes." });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't write notes.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(h.onRetry).toHaveBeenCalled();
  });

  it("collapses to a pill that opens the lesson once it's ready", async () => {
    const user = userEvent.setup();
    const h = setup({
      minimized: true,
      stage: "done",
      destination: "/lessons/m-1?start=1",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      '"Photosynthesis" is ready',
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(h.onOpen).toHaveBeenCalled();
  });
});

describe("stageForMessage", () => {
  it("places each pipeline caption on its step", () => {
    expect(stageForMessage("Uploading notes.pdf…")).toBe("read");
    expect(stageForMessage("Loading your saved notes…")).toBe("read");
    expect(stageForMessage("Reading your lesson and writing notes…")).toBe(
      "notes",
    );
    expect(stageForMessage("Drawing a diagram of Osmosis…")).toBe("notes");
    expect(stageForMessage("Building 12 flashcards…")).toBe("cards");
    expect(stageForMessage("Writing 5 quiz questions…")).toBe("quiz");
    expect(stageForMessage("Something else")).toBeNull();
  });
});
