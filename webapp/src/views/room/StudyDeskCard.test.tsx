import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudyDeskCard } from "./StudyDeskCard";
import type { StudyParticipant } from "./types";

describe("StudyDeskCard", () => {
  const mockParticipant: StudyParticipant = {
    id: "user-1",
    name: "Ada Lovelace",
    avatarUrl: null,
    status: "focus",
    timerType: "pomodoro",
    isRunning: true,
    timeLeft: 1200,
    elapsed: 300,
    task: "Algorithm Design",
    subject: "Computer Science",
    streak: 4,
  };

  it("renders participant name, task, subject badge, and status", () => {
    const handleCheer = vi.fn();
    render(
      <StudyDeskCard
        participant={mockParticipant}
        isSelf={false}
        onCheer={handleCheer}
      />
    );

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Algorithm Design")).toBeInTheDocument();
    expect(screen.getByText("Computer Science")).toBeInTheDocument();
    expect(screen.getByText("Focusing")).toBeInTheDocument();
    expect(screen.getByText("🔥 4 days")).toBeInTheDocument();
  });

  it("renders '(You)' badge when isSelf is true", () => {
    const handleCheer = vi.fn();
    render(
      <StudyDeskCard
        participant={mockParticipant}
        isSelf={true}
        onCheer={handleCheer}
      />
    );

    expect(screen.getByText("(You)")).toBeInTheDocument();
  });

  it("triggers onCheer callback with the selected emoji", async () => {
    const user = userEvent.setup();
    const handleCheer = vi.fn();
    render(
      <StudyDeskCard
        participant={mockParticipant}
        isSelf={false}
        onCheer={handleCheer}
      />
    );

    const fireBtn = screen.getByRole("button", {
      name: /Send Fire \/ Keep going to Ada Lovelace/i,
    });
    await user.click(fireBtn);

    expect(handleCheer).toHaveBeenCalledTimes(1);
    expect(handleCheer).toHaveBeenCalledWith("🔥");
  });

  it("renders Sync Timer button when not self and participant is focusing", async () => {
    const user = userEvent.setup();
    const handleSync = vi.fn();
    render(
      <StudyDeskCard
        participant={mockParticipant}
        isSelf={false}
        onCheer={vi.fn()}
        onSync={handleSync}
      />
    );

    const syncBtn = screen.getByRole("button", {
      name: /Sync timer with Ada Lovelace/i,
    });
    expect(syncBtn).toBeInTheDocument();

    await user.click(syncBtn);
    expect(handleSync).toHaveBeenCalledTimes(1);
  });

  it("does not render Sync Timer button for self", () => {
    render(
      <StudyDeskCard
        participant={mockParticipant}
        isSelf={true}
        onCheer={vi.fn()}
        onSync={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /Sync timer/i })
    ).not.toBeInTheDocument();
  });
});
