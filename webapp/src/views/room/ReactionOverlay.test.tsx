import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactionOverlay } from "./ReactionOverlay";
import type { FloatingReaction, CheerNotification } from "./types";

describe("ReactionOverlay", () => {
  it("renders floating emoji reactions", () => {
    const reactions: FloatingReaction[] = [
      { id: "1", emoji: "🔥", x: 45, timestamp: Date.now() },
      { id: "2", emoji: "👏", x: 60, timestamp: Date.now() },
    ];

    render(<ReactionOverlay reactions={reactions} cheerFeed={[]} />);

    expect(screen.getByText("🔥")).toBeInTheDocument();
    expect(screen.getByText("👏")).toBeInTheDocument();
  });

  it("renders cheer feed toasts when provided", () => {
    const cheerFeed: CheerNotification[] = [
      {
        id: "1",
        emoji: "🧠",
        fromName: "Ada",
        toName: "Grace",
        timestamp: Date.now(),
      },
    ];

    render(<ReactionOverlay reactions={[]} cheerFeed={cheerFeed} />);

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Grace")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
