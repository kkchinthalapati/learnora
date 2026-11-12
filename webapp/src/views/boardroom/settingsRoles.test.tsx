import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KARTHIK, NIRAV } from "../../lib/boardroom/fixtures";
import type { FounderRequest, Member } from "../../lib/boardroom/types";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { SettingsSection } from "./SettingsSection";

/* The database is the authority on roles (see boardroom.governance.sql.test.ts): a member
 * becomes a founder only when every founder approves, a founder can step down, nobody can
 * demote another founder. This checks the Settings screen offers only moves the database
 * will accept, asks for confirmation before stepping down, and says when decisions are paused. */

const state = vi.hoisted(() => ({
  members: [] as unknown[],
  requests: [] as unknown[],
  restricted: false,
  api: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock("../../api/boardroom", () => {
  state.api = {
    stepDown: vi.fn(async () => undefined),
    requestFounder: vi.fn(async () => "r1"),
    approveFounder: vi.fn(async () => undefined),
    closeFounderRequest: vi.fn(async () => undefined),
  };
  return {
    boardroomApi: {
      workspaces: async () => [{ id: "w", name: "Boardroom", created_at: "", governance_restricted: state.restricted }],
      members: async () => structuredClone(state.members),
      founderRequests: async () => structuredClone(state.requests),
      audit: async () => [],
      inviteCode: async () => "ABCDEF123456",
      rotateCode: async () => "ZZZZZZ999999",
      updateMe: async () => undefined,
      ...state.api,
    },
  };
});

const member = (id: string, name: string, role: Member["role"]): Member => ({
  workspace_id: "w", user_id: id, display_name: name, role, muted_kinds: [],
});

function renderAs(userId: string) {
  return renderWithAuth(<SettingsSection ws="w" />, { session: fakeSession({ id: userId }) }, { withRouter: true });
}

beforeEach(() => {
  for (const fn of Object.values(state.api)) fn.mockClear();
  state.restricted = false;
  state.requests = [];
  state.members = [member(KARTHIK, "Karthik", "founder"), member(NIRAV, "Nirav", "founder"), member("u-mia", "Mia", "member")];
});

describe("Boardroom settings: founders", () => {
  it("offers no way to demote another founder, and no direct 'make founder'", async () => {
    renderAs(KARTHIK);
    await screen.findByText("Mia");
    expect(screen.queryByRole("button", { name: /make member/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^make founder$/i })).toBeNull();
    expect(screen.getAllByRole("button", { name: /step down as founder/i })).toHaveLength(1); // only on your own row
  });

  it("asks for confirmation before a founder steps down, and can be cancelled", async () => {
    const user = userEvent.setup();
    renderAs(NIRAV);
    await user.click(await screen.findByRole("button", { name: /step down as founder/i }));
    expect(state.api.stepDown).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: /confirm stepping down/i });
    expect(dialog).toHaveTextContent(/no decision can become final/i); // two founders: stepping down pauses decisions
    await user.click(within(dialog).getByRole("button", { name: /keep being a founder/i }));
    expect(state.api.stepDown).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /step down as founder/i }));
    await user.click(screen.getByRole("button", { name: /yes, step down/i }));
    expect(state.api.stepDown).toHaveBeenCalledWith("w", NIRAV);
  });

  it("a founder can ask for a member to be made a founder, which sends a request rather than promoting", async () => {
    const user = userEvent.setup();
    renderAs(KARTHIK);
    await user.click(await screen.findByRole("button", { name: /ask to make founder/i }));
    expect(state.api.requestFounder).toHaveBeenCalledWith("w", "u-mia");
  });

  it("shows a pending request with who approved, lets the other founder approve or decline, and hides Approve once you have", async () => {
    const user = userEvent.setup();
    const request: FounderRequest = {
      id: "r1", workspace_id: "w", candidate_id: "u-mia", requested_by: KARTHIK, status: "pending", created_at: "", approvals: [KARTHIK],
    };
    state.requests = [request];
    const { unmount } = renderAs(NIRAV);
    const row = await screen.findByTestId("founder-request");
    expect(row).toHaveTextContent("Mia: approved by Karthik (1 of 2 founders)");
    expect(screen.queryByRole("button", { name: /ask to make founder/i })).toBeNull(); // already pending
    await user.click(within(row).getByRole("button", { name: /approve/i }));
    expect(state.api.approveFounder).toHaveBeenCalledWith("r1");
    await user.click(within(row).getByRole("button", { name: /decline/i }));
    expect(state.api.closeFounderRequest).toHaveBeenCalledWith("r1");
    unmount();
    renderAs(KARTHIK);
    const mine = await screen.findByTestId("founder-request");
    expect(within(mine).queryByRole("button", { name: /^approve$/i })).toBeNull(); // Karthik already approved
  });

  it("says plainly when decisions are paused for lack of founders", async () => {
    state.restricted = true;
    state.members = [member(KARTHIK, "Karthik", "founder"), member("u-mia", "Mia", "member")];
    renderAs(KARTHIK);
    expect(await screen.findByTestId("governance-restricted")).toHaveTextContent(/fewer than two active founders/i);
  });

  it("states the accounts-versus-people limit", async () => {
    renderAs(KARTHIK);
    expect(await screen.findByText(/counted as accounts, not people/i)).toBeInTheDocument();
  });

  it("shows a member no role controls at all", async () => {
    renderAs("u-mia");
    await screen.findByText("Karthik");
    expect(screen.queryByRole("button", { name: /ask to make founder|step down|make member/i })).toBeNull();
  });
});
