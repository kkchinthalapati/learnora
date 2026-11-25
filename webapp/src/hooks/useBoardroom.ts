import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boardroomApi, MESSAGE_PAGE } from "../api/boardroom";
import { supabase } from "../lib/supabase";
import { Storage } from "../lib/storage";
import { useAuth } from "../context/auth";
import type { Message, TaskMode } from "../lib/boardroom/types";

export const brKeys = {
  workspaces: ["boardroom", "workspaces"] as const,
  ws: (ws: string, part: string, ...rest: (string | number)[]) =>
    ["boardroom", ws, part, ...rest] as const,
};

const WS_KEY = "learnora:boardroom:workspace";

/** The workspace the Boardroom is showing: the remembered one if still a member, else the first. */
export function useWorkspaces() {
  return useQuery({ queryKey: brKeys.workspaces, queryFn: boardroomApi.workspaces });
}

export function useActiveWorkspace() {
  const q = useWorkspaces();
  const workspace = useMemo(() => {
    const list = q.data ?? [];
    const remembered = Storage.get<string | null>(WS_KEY, null);
    return list.find((w) => w.id === remembered) ?? list[0] ?? null;
  }, [q.data]);
  return { ...q, workspace };
}

export function useBoardroomIdentity(ws: string | undefined) {
  const { user } = useAuth();
  const members = useMembers(ws);
  const me = members.data?.find((m) => m.user_id === user?.id) ?? null;
  return { userId: user?.id ?? null, me, isFounder: me?.role === "founder", members: members.data ?? [] };
}

const on = (ws: string | undefined) => ({ enabled: !!ws });

export function useMembers(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "members"), queryFn: () => boardroomApi.members(ws!), ...on(ws) });
}
export function useAgents(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "agents"), queryFn: () => boardroomApi.agents(ws!), ...on(ws) });
}
export function useThreads(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "threads"), queryFn: () => boardroomApi.threads(ws!), ...on(ws) });
}
export function useTasks(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "tasks"), queryFn: () => boardroomApi.tasks(ws!), ...on(ws) });
}
export function useDocuments(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "documents"), queryFn: () => boardroomApi.documents(ws!), ...on(ws) });
}
export function useDocumentContent(ws: string | undefined, docId: string | undefined, version?: number) {
  return useQuery({
    queryKey: brKeys.ws(ws ?? "", "document-content", docId ?? "", version ?? "latest"),
    queryFn: () => boardroomApi.documentContent(docId!, version),
    enabled: !!ws && !!docId,
  });
}
export function useProposals(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "proposals"), queryFn: () => boardroomApi.proposals(ws!), ...on(ws) });
}
export function useReviews(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "reviews"), queryFn: () => boardroomApi.reviews(ws!), ...on(ws) });
}
export function useDecisions(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "decisions"), queryFn: () => boardroomApi.decisions(ws!), ...on(ws) });
}
export function useVotes(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "votes"), queryFn: () => boardroomApi.votes(ws!), ...on(ws) });
}
export function useActions(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "actions"), queryFn: () => boardroomApi.actions(ws!), ...on(ws) });
}
export function useNotifications(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "notifications"), queryFn: () => boardroomApi.notifications(ws!), ...on(ws) });
}
export function useFounderRequests(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "founder-requests"), queryFn: () => boardroomApi.founderRequests(ws!), ...on(ws) });
}
export function useAudit(ws?: string) {
  return useQuery({ queryKey: brKeys.ws(ws ?? "", "audit"), queryFn: () => boardroomApi.audit(ws!), ...on(ws) });
}
export function useAttachedDocuments(ws: string | undefined, thread: string | undefined) {
  return useQuery({
    queryKey: brKeys.ws(ws ?? "", "attached", thread ?? ""),
    queryFn: () => boardroomApi.attachedDocuments(thread!),
    enabled: !!ws && !!thread,
  });
}

/** Messages of one discussion, newest window first; `limit` grows to load earlier ones. */
export function messagesKey(ws: string, thread: string, limit: number) {
  return brKeys.ws(ws, "messages", thread, limit);
}
export function useMessages(ws: string | undefined, thread: string | undefined, limit = MESSAGE_PAGE) {
  return useQuery({
    queryKey: messagesKey(ws ?? "", thread ?? "", limit),
    queryFn: () => boardroomApi.messages(thread!, limit),
    enabled: !!ws && !!thread,
    placeholderData: (prev) => prev,
  });
}

