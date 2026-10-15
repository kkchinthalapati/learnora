import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";

/* Progress (webapp/DESIGN.md 0.1): History, Mistakes and the exam forecast
 * as three tabs of one page. The panels' own content has its own tests. */
vi.mock("./StudyAnalyticsView", () => ({ StudyAnalyticsView: () => <p>History panel</p> }));
vi.mock("./FadingTopicsCard", () => ({ FadingTopicsCard: () => <p>Fading panel</p> }));
vi.mock("../dashboard/MisconceptionLedgerCard", () => ({ MisconceptionLedgerCard: () => <p>Ledger panel</p> }));
vi.mock("../trajectory/TrajectoryView", () => ({ TrajectoryBody: () => <p>Forecast panel</p> }));
vi.mock("../../components/ProGate", () => ({ ProGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const { ProgressView } = await import("./ProgressView");

const renderAt = (path: string) =>
  renderWithProviders(<ProgressView />, undefined, { withRouter: true, initialEntries: [path] });

describe("ProgressView", () => {
  it("is one page titled Progress that opens on History", () => {
    renderAt("/analytics");
    expect(screen.getByRole("heading", { level: 1, name: "Progress" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["History", "Mistakes", "Exam forecast"]);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("History panel");
  });

  it("opens the forecast from ?tab=forecast, where /trajectory now points", () => {
    renderAt("/analytics?tab=forecast");
    expect(screen.getByRole("tab", { name: "Exam forecast" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Forecast panel");
  });

  it("keeps the mistake ledger and fading topics together under Mistakes", async () => {
    renderAt("/analytics");
    await userEvent.setup().click(screen.getByRole("tab", { name: "Mistakes" }));
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveTextContent("Ledger panel");
    expect(panel).toHaveTextContent("Fading panel");
    expect(panel).not.toHaveTextContent("History panel");
  });
});
