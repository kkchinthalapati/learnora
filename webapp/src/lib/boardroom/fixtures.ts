import type { Agent, Decision, DocumentRow, Member, Message, Thread } from "./types";

/* Shared test data. Lives beside the code but is imported only by tests. */

export const KARTHIK = "u-karthik";
export const NIRAV = "u-nirav";

export const members: Member[] = [
  { workspace_id: "w", user_id: KARTHIK, display_name: "Karthik", role: "founder", muted_kinds: [] },
  { workspace_id: "w", user_id: NIRAV, display_name: "Nirav", role: "founder", muted_kinds: [] },
];

function agent(
  id: string,
  provider: Agent["provider"],
  owner: string,
  name: string,
  extra: Partial<Agent> = {},
): Agent {
  return {
    id,
    workspace_id: "w",
    provider,
    display_name: name,
    owner_id: owner,
    native_url: provider === "claude" ? "https://claude.ai/new" : "https://chatgpt.com/",
    role: "Independent technical advisor",
    instructions: "",
    enabled: true,
    context_format: "markdown",
    allowed_modes: [],
    may_review_proposals: true,
    allow_proxy_submit: false,
    ...extra,
  };
}

export const agents: Agent[] = [
  agent("a-ck", "claude", KARTHIK, "Claude (Karthik)"),
  agent("a-gk", "chatgpt", KARTHIK, "ChatGPT (Karthik)"),
  agent("a-cn", "claude", NIRAV, "Claude (Nirav)"),
  agent("a-gn", "chatgpt", NIRAV, "ChatGPT (Nirav)"),
];

export const thread: Thread = {
  id: "t1",
  workspace_id: "w",
  title: "Supabase to Firebase?",
  problem: "Usage limit ran out; consider migrating the backend.",
  category: "engineering",
  status: "open",
  pinned: false,
  created_by: KARTHIK,
  created_at: "2026-11-08T10:00:00Z",
  last_message_at: "2026-11-08T10:00:00Z",
};

export function msg(
  id: string,
  type: Message["author_type"],
  content: string,
  extra: Partial<Message> = {},
): Message {
  return {
    id,
    workspace_id: "w",
    thread_id: "t1",
    author_type: type,
    author_id: type === "human" ? KARTHIK : null,
    agent_id: type === "ai" ? "a-cn" : null,
    submitted_by: type === "ai" ? NIRAV : null,
    content,
    reply_to: null,
    attachments: [],
    status: "posted",
    source_task_id: type === "ai" ? "task" : null,
    round_label: null,
    system_kind: null,
    created_at: `2026-11-08T10:0${id.length}:00Z`,
    edited_at: null,
    ...extra,
  };
}

export function doc(id: string, slug: string, category: string, extra: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id,
    workspace_id: "w",
    slug,
    title: slug,
    category,
    owner_id: KARTHIK,
    archived: false,
    current_version: 1,
    updated_at: "2026-11-08T00:00:00Z",
    ...extra,
  };
}

export function decision(id: string, extra: Partial<Decision> = {}): Decision {
  return {
    id,
    workspace_id: "w",
    thread_id: "t1",
    proposal_id: null,
    title: `Decision ${id}`,
    outcome: "approved",
    rationale: "because",
    supporting_arguments: "",
    rejected_alternatives: "",
    known_risks: "",
    implementation_owner: null,
    supersedes_id: null,
    status: "final",
    proposed_by: KARTHIK,
    created_at: "2026-11-01T00:00:00Z",
    decided_at: "2026-11-01T00:00:00Z",
    ...extra,
  };
}
