import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { InviteGate } from "./InviteGate";

describe("InviteGate", () => {
  let replaceSpy: ReturnType<typeof vi.fn>;
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    replaceSpy = vi.fn();
    /* jsdom's `window.location` doesn't allow spying on `replace` directly
       (its properties aren't configurable) — replacing the whole object is
       the standard workaround. */
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, replace: replaceSpy },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("renders children when the invite-access flag is set", () => {
    localStorage.setItem("learnora_invite_access", "true");

    render(
      <InviteGate>
        <p>The real app</p>
      </InviteGate>,
    );

    expect(screen.getByText("The real app")).toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("redirects to the coming-soon page and renders nothing without the flag", async () => {
    render(
      <InviteGate>
        <p>The real app</p>
      </InviteGate>,
    );

    expect(screen.queryByText("The real app")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(replaceSpy).toHaveBeenCalledWith("/coming-soon.html"),
    );
  });
});
