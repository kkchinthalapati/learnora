import { boardroomApi } from "../../api/boardroom";
import { assembleContext, type Assembled, type DocWithText } from "./context";
import type { Agent, Decision, Member, Message, Proposal, TaskMode, Thread } from "./types";

/* Turns a mention (or a "run the next round" click) into agent tasks.
 *
 * Nothing here contacts a model, and nothing here writes a prompt. The browser
 * assembles the CONTEXT (which documents and messages are relevant) because
 * that needs the keyword scoring in context.ts; the database freezes it as a
 * snapshot, then builds each profile's prompt itself from the stored message,
 * the snapshot and the profile, and seals it with a fingerprint. See
 * boardroom_build_prompt in the migration.
 *
 * A mention is stored together with its tasks in ONE database call
 * (boardroomApi.postWithTasks), so a failure leaves no message without its
 * tasks. A round started from the panel has no message and uses createTasks,
 * also one call for every profile. */

const CATEGORY_DOCS: Record<string, string[]> = {
  product: ["product", "roadmap", "overview", "sprint"],
  engineering: ["architecture", "engineering", "issues", "sprint"],
  design: ["design", "product"],
  qa: ["issues", "engineering", "sprint"],
  security: ["architecture", "issues", "engineering"],
  business: ["product", "roadmap", "decisions"],
  strategy: ["roadmap", "product", "decisions", "overview"],
  research: ["overview", "product", "architecture"],
  other: ["overview"],
};

export interface RelayInput {
  thread: Thread;
  agents: Agent[];
  members: Member[];
  /** Profiles to ask. */
  targets: Agent[];
  mode: TaskMode;
  round?: number;
  /** The message that asked (null for a round started from the panel). */
  trigger: { id: string } | null;
  /** Typed in the round panel; ignored when `trigger` is set (the stored message is used). */
  request: string;
  proposal?: Proposal | null;
  attachedIds?: string[];
  documents?: DocWithText[];
}

export interface RelayOutcome {
  taskIds: string[];
}

export interface PrepareContextInput {
  thread: Thread;
  agents: Agent[];
  members: Member[];
  mode: TaskMode;
  attachedIds?: string[];
  documents?: DocWithText[];
}

/** Assemble the context a set of tasks will be given. Read-only: nothing is stored yet. */
export async function prepareContext(input: PrepareContextInput): Promise<Assembled> {
  const { thread, mode } = input;
  const attachedPromise = input.attachedIds
    ? Promise.resolve(input.attachedIds)
    : boardroomApi.attachedDocuments(thread.id);
  const [messages, attached, decisions] = await Promise.all([
    boardroomApi.recentMessages(thread.id),
    attachedPromise,
    boardroomApi.decisions(thread.workspace_id),
  ]);
  const attachedSet = new Set(attached);

  let documents: DocWithText[];
  if (input.documents) {
    documents = input.documents;
  } else {
    const docs = await boardroomApi.documents(thread.workspace_id);
    const textWords = `${thread.title} ${thread.problem} ${messages.slice(-14).map((m) => m.content).join(" ")}`
      .toLowerCase()
      .match(/[a-z][a-z0-9-]{2,}/g) ?? [];
    const wordSet = new Set(textWords);

    const candidates = docs.filter((d) => {
      if (d.archived) return false;
      if (docs.length <= 5) return true;
      if (attachedSet.has(d.id)) return true;
      if (d.category === "overview") return true;
      if (d.category === thread.category) return true;
      if (CATEGORY_DOCS[thread.category]?.includes(d.category)) return true;
      return d.title.toLowerCase().split(/\W+/).some((w) => w.length > 2 && wordSet.has(w));
    });

    documents = await Promise.all(
      candidates.map(async (doc) => {
        const content =
          "content" in doc && typeof (doc as Record<string, unknown>).content === "string"
            ? ((doc as Record<string, unknown>).content as string)
            : await boardroomApi.documentContent(doc.id, doc.current_version);
        return { doc, content };
      }),
    );
  }

  const nameOf = (m: Message) => {
    if (m.author_type === "ai") return input.agents.find((a) => a.id === m.agent_id)?.display_name ?? "AI profile";
    return input.members.find((x) => x.user_id === m.author_id)?.display_name ?? "Someone";
  };
  return assembleContext({
    thread,
    messages,
    authorName: nameOf,
    documents,
    attachedIds: attachedSet,
    decisions: decisions as Decision[],
    mode,
  });
}

/** Prepare tasks for a round started from the panel (or for an existing message). All or none. */
export async function startRelay(input: RelayInput): Promise<RelayOutcome> {
  const assembled = await prepareContext(input);
  const taskIds = await boardroomApi.createTasks({
    thread: input.thread.id,
    agents: input.targets.map((a) => a.id),
    trigger: input.trigger?.id ?? null,
    mode: input.mode,
    request: input.request,
    context: assembled.content,
    manifest: assembled.manifest,
    proposal: input.proposal?.id ?? null,
    round: input.round ?? 1,
  });
  return { taskIds };
}
