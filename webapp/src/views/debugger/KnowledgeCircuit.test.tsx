import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeCircuit } from "./KnowledgeCircuit";
import type { CognitiveLayer } from "../../api/aiDebugger";

const mockBrokenLayers: CognitiveLayer[] = [
  {
    level: 3,
    concept: "Surface Derivative Calculation",
    status: "severed",
    explanation: "Direct application error on sin(x^2)",
    prerequisiteOf: "Exam Question",
  },
  {
    level: 2,
    concept: "Function Composition & Rates",
    status: "shaky",
    explanation: "Intermediate multiplier omitted",
    prerequisiteOf: "Surface Derivative",
  },
  {
    level: 1,
    concept: "Inner Variable Invariance",
    status: "severed",
    explanation: "Bedrock prerequisite misunderstanding",
    prerequisiteOf: "Function Composition",
  },
];

const mockHealedLayers: CognitiveLayer[] = [
  {
    level: 3,
    concept: "Surface Derivative Calculation",
    status: "healthy",
    explanation: "Direct application verified",
    prerequisiteOf: "Exam Question",
  },
  {
    level: 2,
    concept: "Function Composition & Rates",
    status: "healthy",
    explanation: "Intermediate multiplier connected",
    prerequisiteOf: "Surface Derivative",
  },
  {
    level: 1,
    concept: "Inner Variable Invariance",
    status: "healthy",
    explanation: "Bedrock prerequisite reconstructed",
    prerequisiteOf: "Function Composition",
  },
];

describe("KnowledgeCircuit Component", () => {
  it("renders the 3 circuit nodes (Root, Bridge, Surface)", () => {
    render(<KnowledgeCircuit layers={mockBrokenLayers} />);

    expect(screen.getByTestId("knowledge-circuit")).toBeInTheDocument();
    expect(screen.getByText("Prerequisite Circuit Diagnostics")).toBeInTheDocument();
    expect(screen.getByText(/LEVEL 1: ROOT/i)).toBeInTheDocument();
    expect(screen.getByText(/LEVEL 2: BRIDGE/i)).toBeInTheDocument();
    expect(screen.getByText(/LEVEL 3: SURFACE/i)).toBeInTheDocument();
  });

  it("displays broken circuit status when severed prerequisite is present", () => {
    render(<KnowledgeCircuit layers={mockBrokenLayers} />);

    const statusBadge = screen.getByTestId("circuit-signal-status");
    expect(statusBadge).toHaveTextContent(/Prerequisite Link Severed/i);
    expect(
      screen.getByText(/Because Level 1 \[Inner Variable Invariance\] broke/i),
    ).toBeInTheDocument();
  });

  it("displays healthy restored status when all layers are healthy", () => {
    render(<KnowledgeCircuit layers={mockHealedLayers} />);

    const statusBadge = screen.getByTestId("circuit-signal-status");
    expect(statusBadge).toHaveTextContent(/100% Signal Integrity \(Restored\)/i);
    expect(
      screen.getByText(/All prerequisite links are restored and verified/i),
    ).toBeInTheDocument();
  });

  it("triggers onSelectLevel when clicking or pressing Enter on a node", () => {
    const handleSelect = vi.fn();
    render(
      <KnowledgeCircuit
        layers={mockBrokenLayers}
        selectedLevel={undefined}
        onSelectLevel={handleSelect}
      />,
    );

    const level1Node = screen.getByLabelText(/Level 1 Root Foundation/i);
    fireEvent.click(level1Node);
    expect(handleSelect).toHaveBeenCalledWith(1);

    const level2Node = screen.getByLabelText(/Level 2 Intermediate Bridge/i);
    fireEvent.keyDown(level2Node, { key: "Enter" });
    expect(handleSelect).toHaveBeenCalledWith(2);

    const level3Node = screen.getByLabelText(/Level 3 Surface Problem/i);
    fireEvent.keyDown(level3Node, { key: " " });
    expect(handleSelect).toHaveBeenCalledWith(3);
  });

  it("handles missing layers gracefully with defaults", () => {
    render(<KnowledgeCircuit layers={[]} />);
    expect(screen.getByTestId("knowledge-circuit")).toBeInTheDocument();
    expect(screen.getByText(/LEVEL 1: ROOT/i)).toBeInTheDocument();
  });
});
