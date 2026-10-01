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
  it("renders the 3 circuit nodes (basics, link, slip)", () => {
    render(<KnowledgeCircuit layers={mockBrokenLayers} />);

    expect(screen.getByTestId("knowledge-circuit")).toBeInTheDocument();
    expect(screen.getByText("How the steps connect")).toBeInTheDocument();
    expect(screen.getByText(/STEP 1: BASICS/i)).toBeInTheDocument();
    expect(screen.getByText(/STEP 2: LINK/i)).toBeInTheDocument();
    expect(screen.getByText(/STEP 3: THE SLIP/i)).toBeInTheDocument();
  });

  it("displays broken circuit status when severed prerequisite is present", () => {
    render(<KnowledgeCircuit layers={mockBrokenLayers} />);

    const statusBadge = screen.getByTestId("circuit-signal-status");
    expect(statusBadge).toHaveTextContent(/Missing link/i);
    expect(
      screen.getByText(/You never quite got \[Inner Variable Invariance\]/i),
    ).toBeInTheDocument();
  });

  it("displays healthy restored status when all layers are healthy", () => {
    render(<KnowledgeCircuit layers={mockHealedLayers} />);

    const statusBadge = screen.getByTestId("circuit-signal-status");
    expect(statusBadge).toHaveTextContent(/All three steps hold up/i);
    expect(
      screen.getByText(/All three steps hold up now/i),
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

    const level1Node = screen.getByLabelText(/Step 1, the basics/i);
    fireEvent.click(level1Node);
    expect(handleSelect).toHaveBeenCalledWith(1);

    const level2Node = screen.getByLabelText(/Step 2, the step in between/i);
    fireEvent.keyDown(level2Node, { key: "Enter" });
    expect(handleSelect).toHaveBeenCalledWith(2);

    const level3Node = screen.getByLabelText(/Step 3, the question you got wrong/i);
    fireEvent.keyDown(level3Node, { key: " " });
    expect(handleSelect).toHaveBeenCalledWith(3);
  });

  it("handles missing layers gracefully with defaults", () => {
    render(<KnowledgeCircuit layers={[]} />);
    expect(screen.getByTestId("knowledge-circuit")).toBeInTheDocument();
    expect(screen.getByText(/STEP 1: BASICS/i)).toBeInTheDocument();
  });
});
