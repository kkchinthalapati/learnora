import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopicValueHint } from "./TopicValueHint";
import type { Intervention, TrajectoryForecast } from "../../lib/trajectory";

const trajectory = vi.fn();

vi.mock("../../hooks/useTrajectory", () => ({
  useTrajectory: () => trajectory(),
}));

function intervention(
  patch: Partial<Intervention> & { label: string },
): Intervention {
  return {
    topicId: patch.label,
    points: 3,
    pointsPerHour: 4,
    mastery: 0.3,
    atRisk: false,
    ...patch,
  };
}

function result(interventions: Intervention[] | null) {
  return {
    exam: null,
    candidates: [],
    needsMaterial: false,
    isPending: false,
    forecast: interventions
      ? ({
          examName: "Chemistry Paper 1",
          interventions,
        } as TrajectoryForecast)
      : null,
  };
}

describe("TopicValueHint", () => {
  beforeEach(() => {
    trajectory.mockReturnValue(
      result([
        intervention({ label: "Titration", pointsPerHour: 4.2 }),
        intervention({ label: "Bonding", pointsPerHour: 0.7 }),
      ]),
    );
  });

  it("offers the highest-value topic against whatever the student picked", async () => {
    const onUseTopic = vi.fn();
    const user = userEvent.setup();
    render(
      <TopicValueHint activeTask="Finish lab report" onUseTopic={onUseTopic} />,
    );

    expect(screen.getByText("Titration")).toBeInTheDocument();
    expect(screen.getByText(/6\.0× an hour on Bonding/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Study that instead" }),
    );
    expect(onUseTopic).toHaveBeenCalledWith("Titration");
  });

  /* Nagging a student who already made the right call is how a hint becomes
     something people learn to ignore. */
  it("confirms rather than nags when the student already chose it", () => {
    render(<TopicValueHint activeTask="titration" onUseTopic={vi.fn()} />);
    expect(screen.getByText(/Good pick/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says nothing without a forecast", () => {
    trajectory.mockReturnValue(result(null));
    const { container } = render(
      <TopicValueHint activeTask="None" onUseTopic={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing when no topic is worth an hour", () => {
    trajectory.mockReturnValue(
      result([intervention({ label: "Bonding", pointsPerHour: 0 })]),
    );
    const { container } = render(
      <TopicValueHint activeTask="None" onUseTopic={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
