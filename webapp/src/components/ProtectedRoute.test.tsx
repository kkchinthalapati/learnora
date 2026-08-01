import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ProtectedRoute } from "./ProtectedRoute";
import { fakeSession, renderWithAuth } from "../test/auth";
import type { AuthState } from "../context/auth";

function LoginStub() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from;
  return (
    <main>
      <h1>Sign in</h1>
      <p data-testid="from">{from?.pathname ?? "none"}</p>
    </main>
  );
}

function renderGuardedAt(path: string, state: Partial<AuthState>) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginStub />} />
        <Route element={<ProtectedRoute />}>
          <Route
            path="/settings"
            element={
              <main>
                <h1>Settings</h1>
              </main>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
    state,
  );
}

describe("ProtectedRoute", () => {
  it("renders the view when a session exists", () => {
    renderGuardedAt("/settings", { session: fakeSession() });
    expect(
      screen.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("waits instead of redirecting while the stored session is still loading", () => {
    renderGuardedAt("/settings", { session: null, loading: true });

    // The important half of this assertion is the absence of the redirect:
    // bouncing here would sign out anyone who just reloaded the page.
    expect(
      screen.queryByRole("heading", { name: "Sign in" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Loading your workspace" }),
    ).toBeInTheDocument();
  });

  it("redirects to /login once it knows there is no session", () => {
    renderGuardedAt("/settings", { session: null, loading: false });
    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });

  it("remembers where the user was headed", () => {
    renderGuardedAt("/settings", { session: null, loading: false });
    expect(screen.getByTestId("from")).toHaveTextContent("/settings");
  });
});
