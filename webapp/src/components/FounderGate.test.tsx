import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { FounderGate, type FounderGateProps } from "./FounderGate";
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

function HomeStub() {
  const location = useLocation();
  const denied = (location.state as { denied?: boolean } | null)?.denied;
  return (
    <main>
      <h1>Student Dashboard</h1>
      {denied && <p data-testid="denied">access-denied</p>}
    </main>
  );
}

function WorkspaceStub() {
  return (
    <main>
      <h1>Founder Workspace</h1>
      <p>Confidential Strategy & Operations</p>
    </main>
  );
}

function renderGuarded(
  path = "/slack",
  state: Partial<AuthState> = {},
  gateProps: FounderGateProps = {},
) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginStub />} />
        <Route path="/" element={<HomeStub />} />
        <Route
          element={<FounderGate {...gateProps} />}
        >
          <Route path="/slack" element={<WorkspaceStub />} />
          <Route path="/slack/:channelId" element={<WorkspaceStub />} />
        </Route>
      </Routes>
    </MemoryRouter>,
    state,
  );
}

describe("FounderGate", () => {
  it("renders loading skeleton while auth state is resolving", () => {
    renderGuarded("/slack", { session: null, user: null, loading: true });

    // Must show loading indicator
    expect(
      screen.getByRole("status", { name: "Loading Founder Workspace" }),
    ).toBeInTheDocument();

    // Must not prematurely redirect
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Student Dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Founder Workspace" })).not.toBeInTheDocument();
  });

  it("redirects unauthenticated user to /login and preserves target location", () => {
    renderGuarded("/slack", { session: null, user: null, loading: false });

    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByTestId("from")).toHaveTextContent("/slack");
    expect(screen.queryByRole("heading", { name: "Founder Workspace" })).not.toBeInTheDocument();
  });

  it("redirects student user to / in default redirect mode", () => {
    const studentSession = fakeSession({ email: "student@example.com", id: "user-student" });
    renderGuarded("/slack", { session: studentSession });

    expect(
      screen.getByRole("heading", { level: 1, name: "Student Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("denied")).toHaveTextContent("access-denied");
    expect(screen.queryByRole("heading", { name: "Founder Workspace" })).not.toBeInTheDocument();
  });

  it("renders unauthorized card for student when blockMode is 'card'", () => {
    const studentSession = fakeSession({ email: "student@example.com", id: "user-student" });
    renderGuarded("/slack", { session: studentSession }, { blockMode: "card" });

    expect(
      screen.getByRole("heading", { level: 1, name: "Founder Workspace Access Restricted" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Student Dashboard" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByRole("heading", { name: "Founder Workspace" })).not.toBeInTheDocument();
  });

  it("allows Karthik by email to access /slack", () => {
    const karthikSession = fakeSession({
      email: "kk.chinthalapati@gmail.com",
      id: "u-karthik",
    });
    renderGuarded("/slack", { session: karthikSession });

    expect(
      screen.getByRole("heading", { level: 1, name: "Founder Workspace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Confidential Strategy & Operations")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Student Dashboard" })).not.toBeInTheDocument();
  });

  it("allows Nirav by email to access /slack/strategy", () => {
    const niravSession = fakeSession({
      email: "nirav@learnora.dev",
      id: "u-nirav",
    });
    renderGuarded("/slack/strategy", { session: niravSession });

    expect(
      screen.getByRole("heading", { level: 1, name: "Founder Workspace" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("allows founder by ID even when email is missing or generic", () => {
    const founderSession = fakeSession({
      id: "00000000-0000-4000-8000-000000000001",
      email: undefined,
    });
    renderGuarded("/slack", { session: founderSession });

    expect(
      screen.getByRole("heading", { level: 1, name: "Founder Workspace" }),
    ).toBeInTheDocument();
  });

  it("renders wrapped children directly when passed children prop", () => {
    const karthikSession = fakeSession({ email: "kk.chinthalapati@gmail.com" });
    renderWithAuth(
      <MemoryRouter initialEntries={["/custom"]}>
        <Routes>
          <Route
            path="/custom"
            element={
              <FounderGate>
                <div data-testid="custom-child">Direct Child Content</div>
              </FounderGate>
            }
          />
        </Routes>
      </MemoryRouter>,
      { session: karthikSession },
    );

    expect(screen.getByTestId("custom-child")).toHaveTextContent("Direct Child Content");
  });
});