export function useReactions(ws: string | undefined, thread: string | undefined, ids: string[]) {
  const key = ids.join(",");
  return useQuery({
    queryKey: brKeys.ws(ws ?? "", "reactions", thread ?? "", key),
    queryFn: () => boardroomApi.reactions(ids),
    enabled: !!ws && !!thread && ids.length > 0,
  });
}

/** Posting with an optimistic echo that is rolled back if the database refuses it. */
/** What a mention adds to a post: the profiles to ask and the context for their frozen snapshot. */
export interface PostRelay {
  agents: string[];
  mode: TaskMode;
  context: string;
  manifest: unknown;
}

export function usePostMessage(ws: string, thread: string, limit: number, authorId: string | null) {
  const qc = useQueryClient();
  const key = messagesKey(ws, thread, limit);
  return useMutation({
    // With a relay the message and its tasks are stored in one transaction: both or neither.
    mutationFn: async (input: Parameters<typeof boardroomApi.post>[0] & { relay?: PostRelay }): Promise<string> => {
      const { relay, ...message } = input;
      if (!relay) return boardroomApi.post(message);
      return (await boardroomApi.postWithTasks({ ...message, ...relay })).messageId;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Message[]>(key);
      const optimistic: Message = {
        id: `pending-${Date.now()}`,
        workspace_id: ws,
        thread_id: thread,
        author_type: "human",
        author_id: authorId,
        agent_id: null,
        submitted_by: null,
        content: input.content,
        reply_to: input.replyTo ?? null,
        attachments: input.attachments ?? [],
        status: "posted",
        source_task_id: null,
        round_label: null,
        system_kind: null,
        created_at: new Date().toISOString(),
        edited_at: null,
      };
      qc.setQueryData<Message[]>(key, [...(previous ?? []), optimistic]);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.previous);
    },
    onSettled: (_data, _error, variables) => {
      void qc.invalidateQueries({ queryKey: ["boardroom", ws, "messages"] });
      void qc.invalidateQueries({ queryKey: ["boardroom", ws, "threads"] });
      if (variables?.relay) {
        void qc.invalidateQueries({ queryKey: ["boardroom", ws, "tasks"] });
        void qc.invalidateQueries({ queryKey: ["boardroom", ws, "audit"] });
      }
    },
  });
}

/** Refresh everything a workspace shows after any mutation. */
export function useBoardroomRefresh(ws: string | undefined) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["boardroom", ws ?? ""] });
}

/* Realtime. Postgres Changes is filtered by RLS, so a client only ever hears
 * about workspaces it belongs to. An event only invalidates the matching
 * queries — the refetch is the source of truth — which makes duplicate and
 * out-of-order events harmless. After a dropped connection the channel
 * re-subscribes and everything is refetched once, so a gap cannot leave the
 * screen stale. */
const TABLE_PART: Record<string, string> = {
  boardroom_messages: "messages",
  boardroom_agent_tasks: "tasks",
  boardroom_threads: "threads",
  boardroom_proposals: "proposals",
  boardroom_decisions: "decisions",
  boardroom_decision_votes: "votes",
  boardroom_action_items: "actions",
  boardroom_notifications: "notifications",
  boardroom_reactions: "reactions",
};

export type RealtimeState = "connecting" | "live" | "offline";

export function useBoardroomRealtime(ws: string | undefined, onState?: (s: RealtimeState) => void) {
  const qc = useQueryClient();
  const stateCb = useRef(onState);
  stateCb.current = onState;
  useEffect(() => {
    if (!ws) return;
    let first = true;
    stateCb.current?.("connecting");
    const channel = supabase.channel(`boardroom:${ws}`);
    for (const table of Object.keys(TABLE_PART)) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `workspace_id=eq.${ws}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["boardroom", ws, TABLE_PART[table]] });
          if (table === "boardroom_agent_tasks" || table === "boardroom_messages") {
            void qc.invalidateQueries({ queryKey: ["boardroom", ws, "audit"] });
          }
        },
      );
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        stateCb.current?.("live");
        // Events missed while disconnected: catch up with one refetch.
        if (!first) void qc.invalidateQueries({ queryKey: ["boardroom", ws] });
        first = false;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        stateCb.current?.("offline");
      }
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ws, qc]);
}
