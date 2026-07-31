import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { supabase } from "../../lib/supabase";
import { SecurityTab } from "./SecurityTab";

function mockUpdateUser(error: { message: string } | null = null) {
  return vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
    data: { user: null },
    error,
  } as Awaited<ReturnType<typeof supabase.auth.updateUser>>);
}

function mockSignOut(error: { message: string } | null = null) {
  return vi.spyOn(supabase.auth, "signOut").mockResolvedValue({
    error,
  } as Awaited<ReturnType<typeof supabase.auth.signOut>>);
}

function renderSecurity() {
  return renderWithAuth(<SecurityTab />, { session: fakeSession() });
}

describe("SecurityTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the strength meter until something is typed", async () => {
    const user = userEvent.setup();
    renderSecurity();
    expect(screen.queryByText(/Too Weak/)).toBeNull();

    await user.type(screen.getByLabelText("New Password"), "a");

    expect(
      screen.getByText("Too Weak (Need 8+ chars & mix)"),
    ).toBeInTheDocument();
  });

  it("upgrades the strength label as the password improves", async () => {
    const user = userEvent.setup();
    renderSecurity();
    const input = screen.getByLabelText("New Password");

    await user.type(input, "aaaaAAAA");
    expect(screen.getByText("Fair")).toBeInTheDocument();

    await user.type(input, "1!");
    expect(screen.getByText("Strong")).toBeInTheDocument();
  });

  it("toggles password visibility without leaving the tab order", async () => {
    const user = userEvent.setup();
    renderSecurity();
    const input = screen.getByLabelText("New Password");
    expect(input).toHaveAttribute("type", "password");

    const toggle = screen.getAllByRole("button", { name: "Show password" })[0];
    expect(toggle).toHaveAttribute("tabindex", "-1");
    await user.click(toggle);

    expect(input).toHaveAttribute("type", "text");
  });

  it("rejects a short password before calling the API", async () => {
    const user = userEvent.setup();
    const updateUser = mockUpdateUser();
    renderSecurity();

    await user.type(screen.getByLabelText("New Password"), "short");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must be at least 8 characters long.",
    );
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects a mismatched confirmation", async () => {
    const user = userEvent.setup();
    const updateUser = mockUpdateUser();
    renderSecurity();

    await user.type(screen.getByLabelText("New Password"), "longenough1");
    await user.type(
      screen.getByLabelText("Confirm New Password"),
      "different1",
    );
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Passwords do not match. Please re-enter them.",
    );
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("changes the password, clears both fields and drops the meter", async () => {
    const user = userEvent.setup();
    const updateUser = mockUpdateUser();
    mockSignOut();
    renderSecurity();

    const next = screen.getByLabelText("New Password");
    await user.type(next, "longenough1");
    await user.type(
      screen.getByLabelText("Confirm New Password"),
      "longenough1",
    );
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({ password: "longenough1" }),
    );
    expect(
      await screen.findByText(
        "Password updated. Other sessions have been signed out.",
      ),
    ).toBeInTheDocument();
    expect(next).toHaveValue("");
    expect(screen.getByLabelText("Confirm New Password")).toHaveValue("");
    expect(screen.queryByText(/Too Weak|Fair|Good|Strong/)).toBeNull();
  });

  it("explains a same-password rejection in the API layer's words", async () => {
    const user = userEvent.setup();
    mockUpdateUser({
      message: "New password should be different from the old password.",
    });
    renderSecurity();

    await user.type(screen.getByLabelText("New Password"), "longenough1");
    await user.type(
      screen.getByLabelText("Confirm New Password"),
      "longenough1",
    );
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "New password must be different from your current password.",
    );
  });

  it("signs out other sessions only after the danger confirmation", async () => {
    const user = userEvent.setup();
    const signOut = mockSignOut();
    renderSecurity();

    /* The confirm button carries the same label as the trigger, so every
       dialog query is scoped to the dialog itself. */
    await user.click(screen.getByRole("button", { name: "Sign Out Others" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("all other browsers and devices");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(signOut).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sign Out Others" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Sign Out Others",
      }),
    );

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ scope: "others" }),
    );
    expect(
      await screen.findByText("All other sessions have been signed out."),
    ).toBeInTheDocument();
  });
});
