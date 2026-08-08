import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { renderWithProviders } from "../test/render";
import { ErrorBoundary } from "./ErrorBoundary";

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
});
