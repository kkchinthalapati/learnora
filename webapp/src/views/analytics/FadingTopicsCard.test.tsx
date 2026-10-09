import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { FadingTopicsCard } from "./FadingTopicsCard";

const trajectory = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../../hooks/useTrajectory", () => ({ useTrajectory: () => trajectory.value }));
const due = vi.hoisted(() => ({ value: 0 }));
vi.mock("../../hooks/useFlashcards", () => ({ useFlashcardsDueCount: () => ({ data: due.value }) }));

const topic = (id: string, label: string, mastery: number, stabilityDays: number) => ({
  id, label, mastery, evidence: 0.6, stabilityDays, weight: 1, cardCount: 5,
});

function renderCard(topics: unknown[]) {
  trajectory.value = {
    exam: { exam_name: "Biology midterm" },
    forecast: { topics },
    isPending: false,
  };
  render(
    <MemoryRouter>
      <FadingTopicsCard />
    </MemoryRouter>,
  );
}

describe("FadingTopicsCard", () => {
  it("lists what is fading on the mastery ladder, each with a check", () => {
    renderCard([topic("a", "Glycolysis", 0.4, 1.5), topic("b", "Krebs cycle", 0.9, 400)]);
    expect(screen.getByRole("img", { name: "Glycolysis: Recalled · fading" })).toBeInTheDocument();
    expect(screen.queryByText("Krebs cycle")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Check Glycolysis, about 4 minutes" }),
    ).toHaveAttribute("href", "/study/new?mode=recall&topic=Glycolysis");
  });

  it("says nothing is fading, names what is next, and offers a stretch", () => {
    renderCard([topic("b", "Krebs cycle", 0.9, 400), topic("c", "Enzymes", 0.5, 3)]);
    expect(screen.getByText("Nothing is fading right now.")).toBeInTheDocument();
    expect(screen.getByText(/Enzymes is next: it starts to slip in about 14 days/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Challenge me anyway" })).toHaveAttribute(
      "href",
      "/study/new?mode=practice&topic=Krebs+cycle",
    );
  });

  it("stays out of the way with no topics to show", () => {
    renderCard([]);
    expect(screen.queryByRole("heading")).toBeNull();
  });
});

describe("FadingTopicsCard with cards due", () => {
  it("does not claim everything is holding while cards are due", () => {
    due.value = 3;
    trajectory.value = {
      exam: null,
      isPending: false,
      forecast: { topics: [{ id: "d", label: "Enzymes", mastery: 0.9, evidence: 0.9, stabilityDays: 400, weight: 1, cardCount: 5 }] },
    };
    render(
      <MemoryRouter>
        <FadingTopicsCard />
      </MemoryRouter>,
    );
    expect(screen.getByText(/3 cards are due for review/)).toBeInTheDocument();
    expect(screen.queryByText(/Every topic you've studied is holding/)).toBeNull();
    due.value = 0;
  });
});
