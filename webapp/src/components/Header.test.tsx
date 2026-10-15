import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Header } from "./Header";
import { fakeSession, renderWithAuth } from "../test/auth";
import { mockAuthSession } from "../test/mockSession";

/* Header is the page's title row now (webapp/DESIGN.md 0.3). Search, help,
 * Ask and the account moved to the TopBar — see TopBar.test.tsx. */
describe("Header", () => {
  function renderHeader(path: string) {
    return renderWithAuth(
      <Header />,
      { session: fakeSession({ user_metadata: { full_name: "Marie Curie" } }) },
      { withRouter: true, initialEntries: [path] },
    );
  }

  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
  });

  it("leaves the title to Home on the root route, and greets no one", () => {
    renderHeader("/");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByText(/Marie/i)).toBeNull();
  });

  it("leaves the title to a lesson page, which names the lesson itself", () => {
    renderHeader("/lessons/m-1");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders the page title on routes that don't own one", () => {
    renderHeader("/timer");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Focus timer");
  });

  it("carries no navigation, search or sign-out of its own", () => {
    renderHeader("/timer");
    expect(screen.queryByRole("button", { name: /search/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /toggle sidebar/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /log out|sign out/i })).toBeNull();
  });
});
