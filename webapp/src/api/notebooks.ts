import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type {
  Notebook,
  NotebookSource,
  NotebookArtifact,
  GroundedChatMessage,
  GroundedCitation,
  SourceType,
  ArtifactType,
} from "../types/notebooks";

/* Notebooks persistence, replacing the localStorage store in
 * hooks/useNotebooks.ts. See supabase/migrations/20260830000000_add_notebooks.sql.
 *
 * The row shapes are snake_case and flat; the app's Notebook type is camelCase
 * with nested children. The mapping lives here rather than in the views so the
 * studio and hub keep working against the type they already use. */

interface NotebookRow {
  id: string;
  title: string;
  subject: string;
  color: string;
  description: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  notebook_sources?: SourceRow[];
  notebook_artifacts?: ArtifactRow[];
  notebook_messages?: MessageRow[];
}
interface SourceRow {
  id: string;
  title: string;
  type: SourceType;
  content: string;
  url: string | null;
  selected: boolean;
  created_at: string;
}
interface ArtifactRow {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  summary: string | null;
  created_at: string;
}
interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: GroundedCitation[] | null;
  created_at: string;
}

const toSource = (r: SourceRow): NotebookSource => ({
  id: r.id,
  title: r.title,
  type: r.type,
  content: r.content,
  url: r.url ?? undefined,
  selected: r.selected,
  uploadedAt: r.created_at,
});

const toArtifact = (r: ArtifactRow): NotebookArtifact => ({
  id: r.id,
  type: r.type,
  title: r.title,
  content: r.content,
  summary: r.summary ?? undefined,
  createdAt: r.created_at,
});

const toMessage = (r: MessageRow): GroundedChatMessage => ({
  id: r.id,
  role: r.role,
  content: r.content,
  citations: r.citations ?? undefined,
  timestamp: r.created_at,
});

/* Children arrive in whatever order PostgREST returns them; the studio renders
 * sources and messages in creation order, so sort here rather than in a view. */
const byCreated = (a: { created_at: string }, b: { created_at: string }) =>
  a.created_at.localeCompare(b.created_at);

function toNotebook(row: NotebookRow): Notebook {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    color: row.color,
    description: row.description ?? undefined,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sources: (row.notebook_sources ?? []).sort(byCreated).map(toSource),
    artifacts: (row.notebook_artifacts ?? [])
      .sort(byCreated)
      .reverse()
      .map(toArtifact),
    chatHistory: (row.notebook_messages ?? []).sort(byCreated).map(toMessage),
  };
}

/* The hub needs source and artifact counts but never the transcript, which is
 * the one child set that grows without bound. */
const LIST_SELECT = "*, notebook_sources(*), notebook_artifacts(*)";
const DETAIL_SELECT =
  "*, notebook_sources(*), notebook_artifacts(*), notebook_messages(*)";

export const notebooksApi = {
  async fetch(): Promise<Notebook[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("notebooks")
      .select(LIST_SELECT)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toNotebook);
  },

  async fetchOne(id: string): Promise<Notebook | null> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("notebooks")
      .select(DETAIL_SELECT)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toNotebook(data) : null;
  },

  async add(input: {
    title: string;
    subject?: string;
    color?: string;
    description?: string;
  }): Promise<Notebook> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("notebooks")
      .insert([{ ...input, user_id: userId }])
      .select(LIST_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return toNotebook(data);
  },

  /* Partial update of the notebook row itself. updated_at is maintained by a
     trigger, so it is deliberately not settable from here. */
  async update(
    id: string,
    patch: Partial<
      Pick<Notebook, "title" | "subject" | "color" | "description" | "notes">
    >,
  ): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("notebooks")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  /* Sources, messages and artifacts are ON DELETE CASCADE on notebook_id. */
  async delete(id: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("notebooks")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  async addSource(
    notebookId: string,
    source: Omit<NotebookSource, "id" | "uploadedAt">,
  ): Promise<NotebookSource> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("notebook_sources")
      .insert([
        {
          notebook_id: notebookId,
          user_id: userId,
          title: source.title,
          type: source.type,
          content: source.content,
          url: source.url ?? null,
          selected: source.selected,
        },
      ])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toSource(data);
  },

  async setSourceSelected(id: string, selected: boolean): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("notebook_sources")
      .update({ selected })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  async deleteSource(id: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("notebook_sources")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  async addMessage(
    notebookId: string,
    message: Omit<GroundedChatMessage, "id" | "timestamp">,
  ): Promise<GroundedChatMessage> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("notebook_messages")
      .insert([
        {
          notebook_id: notebookId,
          user_id: userId,
          role: message.role,
          content: message.content,
          citations: message.citations ?? [],
        },
      ])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toMessage(data);
  },

  /* The studio's "clear chat" wipes the transcript for one notebook. */
  async clearMessages(notebookId: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("notebook_messages")
      .delete()
      .eq("notebook_id", notebookId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  async deleteArtifact(id: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("notebook_artifacts")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  async addArtifact(
    notebookId: string,
    artifact: Omit<NotebookArtifact, "id" | "createdAt">,
  ): Promise<NotebookArtifact> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("notebook_artifacts")
      .insert([
        {
          notebook_id: notebookId,
          user_id: userId,
          type: artifact.type,
          title: artifact.title,
          content: artifact.content,
          summary: artifact.summary ?? null,
        },
      ])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toArtifact(data);
  },
};
