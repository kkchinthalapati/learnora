/* Row shapes for the Boardroom tables (supabase/migrations/20261108020000_boardroom.sql).
 * Kept in the database's snake_case so a row can be passed straight through
 * without a mapping layer that could drift from the schema. */

export type Provider = "claude" | "chatgpt";
export type MemberRole = "founder" | "member";

export const CATEGORIES = [
  "product",
  "engineering",
  "design",
  "qa",
  "security",
  "business",
  "strategy",
  "research",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const TASK_MODES = [
  "independent",
  "cross_examination",
  "response_to_agent",
  "research_critique",
  "final_synthesis",
  "decision_review",
  "implementation_plan",
  "code_review",
] as const;
export type TaskMode = (typeof TASK_MODES)[number];

/* The real lifecycle (enforced by the database):
 *   awaiting_owner -> in_progress -> published
 *   awaiting_owner | in_progress -> cancelled | failed
 *   failed -> awaiting_owner (retry);  published and cancelled are final. */
export type TaskStatus = "awaiting_owner" | "in_progress" | "published" | "cancelled" | "failed";

export type ProposalStatus =
  | "draft"
  | "under_review"
  | "awaiting_founders"
  | "approved"
  | "rejected"
  | "deferred"
  | "implementing"
  | "completed";

export type DecisionOutcome =
  | "approved"
  | "rejected"
  | "deferred"
  | "partially_approved";
export type DecisionStatus = "pending" | "contested" | "final" | "superseded";

export type ActionStatus =
  | "open"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";
export type ActionPriority = "low" | "medium" | "high" | "urgent";

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
  /** True while fewer than two active founders exist: no decision can become final. */
  governance_restricted: boolean;
}

export interface FounderRequest {
  id: string;
  workspace_id: string;
  candidate_id: string;
  requested_by: string | null;
  status: "pending" | "approved" | "closed";
  created_at: string;
  /** Founders who have approved so far (from boardroom_founder_approvals). */
  approvals: string[];
}

export interface Member {
  workspace_id: string;
  user_id: string;
  display_name: string;
  role: MemberRole;
  muted_kinds: string[];
}

export interface Agent {
  id: string;
  workspace_id: string;
  provider: Provider;
  display_name: string;
  owner_id: string | null;
  native_url: string;
  role: string;
  instructions: string;
  enabled: boolean;
  context_format: "markdown" | "plain" | "xml";
  allowed_modes: TaskMode[];
  may_review_proposals: boolean;
  allow_proxy_submit: boolean;
}

export interface Thread {
  id: string;
  workspace_id: string;
  title: string;
  problem: string;
  category: Category;
  status: "open" | "archived";
  pinned: boolean;
  created_by: string | null;
  created_at: string;
  last_message_at: string;
}

export interface Message {
  id: string;
  workspace_id: string;
  thread_id: string;
  author_type: "human" | "ai" | "system";
  author_id: string | null;
  agent_id: string | null;
  submitted_by: string | null;
  content: string;
  reply_to: string | null;
  attachments: { document_id: string; title: string }[];
  status: "posted" | "edited";
  source_task_id: string | null;
  round_label: string | null;
  system_kind: string | null;
  created_at: string;
  edited_at: string | null;
}

export interface AgentTask {
  id: string;
  workspace_id: string;
  thread_id: string;
  agent_id: string | null;
  owner_id: string | null;
  created_by: string | null;
  trigger_message_id: string | null;
  proposal_id: string | null;
  snapshot_id: string;
  mode: TaskMode;
  round: number;
  prompt: string;
  /** sha256 of the prompt, set when the server built it; the database re-checks it before a task starts. */
  prompt_hash: string | null;
  prompt_version: number;
  /** The member's words that went into the prompt. */
  request: string;
  /** Times this task has been (re)started for its owner; a retry of a failed task adds one. */
  attempt: number;
  status: TaskStatus;
  created_at: string;
  started_at: string | null;
  submitted_at: string | null;
  response_message_id: string | null;
  error: string | null;
}

export interface Snapshot {
  id: string;
  thread_id: string;
  content: string;
  manifest: ContextManifest;
  content_hash: string;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  workspace_id: string;
  slug: string;
  title: string;
  category: string;
  owner_id: string | null;
  archived: boolean;
  current_version: number;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version: number;
  content: string;
  created_at: string;
}

export interface Proposal {
  id: string;
  workspace_id: string;
  thread_id: string | null;
  title: string;
  description: string;
  problem: string;
  solution: string;
  benefits: string;
  risks: string;
  alternatives: string;
  complexity: "unknown" | "small" | "medium" | "large" | "very_large";
  success_criteria: string;
  owner_id: string | null;
  status: ProposalStatus;
  updated_at: string;
}

export interface Review {
  id: string;
  proposal_id: string;
  agent_id: string | null;
  verdict: "support" | "concerns" | "oppose" | "comment";
  message_id: string;
}

export interface Decision {
  id: string;
  workspace_id: string;
  thread_id: string | null;
  proposal_id: string | null;
  title: string;
  outcome: DecisionOutcome;
  rationale: string;
  supporting_arguments: string;
  rejected_alternatives: string;
  known_risks: string;
  implementation_owner: string | null;
  supersedes_id: string | null;
  status: DecisionStatus;
  proposed_by: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface DecisionVote {
  decision_id: string;
  user_id: string;
  vote: DecisionOutcome;
  note: string;
}

export interface ActionItem {
  id: string;
  workspace_id: string;
  decision_id: string | null;
  thread_id: string | null;
  title: string;
  description: string;
  owner_id: string | null;
  priority: ActionPriority;
  status: ActionStatus;
  due_date: string | null;
  completion_notes: string;
  exploratory: boolean;
  link_url: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Notification {
  id: string;
  workspace_id: string;
  kind: string;
  title: string;
  body: string;
  thread_id: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

/** What went into a snapshot, shown to the user beside every prompt. */
export interface ContextManifest {
  documents: {
    id: string;
    slug: string;
    title: string;
    version: number;
    reason: string;
    truncated: boolean;
  }[];
  decisions: { id: string; title: string; outcome: string }[];
  messages: { count: number; first: string | null; last: string | null; ids: string[] };
  excludedAiMessages: boolean;
  /** AI answers handed to the agent in full in the prompt, not in the discussion. */
  opinionIds: string[];
  attachments: string[];
  characters: number;
}
