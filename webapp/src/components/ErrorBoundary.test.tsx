import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { renderWithProviders } from "../test/render";
import { ErrorBoundary } from "./ErrorBoundary";

const applyAppUpdateMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/appUpdate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/appUpdate")>()),
  applyAppUpdate: applyAppUpdateMock,
}));

function Bomb({ armed }: { armed: boolean }): null {
  if (armed) throw new Error("boom");
  return null;
}

describe("ErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    renderWithProviders(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("shows a fallback screen instead of crashing when a child throws", () => {
    // React logs the error to the console on its own regardless of the
    // boundary; silence that expected noise for this test.
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(
      <ErrorBoundary>
        <Bomb armed />
      </ErrorBoundary>,
      undefined,
      { withRouter: true },
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to Dashboard" }),
    ).toBeInTheDocument();
  });

  it("re-renders children after Try again, once the failure condition clears", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();

    let armed = true;
    function Harness() {
      return (
        <ErrorBoundary>
          <Bomb armed={armed} />
          <p>Recovered</p>
        </ErrorBoundary>
      );
    }

    // Bare render + MemoryRouter here (not renderWithProviders): `rerender`
    // replaces the whole tree passed to it, so re-wrapping has to happen on
    // every call — simplest to own that wrapping directly for this test.
    const { rerender } = render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Clear the condition that threw, then re-render the *same* boundary
    // instance with the fix in place, then ask it to try again — mirrors how
    // a real fix (or a transient failure resolving) would look. The boundary
    // won't re-attempt rendering its children just because a re-render came
    // through; it's still latched on state.error until reset.
    armed = false;
    rerender(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Recovered")).toBeInTheDocument();
    expect(
      screen.queryByText("Something went wrong"),
    ).not.toBeInTheDocument();
  });

  it("offers the update path, not Try again, when a lazy chunk fails to load", async () => {
    /* What a deploy looks like from inside an open tab: the running bundle
       asks for a hashed chunk filename the server no longer has. "Try again"
       re-runs the same import() against the same missing file, so the
       generic fallback loops forever on a blank screen mid-quiz. */
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();

    function ChunkBomb(): null {
      throw new TypeError(
        "Failed to fetch dynamically imported module: /assets/QuizRunner-a1b2c3.js",
      );
    }

    renderWithProviders(
      <ErrorBoundary>
        <ChunkBomb />
      </ErrorBoundary>,
      undefined,
      { withRouter: true },
    );

    expect(screen.getByText("A new version is ready")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reload Learnora" }));
    expect(applyAppUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the generic fallback for errors that are not chunk failures", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(
      <ErrorBoundary>
        <Bomb armed />
      </ErrorBoundary>,
      undefined,
      { withRouter: true },
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reload Learnora" }),
    ).not.toBeInTheDocument();
  });

  /* The docked overlays (chat panel, focus HUD) sat outside every boundary in
     the tree, so a throw in either took the whole app to a blank tab. They get
     their own boundary now, and it has to render nothing rather than the
     full-page card — replacing the dashboard with an error screen because the
     chat panel broke is the same crash from the student's point of view. */
  it("renders a silent fallback instead of the recovery card when given one", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(
      <>
        <p>the dashboard</p>
        <ErrorBoundary label="overlays" fallback={null}>
          <Bomb armed />
        </ErrorBoundary>
      </>,
      undefined,
      { withRouter: true },
    );

    expect(screen.getByText("the dashboard")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /something went wrong/i }),
    ).not.toBeInTheDocument();
  });
});
