import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { supabase } from "../../lib/supabase";
import { dataAdminApi } from "../../api/dataAdmin";
import { AccountTab } from "./AccountTab";

/* Spying on `supabase.auth.updateUser` rather than on the api module keeps
 * api/auth.ts's real error mapping in the path under test — the view has to
 * surface the friendly message, not the raw GoTrue one — while skipping the
 * GoTrue session plumbing that a pure MSW setup would need. Row-level
 * request scoping is already covered by the Step 5 api tests. */
function mockUpdateUser(result: { error?: { message: string } } = {}) {
  return vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
    data: { user: null },
    error: result.error ?? null,
  } as Awaited<ReturnType<typeof supabase.auth.updateUser>>);
}

function renderAccount(fullName = "Ada Lovelace") {
  return renderWithAuth(<AccountTab />, {
    session: fakeSession({ user_metadata: { full_name: fullName } }),
  });
}

describe("AccountTab", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the profile name, email and derived initials", () => {
    renderAccount();
    expect(
      screen.getByRole("heading", { name: "Ada Lovelace" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("student@example.com").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("falls back to Student when the account has no display name", () => {
    renderAccount("");
    expect(
      screen.getByRole("heading", { name: "Student" }),
    ).toBeInTheDocument();
  });

  it("keeps the name form closed until Edit is pressed", async () => {
    const user = userEvent.setup();
    renderAccount();
    expect(screen.queryByRole("textbox", { name: "Display Name" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("textbox", { name: "Display Name" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("rejects an empty display name without calling the API", async () => {
    const user = userEvent.setup();
    const updateUser = mockUpdateUser();
    renderAccount();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox", { name: "Display Name" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Name cannot be empty.",
    );
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("saves a new display name and repaints the heading and initials", async () => {
    const user = userEvent.setup();
    const updateUser = mockUpdateUser();
    renderAccount();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const input = screen.getByRole("textbox", { name: "Display Name" });
    await user.clear(input);
    await user.type(input, "  Grace Hopper  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({
        data: { full_name: "Grace Hopper" },
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Grace Hopper" }),
    ).toBeInTheDocument();
    expect(screen.getByText("GH")).toBeInTheDocument();
    expect(screen.getByText("Display name updated.")).toBeInTheDocument();
    // Form collapses on success.
    expect(screen.queryByRole("textbox", { name: "Display Name" })).toBeNull();
  });

  it("surfaces the mapped API error and keeps the form open", async () => {
    const user = userEvent.setup();
    mockUpdateUser({ error: { message: "rate limit exceeded" } });
    renderAccount();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests. Please wait a minute and try again.",
    );
    expect(
      screen.getByRole("textbox", { name: "Display Name" }),
    ).toBeInTheDocument();
  });

  it("rejects an email with no @ and one identical to the current address", async () => {
    const user = userEvent.setup();
    const updateUser = mockUpdateUser();
    renderAccount();

    await user.click(screen.getByRole("button", { name: "Change" }));
    const input = screen.getByRole("textbox", { name: "Email Address" });

    await user.type(input, "nope");
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please enter a valid email address.",
    );

    await user.clear(input);
    await user.type(input, "student@example.com");
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This is already your current email.",
    );

    expect(updateUser).not.toHaveBeenCalled();
  });

  it("submits a new email and clears the field", async () => {
    const user = userEvent.setup();
    const updateUser = mockUpdateUser();
    renderAccount();

    await user.click(screen.getByRole("button", { name: "Change" }));
    const input = screen.getByRole("textbox", { name: "Email Address" });
    await user.type(input, "grace@example.com");
    await user.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({ email: "grace@example.com" }),
    );
    expect(
      await screen.findByText(/Confirmation email sent to grace@example\.com/),
    ).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("exports only after the confirmation dialog is accepted", async () => {
    const user = userEvent.setup();
    const exportCSV = vi
      .spyOn(dataAdminApi, "exportCSV")
      .mockResolvedValue(undefined);
    renderAccount();

    await user.click(screen.getByRole("button", { name: /Export CSV/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Download a CSV copy");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(exportCSV).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    await user.click(await screen.findByRole("button", { name: "Export" }));

    await waitFor(() => expect(exportCSV).toHaveBeenCalledTimes(1));
  });
});
