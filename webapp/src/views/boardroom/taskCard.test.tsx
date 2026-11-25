import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { agents, KARTHIK, NIRAV } from "../../lib/boardroom/fixtures";
import type { AgentTask } from "../../lib/boardroom/types";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { TaskCard } from "./TaskCard";

/* Which buttons a task card offers, for each state and each person. The database
 * enforces the same rules (boardroom.integrity.sql.test.ts); this keeps the screen
 * from offering a move that would only be refused. */

const api = vi.hoisted(() => ({
  failTask: vi.fn(async () => undefined),
  retryTask: vi.fn(async () => undefined),
  cancelTask: vi.fn(async () => undefined),
  taskStarted: vi.fn(async () => undefined),
}));
vi.mock("../../api/boardroom", () => ({ boardroomApi: { ...api, snapshot: async () => ({}) } }));

const claudeNirav = agents.find((a) => a.id === "a-cn")!;
const task = (over: Partial<AgentTask>): AgentTask => ({
  id: "k1", workspace_id: "w", thread_id: "t1", agent_id: "a-cn", owner_id: NIRAV, created_by: KARTHIK,
  trigger_message_id: "m1", proposal_id: null, snapshot_id: "s1", mode: "independent", round: 1,
  prompt: "SERVER PROMPT", prompt_hash: "0123456789abcdef", prompt_version: 2, request: "q", attempt: 1,
  status: "awaiting_owner", created_at: "2026-11-08T10:00:00Z", started_at: null, submitted_at: null,
  response_message_id: null, error: null, ...over,
});

function show(t: AgentTask, userId: string, isFounder = false) {
  return renderWithAuth(
    <TaskCard task={t} agent={claudeNirav} ownerName="Nirav" requesterName="Karthik" userId={userId} isFounder={isFounder} priorTexts={[]} onChanged={() => {}} />,
    { session: fakeSession({ id: userId }) },
    { withRouter: true },
  );
}
const buttons = () => screen.queryAllByRole("button").map((b) => b.textContent);

describe("TaskCard buttons", () => {
  it("Retry exists only on a failed task, and only for people the database lets retry", () => {
    for (const status of ["awaiting_owner", "in_progress", "published", "cancelled"] as const) {
      const { unmount } = show(task({ status }), NIRAV, true);
      expect(buttons(), status).not.toContain("Retry");
      unmount();
    }
    const failed = task({ status: "failed", error: "Claude usage limit reached" });
    let view = show(failed, KARTHIK);
    expect(buttons()).toContain("Retry"); // the requester
    view.unmount();
    view = show(failed, "u-mia");
    expect(buttons()).not.toContain("Retry"); // an uninvolved member
    view.unmount();
    view = show(failed, "u-mia", true);
    expect(buttons()).toContain("Retry"); // a founder
  });

  it("a failed task shows who reported the problem and why", () => {
    show(task({ status: "failed", error: "Claude usage limit reached" }), KARTHIK);
    expect(screen.getByText(/Nirav reported a problem: Claude usage limit reached/)).toBeInTheDocument();
    expect(screen.getByText(/failed/)).toBeInTheDocument();
  });

  it("Cancel is offered on open tasks to the owner, the requester and founders, not to other members or on finished tasks", () => {
    let view = show(task({}), "u-mia");
    expect(buttons()).not.toContain("Cancel");
    view.unmount();
    view = show(task({}), KARTHIK);
    expect(buttons()).toContain("Cancel");
    view.unmount();
    view = show(task({ status: "in_progress" }), NIRAV);
    expect(buttons()).toContain("Cancel");
    view.unmount();
    for (const status of ["published", "cancelled", "failed"] as const) {
      view = show(task({ status }), NIRAV, true);
      expect(buttons(), status).not.toContain("Cancel");
      view.unmount();
    }
  });

  it("only the account owner can report a problem or start the task", () => {
    let view = show(task({}), KARTHIK);
    expect(buttons()).not.toContain("Report a problem");
    expect(buttons()).not.toContain("Mark started");
    view.unmount();
    view = show(task({}), NIRAV);
    expect(buttons()).toContain("Report a problem");
    expect(buttons()).toContain("Mark started");
    view.unmount();
    view = show(task({ status: "in_progress", started_at: "2026-11-08T10:01:00Z" }), NIRAV);
    expect(buttons()).not.toContain("Mark started"); // already running
  });

  it("reporting a problem sends the owner's reason and nothing else", async () => {
    const user = userEvent.setup();
    show(task({}), NIRAV);
    await user.click(screen.getByRole("button", { name: "Report a problem" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "till 5pm");
    await user.click(within(dialog).getByRole("button", { name: "Mark as failed" }));
    expect(api.failTask).toHaveBeenCalledWith("k1", "I ran out of usage on my subscription: till 5pm");
  });

  it("shows who asked, the prompt's fingerprint and the attempt number", () => {
    show(task({ attempt: 3 }), NIRAV);
    expect(screen.getByTestId("task-provenance")).toHaveTextContent("Requested by Karthik · prompt fingerprint 0123456789ab · attempt 3");
  });
});
