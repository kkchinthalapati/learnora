import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MasteryLadder } from "./MasteryLadder";
import { TutorTurn } from "./TutorTurn";
import { StudentTurn } from "./StudentTurn";
import { TrapCallout } from "./TrapCallout";
import { HintLadder } from "./HintLadder";
import { ConfidencePicker } from "./ConfidencePicker";
import { StepPlan } from "./StepPlan";

describe("MasteryLadder", () => {
  it("fills segments up to the rung and names the level in words", () => {
    const { container } = render(
      <MasteryLadder topic="Krebs cycle" rung={3} fading />,
    );
    expect(
      screen.getByRole("img", { name: "Krebs cycle: Applied · fading" }),
    ).toBeInTheDocument();
    const states = [...container.querySelectorAll("[data-state]")].map(
      (el) => el.getAttribute("data-state"),
    );
    /* Fading paints the top reached rung ochre, not the whole bar. */
    expect(states).toEqual(["filled", "filled", "fading", "empty"]);
  });

  it("marks only the rungs gained this time for the fill animation", () => {
    const { container } = render(<MasteryLadder rung={2} gainedFrom={1} />);
    const gained = [...container.querySelectorAll("[data-state]")].map(
      (el) => el.getAttribute("data-gained"),
    );
    expect(gained).toEqual([null, "true", null, null]);
  });

  it("can print the rung names", () => {
    render(<MasteryLadder rung={1} showRungLabels />);
    expect(screen.getByText("Explained")).toBeInTheDocument();
  });
});

describe("TutorTurn", () => {
  it("renders meta, claim, prose, trap, a closed 'Go deeper' and the check", () => {
    render(
      <TutorTurn
        meta="Step 3 · Explain"
        claim="The chain pumps protons."
        trap="ATP synthase is in the inner membrane."
        deeper="Longer version."
        check={<button type="button">Answer</button>}
      >
        <p>Electrons move along the chain.</p>
      </TutorTurn>,
    );
    expect(screen.getByText("Step 3 · Explain")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The chain pumps protons." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Common trap" })).toHaveTextContent(
      "ATP synthase is in the inner membrane.",
    );
    expect(screen.getByText("Go deeper").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Answer" })).toBeInTheDocument();
  });

  it("marks itself busy and shows the cursor while streaming", () => {
    const { container } = render(<TutorTurn streaming>Partial</TutorTurn>);
    expect(container.querySelector("article")).toHaveAttribute("aria-busy", "true");
  });
});

describe("StudentTurn / TrapCallout", () => {
  it("attributes the student's words for screen readers", () => {
    render(<StudentTurn>Why the inner membrane?</StudentTurn>);
    expect(screen.getByText(/You said:/)).toBeInTheDocument();
  });

  it("labels the trap in text, not only colour", () => {
    render(<TrapCallout>Watch out.</TrapCallout>);
    expect(screen.getByText("Common trap")).toBeInTheDocument();
  });
});

describe("HintLadder", () => {
  it("offers three graduated hints and reports which was asked for", async () => {
    const onHint = vi.fn();
    render(<HintLadder onHint={onHint} used={["nudge"]} />);
    expect(screen.getByRole("group", { name: /Stuck/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Bigger hint" }));
    expect(onHint).toHaveBeenCalledWith("bigger");
    expect(screen.getByRole("button", { name: "Nudge" })).toHaveAttribute(
      "data-used",
      "true",
    );
  });
});

describe("ConfidencePicker", () => {
  it("is labelled optional and toggles a selection off again", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ConfidencePicker value={null} onChange={onChange} />,
    );
    expect(screen.getByRole("group", { name: /optional/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fairly sure" }));
    expect(onChange).toHaveBeenLastCalledWith("fairly");

    rerender(<ConfidencePicker value="fairly" onChange={onChange} />);
    const fairly = screen.getByRole("button", { name: "Fairly sure" });
    expect(fairly).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(fairly);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("StepPlan", () => {
  it("derives done / current / upcoming and announces each in words", () => {
    render(
      <StepPlan
        label="Plan · 3 steps"
        current={1}
        steps={[
          { id: "a", label: "Carry" },
          { id: "b", label: "Pump" },
          { id: "c", label: "Flow" },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Done: Carry");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[1]).toHaveTextContent("Current step: Pump");
    expect(items[2]).toHaveTextContent("Not started: Flow");
  });

  it("lets a step override its derived status", () => {
    render(
      <StepPlan
        label="Pipeline"
        current={0}
        steps={[
          { id: "a", label: "Reading", status: "done" },
          { id: "b", label: "Topics", status: "done" },
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Done: Reading");
  });
});
