import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { VerifyView } from "./VerifyView";

function renderVerify({
  session,
  loading = false,
}: {
  session?: ReturnType<typeof fakeSession>;
  loading?: boolean;
} = {}) {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/verify"]}>
      <Routes>
        <Route path="/verify" element={<VerifyView />} />
        <Route path="/" element={<h1>Dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
    { session: session ?? null, loading },
  );
}

describe("VerifyView", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the confirmation screen while the token is being exchanged", () => {
    renderVerify();

    expect(
      screen.getByRole("heading", { level: 1, name: "Account verified!" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Taking you to your dashboard now…"),
    ).toHaveAttribute("role", "status");
  });

  it("moves the user on as soon as the session lands", () => {
    renderVerify({ session: fakeSession() });

    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("gives up on a link that never produces a session", () => {
    /* Fake timers are safe in this one file, where the ledger warns them off
       view tests generally: nothing here touches TanStack Query, MSW or
       userEvent — the only thing being advanced is the view's own deadline. */
    vi.useFakeTimers();
    renderVerify();

    act(() => vi.advanceTimersByTime(9000));

    expect(
      screen.getByRole("heading", { level: 1, name: "Link expired" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to sign in" }),
    ).toHaveAttribute("href", "/login");
  });

  it("does not call a link expired while the session is still resolving", () => {
    vi.useFakeTimers();
    renderVerify({ loading: true });

    act(() => vi.advanceTimersByTime(9000));

    /* `loading` means AuthProvider has not finished reading stored state yet.
       Declaring the link dead at that point would strand a user whose session
       was about to resolve one tick later. */
    expect(
      screen.getByRole("heading", { level: 1, name: "Account verified!" }),
    ).toBeInTheDocument();
  });
});
