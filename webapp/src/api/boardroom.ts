import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type {
  ActionItem,
  Agent,
  AgentTask,
  Decision,
  DecisionVote,
  DocumentRow,
  DocumentVersion,
  FounderRequest,
  Member,
  Message,
  Notification,
  Proposal,
  Review,
  Snapshot,
  TaskMode,
  Thread,
  Workspace,
} from "../lib/boardroom/types";

/* The Boardroom's data layer (supabase/migrations/20261108020000_boardroom.sql).
 *
 * Reads are plain selects: row-level security already limits every table to the
 * caller's workspaces. Anything that must not be forgeable — AI answers, system
 * notes, decisions, snapshots, notifications — goes through a SECURITY DEFINER
 * function that checks membership, role and state itself. The client never
 * sends a user id: the database takes it from the session. */

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Escape LIKE wildcards so a search for "100%" is a literal search. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export const MESSAGE_PAGE = 40;

export const boardroomApi = {
  /* ------------------------------------------------------------ workspace */
  async workspaces(): Promise<Workspace[]> {
    return check(
      await supabase.from("boardroom_workspaces").select("id, name, created_at, governance_restricted").order("created_at"),
    );
  },
  async createWorkspace(name: string, displayName: string): Promise<string> {
    return check(await supabase.rpc("boardroom_create_workspace", { p_name: name, p_display_name: displayName }));
  },
  async joinWorkspace(code: string, displayName: string): Promise<string> {
    return check(await supabase.rpc("boardroom_join_workspace", { p_code: code, p_display_name: displayName }));
  },
  async inviteCode(ws: string): Promise<string> {
    return check(await supabase.rpc("boardroom_invite_code", { p_ws: ws }));
  },
  async rotateCode(ws: string): Promise<string> {
    return check(await supabase.rpc("boardroom_rotate_code", { p_ws: ws }));
  },
  /** A founder stepping down themselves. (Promotion is a founder request; nobody demotes another founder.) */
  async stepDown(ws: string, user: string): Promise<void> {
    check(await supabase.rpc("boardroom_set_role", { p_ws: ws, p_user: user, p_role: "member" }));
  },
  async founderRequests(ws: string): Promise<FounderRequest[]> {
    const requests = check<Omit<FounderRequest, "approvals">[]>(
      await supabase
        .from("boardroom_founder_requests")
        .select("id, workspace_id, candidate_id, requested_by, status, created_at")
        .eq("workspace_id", ws)
        .eq("status", "pending")
        .order("created_at"),
    );
    if (requests.length === 0) return [];
    const approvals = check<{ request_id: string; user_id: string }[]>(
      await supabase
        .from("boardroom_founder_approvals")
        .select("request_id, user_id")
        .in("request_id", requests.map((r) => r.id)),
    );
    return requests.map((r) => ({ ...r, approvals: approvals.filter((a) => a.request_id === r.id).map((a) => a.user_id) }));
  },
  async requestFounder(ws: string, user: string): Promise<string> {
    return check(await supabase.rpc("boardroom_request_founder", { p_ws: ws, p_user: user }));
  },
  async approveFounder(request: string): Promise<void> {
    check(await supabase.rpc("boardroom_approve_founder", { p_request: request }));
  },
  async closeFounderRequest(request: string): Promise<void> {
    check(await supabase.rpc("boardroom_close_founder_request", { p_request: request }));
  },
  async members(ws: string): Promise<Member[]> {
    return check(
      await supabase
        .from("boardroom_members")
        .select("workspace_id, user_id, display_name, role, muted_kinds")
        .eq("workspace_id", ws)
        .order("joined_at"),
    );
  },
  async updateMe(ws: string, patch: { display_name?: string; muted_kinds?: string[] }): Promise<void> {
    const me = await requireUserId();
    check(await supabase.from("boardroom_members").update(patch).eq("workspace_id", ws).eq("user_id", me));
  },

  /* --------------------------------------------------------------- agents */
  async agents(ws: string): Promise<Agent[]> {
    return check(
      await supabase.from("boardroom_agents").select("*").eq("workspace_id", ws).order("created_at"),
    );
  },
  async updateAgent(
    id: string,
    patch: Partial<
      Pick<
        Agent,
        | "display_name"
        | "native_url"
        | "role"
        | "instructions"
        | "enabled"
        | "context_format"
        | "allowed_modes"
        | "may_review_proposals"
        | "allow_proxy_submit"
      >
    >,
  ): Promise<void> {
    check(await supabase.from("boardroom_agents").update(patch).eq("id", id));
  },

  /* -------------------------------------------------------------- threads */
  async threads(ws: string): Promise<Thread[]> {
    return check(
      await supabase
        .from("boardroom_threads")
        .select("*")
        .eq("workspace_id", ws)
        .order("pinned", { ascending: false })
        .order("last_message_at", { ascending: false })
        .limit(300),
    );
  },
  async createThread(input: {
    workspace_id: string;
    title: string;
    problem: string;
    category: Thread["category"];
  }): Promise<Thread> {
    return check(await supabase.from("boardroom_threads").insert(input).select("*").single());
  },
  async updateThread(
    id: string,
    patch: Partial<Pick<Thread, "title" | "problem" | "category" | "status" | "pinned">>,
  ): Promise<void> {
    check(await supabase.from("boardroom_threads").update(patch).eq("id", id));
  },

  /* ------------------------------------------------------------- messages */
  async messages(thread: string, limit = MESSAGE_PAGE): Promise<Message[]> {
    const rows = check<Message[]>(
      await supabase
        .from("boardroom_messages")
        .select("*")
        .eq("thread_id", thread)
        .order("created_at", { ascending: false })
        .limit(limit),
    );
    return rows.reverse();
  },
  /** All messages of a thread, oldest first, for context assembly. */
  async recentMessages(thread: string, limit = 60): Promise<Message[]> {
    return boardroomApi.messages(thread, limit);
  },
  async searchMessages(ws: string, term: string): Promise<Message[]> {
    return check(
      await supabase
        .from("boardroom_messages")
        .select("*")
        .eq("workspace_id", ws)
        .neq("author_type", "system")
        .ilike("content", likePattern(term))
        .order("created_at", { ascending: false })
        .limit(40),
    );
  },
  async post(input: {
    thread: string;
    content: string;
    replyTo?: string | null;
    mentions?: string[];
    attachments?: { document_id: string; title: string }[];
  }): Promise<string> {
    return check(
      await supabase.rpc("boardroom_post_message", {
        p_thread: input.thread,
        p_content: input.content,
        p_reply_to: input.replyTo ?? null,
        p_mentions: input.mentions ?? [],
        p_attachments: input.attachments ?? [],
      }),
    );
  },
  async edit(message: string, content: string): Promise<void> {
    check(await supabase.rpc("boardroom_edit_message", { p_message: message, p_content: content }));
  },
  async edits(message: string): Promise<{ previous_content: string; edited_at: string }[]> {
    return check(
      await supabase
        .from("boardroom_message_edits")
        .select("previous_content, edited_at")
        .eq("message_id", message)
        .order("edited_at"),
    );
  },
  async reactions(messageIds: string[]): Promise<{ message_id: string; user_id: string; emoji: string }[]> {
    if (messageIds.length === 0) return [];
    return check(
      await supabase.from("boardroom_reactions").select("message_id, user_id, emoji").in("message_id", messageIds),
    );
  },
  async toggleReaction(ws: string, message: string, emoji: string, on: boolean): Promise<void> {
    const me = await requireUserId();
    if (on) {
      check(
        await supabase
          .from("boardroom_reactions")
          // Insert-only: the table grants clients no UPDATE, and a repeated reaction is a no-op.
          .upsert(
            { message_id: message, workspace_id: ws, user_id: me, emoji },
            { onConflict: "message_id,user_id,emoji", ignoreDuplicates: true },
          ),
      );
    } else {
      check(
        await supabase
          .from("boardroom_reactions")
          .delete()
          .eq("message_id", message)
          .eq("user_id", me)
          .eq("emoji", emoji),
      );
    }
  },

  /* ----------------------------------------------------------- relay tasks */
  async tasks(ws: string, thread?: string): Promise<AgentTask[]> {
    let q = supabase.from("boardroom_agent_tasks").select("*").eq("workspace_id", ws);
    if (thread) q = q.eq("thread_id", thread);
    return check(await q.order("created_at", { ascending: false }).limit(200));
  },
  async snapshot(id: string): Promise<Snapshot> {
    return check(await supabase.from("boardroom_context_snapshots").select("*").eq("id", id).single());
  },
  /** One task per profile, in one transaction. The server builds every prompt; the client sends only
   *  the question, the profiles, the task type and the context it assembled. */
  async createTasks(input: {
    thread: string;
    agents: string[];
    trigger: string | null;
    mode: TaskMode;
    /** Used only when there is no `trigger` message. */
    request: string;
    context: string;
    manifest: unknown;
    snapshot?: string | null;
    proposal?: string | null;
    round?: number;
  }): Promise<string[]> {
    return check(
      await supabase.rpc("boardroom_create_tasks", {
        p_thread: input.thread,
        p_agents: input.agents,
        p_trigger: input.trigger,
        p_mode: input.mode,
        p_request: input.request,
        p_context: input.context,
        p_manifest: input.manifest,
        p_snapshot: input.snapshot ?? null,
        p_proposal: input.proposal ?? null,
        p_round: input.round ?? 1,
      }),
    );
  },
  /** A message and the tasks its mentions ask for, stored together or not at all. */
  async postWithTasks(input: {
    thread: string;
    content: string;
    replyTo?: string | null;
    mentions?: string[];
    attachments?: { document_id: string; title: string }[];
    agents: string[];
    mode: TaskMode;
    context: string;
    manifest: unknown;
    round?: number;
  }): Promise<{ messageId: string; taskIds: string[] }> {
    const r = check<{ message_id: string; task_ids: string[] }>(
      await supabase.rpc("boardroom_post_with_tasks", {
        p_thread: input.thread,
        p_content: input.content,
        p_reply_to: input.replyTo ?? null,
        p_mentions: input.mentions ?? [],
        p_attachments: input.attachments ?? [],
        p_agents: input.agents,
        p_mode: input.mode,
        p_context: input.context,
        p_manifest: input.manifest,
        p_round: input.round ?? 1,
      }),
    );
    return { messageId: r.message_id, taskIds: r.task_ids };
  },
  /** The account owner reports that a task could not be completed, and why. */
  async failTask(task: string, reason: string): Promise<void> {
    check(await supabase.rpc("boardroom_fail_task", { p_task: task, p_reason: reason }));
  },
  async taskStarted(task: string): Promise<void> {
    check(await supabase.rpc("boardroom_task_started", { p_task: task }));
  },
  async cancelTask(task: string): Promise<void> {
    check(await supabase.rpc("boardroom_cancel_task", { p_task: task }));
  },
  async retryTask(task: string): Promise<void> {
    check(await supabase.rpc("boardroom_retry_task", { p_task: task }));
  },
  async submitResponse(task: string, content: string, verdict?: string | null): Promise<string> {
    return check(
      await supabase.rpc("boardroom_submit_response", {
        p_task: task,
        p_content: content,
        p_verdict: verdict ?? null,
      }),
    );
  },

  /* ------------------------------------------------------------ knowledge */
  async documents(ws: string): Promise<DocumentRow[]> {
    return check(
      await supabase
        .from("boardroom_documents")
        .select("id, workspace_id, slug, title, category, owner_id, archived, current_version, created_at, updated_at")
        .eq("workspace_id", ws)
        .order("slug"),
    );
  },
  async documentsCurrent(ws: string): Promise<(DocumentRow & { content: string })[]> {
    return check(await supabase.rpc("boardroom_documents_current", { p_ws: ws }));
  },
  async documentContent(docId: string, version?: number): Promise<string> {
    let q = supabase
      .from("boardroom_document_versions")
      .select("content")
      .eq("document_id", docId);
    if (version !== undefined) {
      q = q.eq("version", version);
    } else {
      q = q.order("version", { ascending: false }).limit(1);
    }
    const row = check<{ content: string } | null>(await q.maybeSingle());
    return row?.content ?? "";
  },
  async versions(doc: string): Promise<DocumentVersion[]> {
    return check(
      await supabase
        .from("boardroom_document_versions")
        .select("id, document_id, version, content, created_at")
        .eq("document_id", doc)
        .order("version", { ascending: false }),
    );
  },
  async saveDocument(input: {
    ws: string;
    slug: string;
    title: string;
    category: string;
    content: string;
    archived?: boolean;
    expectedVersion?: number;
  }): Promise<string> {
    return check(
      await supabase.rpc("boardroom_save_document", {
        p_ws: input.ws,
        p_slug: input.slug,
        p_title: input.title,
        p_category: input.category,
        p_content: input.content,
        p_archived: input.archived ?? false,
        p_expected_version: input.expectedVersion ?? null,
      }),
    );
  },
  async attachedDocuments(thread: string): Promise<string[]> {
    const rows = check<{ document_id: string }[]>(
      await supabase.from("boardroom_thread_documents").select("document_id").eq("thread_id", thread),
    );
    return rows.map((r) => r.document_id);
  },
  async attachDocument(ws: string, thread: string, doc: string, on: boolean): Promise<void> {
    if (on) {
      const me = await requireUserId();
      check(
        await supabase
          .from("boardroom_thread_documents")
          .upsert(
            { thread_id: thread, document_id: doc, workspace_id: ws, attached_by: me },
            { onConflict: "thread_id,document_id", ignoreDuplicates: true },
          ),
      );
    } else {
      check(await supabase.from("boardroom_thread_documents").delete().eq("thread_id", thread).eq("document_id", doc));
    }
  },

  /* ------------------------------------------------------------ proposals */
  async proposals(ws: string): Promise<Proposal[]> {
    return check(
      await supabase.from("boardroom_proposals").select("*").eq("workspace_id", ws).order("updated_at", { ascending: false }),
    );
  },
  async reviews(ws: string): Promise<Review[]> {
    return check(
      await supabase.from("boardroom_reviews").select("id, proposal_id, agent_id, verdict, message_id").eq("workspace_id", ws),
    );
  },
  async saveProposal(input: {
    id?: string | null;
    ws: string;
    thread?: string | null;
    fields: Partial<Omit<Proposal, "id" | "workspace_id" | "thread_id" | "owner_id" | "status" | "updated_at">>;
  }): Promise<string> {
    return check(
      await supabase.rpc("boardroom_save_proposal", {
        p_id: input.id ?? null,
        p_ws: input.ws,
        p_thread: input.thread ?? null,
        p_fields: input.fields,
      }),
    );
  },
  async setProposalStatus(id: string, status: Proposal["status"]): Promise<void> {
    check(await supabase.rpc("boardroom_set_proposal_status", { p_id: id, p_status: status }));
  },
  async requestMore(proposal: string, kind: "another_round" | "more_evidence", note: string): Promise<void> {
    check(await supabase.rpc("boardroom_request_more", { p_proposal: proposal, p_kind: kind, p_note: note }));
  },

  /* ------------------------------------------------------------ decisions */
  async decisions(ws: string): Promise<Decision[]> {
    return check(
      await supabase.from("boardroom_decisions").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }),
    );
  },
  async votes(ws: string): Promise<DecisionVote[]> {
    return check(
      await supabase.from("boardroom_decision_votes").select("decision_id, user_id, vote, note").eq("workspace_id", ws),
    );
  },
  async proposeDecision(input: {
    thread: string;
    proposal: string | null;
    title: string;
    outcome: Decision["outcome"];
    rationale: string;
    supporting: string;
    rejected: string;
    risks: string;
    implOwner: string | null;
    supersedes: string | null;
  }): Promise<string> {
    return check(
      await supabase.rpc("boardroom_propose_decision", {
        p_thread: input.thread,
        p_proposal: input.proposal,
        p_title: input.title,
        p_outcome: input.outcome,
        p_rationale: input.rationale,
        p_supporting: input.supporting,
        p_rejected: input.rejected,
        p_risks: input.risks,
        p_impl_owner: input.implOwner,
        p_supersedes: input.supersedes,
      }),
    );
  },
  async vote(decision: string, vote: Decision["outcome"], note = ""): Promise<void> {
    check(await supabase.rpc("boardroom_vote_decision", { p_decision: decision, p_vote: vote, p_note: note }));
  },

  /* -------------------------------------------------------------- actions */
  async actions(ws: string): Promise<ActionItem[]> {
    return check(
      await supabase.from("boardroom_action_items").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }),
    );
  },
  async createAction(input: {
    workspace_id: string;
    decision_id: string | null;
    thread_id?: string | null;
    title: string;
    description?: string;
    owner_id?: string | null;
    priority?: ActionItem["priority"];
    due_date?: string | null;
    exploratory?: boolean;
    link_url?: string | null;
  }): Promise<void> {
    check(await supabase.from("boardroom_action_items").insert(input));
  },
  async updateAction(
    id: string,
    patch: Partial<
      Pick<ActionItem, "title" | "description" | "owner_id" | "priority" | "status" | "due_date" | "completion_notes" | "link_url">
    >,
  ): Promise<void> {
    check(await supabase.from("boardroom_action_items").update(patch).eq("id", id));
  },
  async actionComments(action: string): Promise<{ id: string; author_id: string; body: string; created_at: string }[]> {
    return check(
      await supabase
        .from("boardroom_action_comments")
        .select("id, author_id, body, created_at")
        .eq("action_id", action)
        .order("created_at"),
    );
  },
  async addActionComment(ws: string, action: string, body: string): Promise<void> {
    check(await supabase.from("boardroom_action_comments").insert({ workspace_id: ws, action_id: action, body }));
  },

  /* -------------------------------------------------------- notifications */
  async notifications(ws: string): Promise<Notification[]> {
    return check(
      await supabase
        .from("boardroom_notifications")
        .select("*")
        .eq("workspace_id", ws)
        .order("created_at", { ascending: false })
        .limit(80),
    );
  },
  async markRead(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    check(
      await supabase
        .from("boardroom_notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids)
        .is("read_at", null),
    );
  },
  async audit(ws: string, limit = 60): Promise<
    { id: string; actor_id: string | null; action: string; entity_type: string; detail: Record<string, unknown>; created_at: string }[]
  > {
    return check(
      await supabase
        .from("boardroom_audit_log")
        .select("id, actor_id, action, entity_type, detail, created_at")
        .eq("workspace_id", ws)
        .order("created_at", { ascending: false })
        .limit(limit),
    );
  },
};
