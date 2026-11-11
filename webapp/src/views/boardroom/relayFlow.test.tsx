import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { agents, decision as makeDecision, members, thread, KARTHIK, NIRAV } from "../../lib/boardroom/fixtures";
import type { AgentTask, Message } from "../../lib/boardroom/types";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { ThreadView } from "./ThreadView";

/* The relay end to end from the screen's side: a mention stores the human
 * message and prepares a task, with NO AI answer; only the account owner can
 * paste the answer; it appears verbatim, attributed to the profile, its owner
 * and its submitter. The database is replaced by an in-memory stand-in that
 * mimics the rules of the SQL functions, so this proves the client behaves
 * correctly against those rules. It does not prove the SQL or RLS, which need
 * a live database (see WAITINGONLEDGER.md). */

const db = vi.hoisted(() => ({
  messages: [] as unknown[],
  tasks: [] as unknown[],
  snapshots: [] as { id: string; content: string }[],
  postWithTasks: undefined as unknown as ReturnType<typeof vi.fn>,
  disabled: new Set<string>(),
  submit: undefined as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("../../api/boardroom", async () => {
  const fx = await import("../../lib/boardroom/fixtures");
  const reject = (m: string) => Promise.reject(new Error(m));
  /* Stand-in for boardroom_post_with_tasks: the message and one task per profile, together or not at all.
     The prompt is the server's, so the stand-in writes one the client could not have. */
  db.postWithTasks = vi.fn(async (input: Record<string, unknown>) => {
    const agentIds = input.agents as string[];
    const chosen = agentIds.map((id) => fx.agents.find((a) => a.id === id)!);
    const off = chosen.find((a) => db.disabled.has(a.id));
    if (off) return reject(off.display_name + " is switched off");
    const messageId = "h-" + (db.messages.length + 1);
    (db.messages as Message[]).push({
      id: messageId, workspace_id: "w", thread_id: "t1", author_type: "human", author_id: fx.KARTHIK, agent_id: null,
      submitted_by: null, content: input.content as string, reply_to: null, attachments: [], status: "posted",
      source_task_id: null, round_label: null, system_kind: null, created_at: "2026-11-08T10:04:00Z", edited_at: null,
    });
    const snap = "snap-" + (db.snapshots.length + 1);
    db.snapshots.push({ id: snap, content: input.context as string });
    const taskIds = chosen.map((agent) => {
      const id = "task-" + (db.tasks.length + 1);
      (db.tasks as AgentTask[]).push({
        id, workspace_id: "w", thread_id: "t1", agent_id: agent.id, owner_id: agent.owner_id, created_by: fx.KARTHIK,
        trigger_message_id: messageId, proposal_id: null, snapshot_id: snap, mode: input.mode as AgentTask["mode"],
        round: 1, prompt: "SERVER PROMPT for " + agent.display_name + ", requested by Karthik", prompt_hash: "abcdef0123456789abcdef",
        prompt_version: 2, request: input.content as string, attempt: 1, status: "awaiting_owner",
        created_at: "2026-11-08T10:05:00Z", started_at: null, submitted_at: null, response_message_id: null, error: null,
      });
      return id;
    });
    return { messageId, taskIds };
  });
  db.submit = vi.fn(async (taskId: string, content: string) => {
    const task = (db.tasks as AgentTask[]).find((t) => t.id === taskId)!;
    if (task.status === "published") return reject("a response was already submitted for this task");
    const id = `m-${db.messages.length + 1}`;
    (db.messages as Message[]).push({
      id, workspace_id: "w", thread_id: "t1", author_type: "ai", author_id: null, agent_id: task.agent_id,
      submitted_by: fx.NIRAV, content, reply_to: task.trigger_message_id, attachments: [], status: "posted",
      source_task_id: task.id, round_label: "Round 1 · independent", system_kind: null,
      created_at: "2026-11-08T10:09:00Z", edited_at: null,
    });
    task.status = "published";
    return id;
  });
  const api = {
    members: async () => fx.members,
    agents: async () => fx.agents,
    threads: async () => [fx.thread],
    tasks: async () => structuredClone(db.tasks),
    documents: async () => [],
    proposals: async () => [],
    decisions: async () => [],
    attachedDocuments: async () => [],
    reactions: async () => [],
    messages: async () => structuredClone(db.messages),
    recentMessages: async () => structuredClone(db.messages),
    post: vi.fn(async (input: { content: string; replyTo?: string | null }) => {
      const id = `h-${db.messages.length + 1}`;
      (db.messages as Message[]).push({
        id, workspace_id: "w", thread_id: "t1", author_type: "human", author_id: fx.KARTHIK, agent_id: null,
        submitted_by: null, content: input.content, reply_to: null, attachments: [], status: "posted",
        source_task_id: null, round_label: null, system_kind: null, created_at: "2026-11-08T10:04:00Z", edited_at: null,
      });
      return id;
    }),
    postWithTasks: db.postWithTasks,
    submitResponse: db.submit,
    taskStarted: vi.fn(async () => undefined),
    snapshot: async (id: string) => ({ id, content: db.snapshots.find((s) => s.id === id)?.content ?? "", manifest: { documents: [], decisions: [], messages: { count: 0, first: null, last: null, ids: [] }, excludedAiMessages: true, opinionIds: [], attachments: [], characters: 0 }, content_hash: "abcdef1234567890", thread_id: "t1", created_at: "" }),
    edits: async () => [],
    toggleReaction: async () => undefined,
    updateThread: async () => undefined,
    attachDocument: async () => undefined,
  };
  return { boardroomApi: api, MESSAGE_PAGE: 40, likePattern: (s: string) => s };
});

function renderAs(userId: string) {
  return renderWithAuth(<ThreadView ws="w" threadId={thread.id} />, { session: fakeSession({ id: userId }) }, { withRouter: true });
}

beforeEach(() => {
  db.messages = [];
  db.tasks = [];
  db.snapshots = [];
  db.postWithTasks.mockClear();
  db.disabled.clear();
  db.submit.mockClear();
});

describe("Boardroom relay", () => {
  it("a mention stores the message and prepares a prompt, and never fabricates an AI answer", async () => {
    const user = userEvent.setup();
    renderAs(KARTHIK);
    const box = await screen.findByRole("combobox", { name: "Message" });
    await user.type(box, "@Claude (Nirav) should we move off Supabase?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(db.postWithTasks).toHaveBeenCalledTimes(1));
    const call = db.postWithTasks.mock.calls[0][0];
    expect(call.agents).toEqual(["a-cn"]);
    expect(call.mode).toBe("independent");
    expect(call.content).toBe("@Claude (Nirav) should we move off Supabase?");
    // The browser sends the question and the context it assembled, never prompt text.
    expect(call).not.toHaveProperty("prompt");
    expect(call.context).toContain(thread.title);

    const card = await screen.findByTestId("agent-task");
    expect(within(card).getByText(/Waiting for Nirav/)).toBeInTheDocument();
    // Karthik is not the account owner: no way to submit Nirav's answer.
    expect(within(card).queryByRole("button", { name: "Submit response" })).toBeNull();
    // And no AI-authored message exists.
    expect(document.querySelector('[data-author="ai"]')).toBeNull();
  });

  it("two mentions make two separate tasks sharing one context snapshot", async () => {
    const user = userEvent.setup();
    renderAs(KARTHIK);
    const box = await screen.findByRole("combobox", { name: "Message" });
    await user.type(box, "@Claude (Nirav) @ChatGPT (Karthik) is Firebase better?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(db.postWithTasks).toHaveBeenCalledTimes(1)); // ONE call: message and both tasks together
    expect(db.postWithTasks.mock.calls[0][0].agents).toEqual(["a-cn", "a-gk"]);
    const [t1, t2] = db.tasks as AgentTask[];
    expect(t1.snapshot_id).toBe(t2.snapshot_id);
    expect(t1.prompt).not.toBe(t2.prompt);
    expect((await screen.findAllByTestId("agent-task")).length).toBe(2);
  });

  it("if a task cannot be created nothing is stored and the text stays in the box", async () => {
    const user = userEvent.setup();
    db.disabled.add("a-cn");
    renderAs(KARTHIK);
    const box = await screen.findByRole("combobox", { name: "Message" });
    await user.type(box, "@Claude (Nirav) are you there?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/switched off/);
    expect(box).toHaveValue("@Claude (Nirav) are you there?");
    expect(db.messages).toHaveLength(0);
    expect(db.tasks).toHaveLength(0);
    expect(screen.queryByTestId("agent-task")).toBeNull();
  });

  it("the task card says who asked and shows the prompt's fingerprint, and only offers what the person may do", async () => {
    const user = userEvent.setup();
    const first = renderAs(KARTHIK);
    await user.type(await screen.findByRole("combobox", { name: "Message" }), "@Claude (Nirav) hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    const card = await screen.findByTestId("agent-task");
    expect(within(card).getByTestId("task-provenance")).toHaveTextContent("Requested by Karthik · prompt fingerprint abcdef012345");
    expect(within(card).getByRole("button", { name: "Cancel" })).toBeInTheDocument(); // the requester may cancel
    expect(within(card).queryByRole("button", { name: "Retry" })).toBeNull(); // nothing has failed
    expect(within(card).queryByRole("button", { name: "Report a problem" })).toBeNull(); // only Nirav, whose account it is
    first.unmount();
    renderAs(NIRAV);
    const mine = await screen.findByTestId("agent-task");
    expect(within(mine).getByRole("button", { name: "Report a problem" })).toBeInTheDocument();
  });

  it("a bare @Claude must be resolved before sending", async () => {
    const user = userEvent.setup();
    renderAs(KARTHIK);
    const box = await screen.findByRole("combobox", { name: "Message" });
    await user.type(box, "@Claude thoughts?");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Claude (Nirav)" }));
    expect(box).toHaveValue("@Claude (Nirav) thoughts?");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  it("the account owner pastes the answer, which appears verbatim with full attribution", async () => {
    const user = userEvent.setup();
    const first = renderAs(KARTHIK);
    await user.type(await screen.findByRole("combobox", { name: "Message" }), "@Claude (Nirav) migrate?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByTestId("agent-task");
    first.unmount();

    renderAs(NIRAV);
    const card = await screen.findByTestId("agent-task");
    await user.click(within(card).getByRole("button", { name: "Submit response" }));
    const answer = "  Stay on Supabase.\n\n- Reason one\n- <b>Reason</b> two  ";
    const dialog = await screen.findByRole("dialog");
    const field = within(dialog).getByRole("textbox", { name: /response/i });
    await user.click(field);
    await user.paste(answer);
    const publish = within(dialog).getByRole("button", { name: "Publish to discussion" });
    expect(publish).toBeDisabled(); // must confirm it is the unedited answer
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(publish);

    await waitFor(() => expect(db.submit).toHaveBeenCalledTimes(1));
    expect(db.submit.mock.calls[0][1]).toBe(answer); // byte for byte, no trimming or rewriting
    const msg = await waitFor(() => {
      const el = document.querySelector('[data-author="ai"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(msg).toHaveTextContent("Claude (Nirav)");
    expect(msg).toHaveTextContent("subscription of Nirav");
    expect(msg).toHaveTextContent("pasted by Nirav");
    expect(msg.querySelector("b")).toBeNull(); // markup in an AI answer is text, not HTML
  });

  it("keeps the pasted text when the submission is refused", async () => {
    const user = userEvent.setup();
    const first = renderAs(KARTHIK);
    await user.type(await screen.findByRole("combobox", { name: "Message" }), "@Claude (Nirav) hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByTestId("agent-task");
    first.unmount();

    (db.tasks as AgentTask[])[0].status = "published"; // someone else got there first
    db.submit.mockImplementationOnce(async () => {
      throw new Error("a response was already submitted for this task");
    });
    (db.tasks as AgentTask[])[0].status = "awaiting_owner";
    renderAs(NIRAV);
    const card = await screen.findByTestId("agent-task");
    await user.click(within(card).getByRole("button", { name: "Submit response" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("textbox", { name: /response/i }));
    await user.paste("My careful answer");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Publish to discussion" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/already submitted/);
    expect(within(dialog).getByRole("textbox", { name: /response/i })).toHaveValue("My careful answer");
  });

  it("does not claim a prompt was copied when the clipboard fails", async () => {
    const user = userEvent.setup();
    const first = renderAs(KARTHIK);
    await user.type(await screen.findByRole("combobox", { name: "Message" }), "@Claude (Nirav) hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByTestId("agent-task");
    first.unmount();

    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) }, configurable: true });
    document.execCommand = vi.fn(() => false);
    renderAs(NIRAV);
    const card = await screen.findByTestId("agent-task");
    await user.click(within(card).getByRole("button", { name: "Copy prompt" }));
    expect(await within(card).findByText(/Couldn't copy automatically/)).toBeInTheDocument();
    expect(within(card).queryByText(/Prompt copied/)).toBeNull();
    expect(within(card).getByRole("textbox", { name: "Full prompt" })).toBeInTheDocument();
  });
});

describe("fixtures sanity", () => {
  it("has the four subscription profiles across two founders", () => {
    expect(agents.map((a) => a.display_name)).toEqual(["Claude (Karthik)", "ChatGPT (Karthik)", "Claude (Nirav)", "ChatGPT (Nirav)"]);
    expect(members).toHaveLength(2);
    expect(makeDecision("x").status).toBe("final");
  });
});
