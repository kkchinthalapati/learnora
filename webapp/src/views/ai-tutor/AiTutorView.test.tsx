import { screen, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import { AiTutorView } from "./AiTutorView";

// Mock child view components to keep test focused on AiTutorView orchestration
vi.mock("../debugger/CognitiveDebuggerView", () => ({
  CognitiveDebuggerView: () => <div data-testid="solver-view">Solver Content</div>,
}));

vi.mock("../feynman/FeynmanHubView", () => ({
  FeynmanHubView: () => <div data-testid="explain-view">Feynman Content</div>,
}));

vi.mock("../sparring/SocraticSparringView", () => ({
  SocraticSparringView: () => <div data-testid="viva-view">Viva Content</div>,
}));

describe("AiTutorView", () => {
  beforeEach(() => {
    localStorage.clear();
    CognitiveBridge.clear();
  });

  it("renders header, all 3 mode tabs, and default solver view", () => {
    render(
      <MemoryRouter initialEntries={["/ai-tutor"]}>
        <AiTutorView />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "AI Tutor" })).toBeInTheDocument();
    expect(screen.getByText("Step-by-Step Solver")).toBeInTheDocument();
    expect(screen.getByText("Explain & Teach")).toBeInTheDocument();
    expect(screen.getByText("Viva / Test Practice")).toBeInTheDocument();
    expect(screen.queryByText("Common Exam Traps")).not.toBeInTheDocument();

    // Default view is solver
    expect(screen.getByTestId("solver-view")).toBeInTheDocument();
  });

  it("switches tabs when clicking another learning mode", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/ai-tutor"]}>
        <AiTutorView />
      </MemoryRouter>,
    );

    // Switch to Explain & Teach (Feynman)
    const explainTab = screen.getByRole("tab", { name: /Explain & Teach/i });
    await user.click(explainTab);
    expect(screen.getByTestId("explain-view")).toBeInTheDocument();
    expect(screen.queryByTestId("solver-view")).not.toBeInTheDocument();

    // Switch to Viva / Test Practice
    const vivaTab = screen.getByRole("tab", { name: /Viva \/ Test Practice/i });
    await user.click(vivaTab);
    expect(screen.getByTestId("viva-view")).toBeInTheDocument();

    // Common Exam Traps should not exist
    expect(
      screen.queryByRole("tab", { name: /Common Exam Traps/i }),
    ).not.toBeInTheDocument();
  });

  it("loads and persists topic from CognitiveBridge and URL search params", async () => {
    CognitiveBridge.saveActiveTopic("Electrostatics");

    render(
      <MemoryRouter initialEntries={["/ai-tutor"]}>
        <AiTutorView />
      </MemoryRouter>,
    );

    // Should display active topic pill
    expect(screen.getByText("Electrostatics")).toBeInTheDocument();

    // Clear topic
    const clearBtn = screen.getByRole("button", { name: "Clear" });
    fireEvent.click(clearBtn);

    expect(screen.queryByText("Electrostatics")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Set study topic" })).toBeInTheDocument();
  });
});
