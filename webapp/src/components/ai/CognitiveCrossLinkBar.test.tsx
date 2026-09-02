import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { CognitiveBridge, type CognitiveContextPayload } from "../../lib/cognitiveBridge";
import { CognitiveCrossLinkBar } from "./CognitiveCrossLinkBar";

describe("CognitiveCrossLinkBar", () => {
  beforeEach(() => {
    CognitiveBridge.clear();
    sessionStorage.clear();
    localStorage.clear();
  });

  const testPayload: CognitiveContextPayload = {
    subject: "Calculus",
    topic: "Chain Rule",
    concept: "Inner Derivative Multiplier",
    sourceTool: "debugger",
    sourceId: "trace-456",
    evidencePrompt: "Missed multiplying by derivative of inner composite argument",
    misconceptions: ["Treated inner expression as constant"],
    severity: "critical",
    suggestedAction: "teach_apprentice",
  };

  it("renders null when there is no active payload and no props provided", () => {
    const { container } = renderWithAuth(
      <CognitiveCrossLinkBar />,
      { session: fakeSession() },
      { withRouter: true },
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders active concept, subject, source tool, severity, and 3 cross-launch buttons", () => {
    renderWithAuth(
      <CognitiveCrossLinkBar payload={testPayload} />,
      { session: fakeSession() },
      { withRouter: true },
    );

    expect(screen.getByTestId("cognitive-cross-link-bar")).toBeInTheDocument();
    expect(screen.getByTestId("cross-link-concept-badge")).toHaveTextContent(
      "Inner Derivative Multiplier",
    );
    expect(screen.getByTestId("cross-link-subject-badge")).toHaveTextContent("Calculus");
    expect(screen.getByTestId("cross-link-source-badge")).toHaveTextContent("From: Find My Mistake");
    expect(screen.getByTestId("cross-link-severity-badge")).toHaveTextContent("Needs work");
    expect(screen.getByTestId("cross-link-misconceptions-count")).toHaveTextContent(
      "1 thing to sort out",
    );

    // 3 tool buttons
    expect(screen.getByTestId("cross-link-debugger-btn")).toBeInTheDocument();
    expect(screen.getByTestId("cross-link-feynman-btn")).toBeInTheDocument();
    expect(screen.getByTestId("cross-link-premortem-btn")).toBeInTheDocument();
  });

  it("reads from persisted CognitiveBridge storage when props are omitted", () => {
    CognitiveBridge.setPayload({
      subject: "Physics",
      topic: "Kinematics",
      concept: "Velocity vs Acceleration",
      sourceTool: "feynman",
      severity: "moderate",
    });

    renderWithAuth(
      <CognitiveCrossLinkBar />,
      { session: fakeSession() },
      { withRouter: true },
    );

    expect(screen.getByTestId("cross-link-concept-badge")).toHaveTextContent(
      "Velocity vs Acceleration",
    );
    expect(screen.getByTestId("cross-link-source-badge")).toHaveTextContent(
      "From: Explain It Simply",
    );
    expect(screen.getByTestId("cross-link-severity-badge")).toHaveTextContent("Worth a look");
  });

  it("cross-launches into target tool with custom onNavigate callback and sets suggestedAction", () => {
    const handleNavigate = vi.fn();

    renderWithAuth(
      <CognitiveCrossLinkBar
        payload={testPayload}
        currentTool="debugger"
        onNavigate={handleNavigate}
      />,
      { session: fakeSession() },
      { withRouter: true },
    );

    // Click Feynman button
    const feynmanBtn = screen.getByTestId("cross-link-feynman-btn");
    fireEvent.click(feynmanBtn);

    expect(handleNavigate).toHaveBeenCalledWith("/feynman", "feynman");

    const bridgePayload = CognitiveBridge.getPayload();
    expect(bridgePayload).not.toBeNull();
    expect(bridgePayload?.concept).toBe("Inner Derivative Multiplier");
    expect(bridgePayload?.suggestedAction).toBe("teach_apprentice");
  });

  it("cross-launches into Pre-Mortem and updates bridge action", () => {
    const handleNavigate = vi.fn();

    renderWithAuth(
      <CognitiveCrossLinkBar
        payload={testPayload}
        onNavigate={handleNavigate}
      />,
      { session: fakeSession() },
      { withRouter: true },
    );

    const premortemBtn = screen.getByTestId("cross-link-premortem-btn");
    fireEvent.click(premortemBtn);

    expect(handleNavigate).toHaveBeenCalledWith("/premortem", "premortem");
    expect(CognitiveBridge.getPayload()?.suggestedAction).toBe("run_premortem");
  });

  it("highlights the current tool with a you-are-here badge", () => {
    renderWithAuth(
      <CognitiveCrossLinkBar payload={testPayload} currentTool="debugger" />,
      { session: fakeSession() },
      { withRouter: true },
    );

    const debuggerBtn = screen.getByTestId("cross-link-debugger-btn");
    expect(debuggerBtn).toHaveTextContent("You’re here");
  });

  it("clears cognitive bridge context when clicking dismiss button", () => {
    const handleClear = vi.fn();

    CognitiveBridge.setPayload(testPayload);

    renderWithAuth(
      <CognitiveCrossLinkBar onClear={handleClear} />,
      { session: fakeSession() },
      { withRouter: true },
    );

    const dismissBtn = screen.getByTestId("cross-link-dismiss-btn");
    fireEvent.click(dismissBtn);

    expect(handleClear).toHaveBeenCalledTimes(1);
    expect(CognitiveBridge.getPayload()).toBeNull();
  });
});
