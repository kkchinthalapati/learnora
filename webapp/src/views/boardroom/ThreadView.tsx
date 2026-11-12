import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { boardroomApi, MESSAGE_PAGE } from "../../api/boardroom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";
import { Skeleton } from "../../components/Skeleton";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { renderMarkdownNodes } from "../../lib/markdownToReact";
import { MODES } from "../../lib/boardroom/prompt";
import { startRelay } from "../../lib/boardroom/relay";
import { AVAILABILITY_LABEL, agentAvailability, TASK_OPEN } from "../../lib/boardroom/workflow";
import { TASK_MODES, type Agent, type Message, type TaskMode } from "../../lib/boardroom/types";
import {
  brKeys,
  useAgents,
  useAttachedDocuments,
  useBoardroomIdentity,
  useBoardroomRefresh,
  useDecisions,
  useDocuments,
  useMessages,
  useProposals,
  useReactions,
  useTasks,
  useThreads,
} from "../../hooks/useBoardroom";
import { Composer } from "./Composer";
import { DecisionForm } from "./DecisionsSection";
import { ProposalForm } from "./ProposalsSection";
import { formatTime, MentionText, StatusBadge, useNames } from "./shared";
import { TaskCard } from "./TaskCard";
import styles from "./boardroom.module.css";

const REACTIONS: { key: string; label: string }[] = [
  { key: "agree", label: "Agree" },
  { key: "disagree", label: "Disagree" },
  { key: "question", label: "Question" },
  { key: "insight", label: "Insight" },
  { key: "flag", label: "Flag" },
];

const DEFAULT_ROUND: Partial<Record<TaskMode, number>> = {
  independent: 1,
  cross_examination: 2,
  response_to_agent: 2,
  final_synthesis: 3,
  decision_review: 4,
};

export function ThreadView({ ws, threadId }: { ws: string; threadId: string }) {
  const qc = useQueryClient();
  const refresh = useBoardroomRefresh(ws);
  const { userId, isFounder, members } = useBoardroomIdentity(ws);
  const agents = useAgents(ws).data ?? [];
  const threads = useThreads(ws);
  const thread = threads.data?.find((t) => t.id === threadId);
  const [limit, setLimit] = useState(MESSAGE_PAGE);
  const messages = useMessages(ws, threadId, limit);
  const tasks = (useTasks(ws).data ?? []).filter((t) => t.thread_id === threadId);
  const documents = useDocuments(ws).data ?? [];
  const attached = useAttachedDocuments(ws, threadId).data ?? [];
  const proposals = (useProposals(ws).data ?? []).filter((p) => p.thread_id === threadId);
  const decisions = (useDecisions(ws).data ?? []).filter((d) => d.thread_id === threadId);
  const names = useNames(members, agents);

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState<"chat" | "side">("chat");
  const [roundOpen, setRoundOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);

  const list = useMemo(() => messages.data ?? [], [messages.data]);
  const reactions = useReactions(ws, threadId, list.filter((m) => !m.id.startsWith("pending-")).map((m) => m.id));
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  useEffect(() => {
    if (list.length > lastCount.current) endRef.current?.scrollIntoView?.({ block: "end" });
    lastCount.current = list.length;
  }, [list.length]);

  const priorBy = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of list) {
      if (m.author_type === "ai" && m.agent_id) map.set(m.agent_id, [...(map.get(m.agent_id) ?? []), m.content]);
    }
    return map;
  }, [list]);

  if (threads.isLoading) return <Skeleton height={320} />;
  if (!thread) {
    return (
      <EmptyState
        icon="message-square"
        title="Discussion not found"
        message="It may have been removed, or you may not be a member of this workspace."
      >
        <Link to="/boardroom/discussions">Back to discussions</Link>
      </EmptyState>
    );
  }

  const archived = thread.status === "archived";
  const openTasks = tasks.filter((t) => TASK_OPEN.has(t.status) || t.status === "failed");
  const doneTasks = tasks.filter((t) => !openTasks.includes(t)).slice(0, 5);
  const hasMore = list.length >= limit;

  async function setThread(patch: Parameters<typeof boardroomApi.updateThread>[1]) {
    await boardroomApi.updateThread(threadId, patch);
    refresh();
  }

  return (
    <div className={styles.convo}>
      <div className={styles.bar}>
        <div>
          <p className={styles.meta}>
            <Link to="/boardroom/discussions">Discussions</Link> · {thread.category}
            {archived ? " · archived" : ""}
          </p>
          <h1 className={styles.h1}>{thread.title}</h1>
          {thread.problem ? <p className={styles.sub}>{thread.problem}</p> : null}
        </div>
        <div className={styles.row}>
          <Button size="sm" onClick={() => setPanelOpen((v) => !v)} aria-expanded={panelOpen} className={styles.hideOnMobile}>
            {panelOpen ? "Hide panel" : "Show panel"}
          </Button>
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Discussion sections">
        <Button size="sm" variant={mobileTab === "chat" ? "primary" : "secondary"} role="tab" aria-selected={mobileTab === "chat"} onClick={() => setMobileTab("chat")}>
          Conversation
        </Button>
        <Button size="sm" variant={mobileTab === "side" ? "primary" : "secondary"} role="tab" aria-selected={mobileTab === "side"} onClick={() => setMobileTab("side")}>
          Tasks & context {openTasks.length > 0 ? `(${openTasks.length})` : ""}
        </Button>
      </div>

      <div className={`${styles.thread} ${panelOpen ? "" : styles.threadCollapsed}`}>
        <section className={`${styles.convo} ${mobileTab === "side" ? styles.hideOnMobile : ""}`} aria-label="Conversation">
          {hasMore ? (
            <Button size="sm" onClick={() => setLimit((l) => l + MESSAGE_PAGE)}>
              Load earlier messages
            </Button>
          ) : null}
          {messages.isLoading ? <Skeleton height={160} /> : null}
          {messages.isError ? (
            <p className={styles.error} role="alert">
              Couldn’t load this discussion. <Button size="sm" onClick={() => void messages.refetch()}>Retry</Button>
            </p>
          ) : null}
          {!messages.isLoading && list.length === 0 ? (
            <EmptyState icon="message-square" title="Nothing here yet" message="Say something, or mention an AI profile with @ to prepare a prompt for its account owner." />
          ) : null}

          <div className={styles.stream} aria-live="polite">
            {list.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                parent={m.reply_to ? list.find((x) => x.id === m.reply_to) : undefined}
                agents={agents}
                members={members}
                names={names}
                userId={userId}
                reactions={(reactions.data ?? []).filter((r) => r.message_id === m.id)}
                onReply={() => setReplyTo(m)}
                onQuote={() =>
                  setPrefill({
                    text: `> ${m.content.split("\n").slice(0, 4).join("\n> ")}\n\n`,
                    nonce: Date.now(),
                  })
                }
                onToggleReaction={async (emoji, on) => {
                  await boardroomApi.toggleReaction(ws, m.id, emoji, on);
                  void qc.invalidateQueries({ queryKey: ["boardroom", ws, "reactions"] });
                }}
                onEdited={refresh}
                decisionIds={decisions.map((d) => d.id)}
              />
            ))}
            <div ref={endRef} />
          </div>

          {archived ? (
            <EmptyState size="sm" message="This discussion is archived. Reopen it to post." />
          ) : (
            <Composer
              thread={thread}
              limit={limit}
              userId={userId}
              members={members}
              agents={agents}
              documents={documents}
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
              prefill={prefill}
              onSent={() => {}}
            />
          )}
        </section>

        {panelOpen ? (
          <aside className={`${styles.side} ${mobileTab === "chat" ? styles.hideOnMobile : ""}`} aria-label="Discussion details">
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Participants</h2>
              <ul className={styles.list}>
                {members.map((m) => (
                  <li key={m.user_id} className={styles.rowBetween}>
                    <span>{m.display_name}</span>
                    <Badge>{m.role}</Badge>
                  </li>
                ))}
                {agents.map((a) => (
                  <li key={a.id} className={styles.rowBetween}>
                    <span>
                      {a.display_name}
                      <span className={styles.meta}> · AI</span>
                    </span>
                    <Badge tone={a.enabled ? "accent" : "neutral"}>{AVAILABILITY_LABEL[agentAvailability(a, tasks)]}</Badge>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.card}>
              <div className={styles.rowBetween}>
                <h2 className={styles.cardTitle}>Agent tasks</h2>
                {!archived ? (
                  <Button size="sm" onClick={() => setRoundOpen(true)}>
                    Ask AI profiles…
                  </Button>
                ) : null}
              </div>
              {openTasks.length === 0 ? <p className={styles.muted}>No task is waiting. Mention an AI profile or start a round.</p> : null}
              {[...openTasks, ...doneTasks].map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  agent={agents.find((a) => a.id === t.agent_id)}
                  ownerName={names.person(t.owner_id)}
                  requesterName={names.person(t.created_by)}
                  userId={userId}
                  isFounder={isFounder}
                  priorTexts={priorBy.get(t.agent_id ?? "") ?? []}
                  onChanged={refresh}
                />
              ))}
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Context for this discussion</h2>
              <p className={styles.muted}>Attached documents are always included in prompts. Others are chosen by relevance and listed on each task.</p>
              {documents.filter((d) => !d.archived).length === 0 ? (
                <p className={styles.muted}>
                  No documents yet. <Link to="/boardroom/knowledge">Open the knowledge base</Link>.
                </p>
              ) : (
                <ul className={styles.list}>
                  {documents
                    .filter((d) => !d.archived)
                    .map((d) => (
                      <li key={d.id}>
                        <label className={styles.row}>
                          <input
                            type="checkbox"
                            checked={attached.includes(d.id)}
                            onChange={async (e) => {
                              await boardroomApi.attachDocument(ws, threadId, d.id, e.target.checked);
                              void qc.invalidateQueries({ queryKey: brKeys.ws(ws, "attached", threadId) });
                            }}
                          />
                          <span>{d.title}</span>
                          <span className={styles.meta}>v{d.current_version}</span>
                        </label>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Proposals & decisions</h2>
              <ul className={styles.list}>
                {proposals.map((p) => (
                  <li key={p.id} className={styles.rowBetween}>
                    <Link to="/boardroom/proposals">{p.title}</Link>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
                {decisions.map((d) => (
                  <li key={d.id} className={styles.rowBetween}>
                    <Link to="/boardroom/decisions">{d.title}</Link>
                    <StatusBadge status={d.status} />
                  </li>
                ))}
              </ul>
              <div className={styles.row}>
                <Button size="sm" onClick={() => setProposalOpen(true)}>
                  New proposal
                </Button>
                {isFounder ? (
                  <Button size="sm" onClick={() => setDecisionOpen(true)}>
                    Record decision
                  </Button>
                ) : (
                  <span className={styles.meta}>Only founders record decisions.</span>
                )}
              </div>
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Discussion</h2>
              <div className={styles.row}>
                <Button size="sm" onClick={() => void setThread({ pinned: !thread.pinned })}>
                  {thread.pinned ? "Unpin" : "Pin"}
                </Button>
                <Button size="sm" onClick={() => void setThread({ status: archived ? "open" : "archived" })}>
                  {archived ? "Reopen" : "Archive"}
                </Button>
                <RenameButton title={thread.title} onSave={(title) => setThread({ title })} />
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      {roundOpen ? (
        <RoundModal
          ws={ws}
          thread={thread}
          agents={agents}
          members={members}
          existingRounds={tasks.map((t) => t.round)}
          attachedIds={attached}
          onClose={() => setRoundOpen(false)}
          onDone={() => {
            setRoundOpen(false);
            void qc.invalidateQueries({ queryKey: ["boardroom", ws, "tasks"] });
            void qc.invalidateQueries({ queryKey: ["boardroom", ws, "threads"] });
            void qc.invalidateQueries({ queryKey: ["boardroom", ws, "audit"] });
          }}
        />
      ) : null}
      {proposalOpen ? (
        <ProposalForm ws={ws} threadId={threadId} onClose={() => setProposalOpen(false)} onSaved={refresh} />
      ) : null}
      {decisionOpen ? (
        <DecisionForm
          ws={ws}
          threadId={threadId}
          proposals={proposals}
          decisions={decisions}
          members={members}
          onClose={() => setDecisionOpen(false)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

function RenameButton({ title, onSave }: { title: string; onSave: (t: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState("");
  return (
    <>
      <Button size="sm" onClick={() => { setValue(title); setOpen(true); }}>
        Rename
      </Button>
      {open ? (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Rename discussion"
          footer={
            <Button
              variant="primary"
              disabled={value.trim() === ""}
              onClick={async () => {
                try {
                  await onSave(value.trim());
                  setOpen(false);
                } catch (e) {
                  setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
                }
              }}
            >
              Save
            </Button>
          }
        >
          <input className={styles.input} value={value} maxLength={160} onChange={(e) => setValue(e.target.value)} aria-label="Title" />
          {error ? <p className={styles.error}>{error}</p> : null}
        </Modal>
      ) : null}
    </>
  );
}

interface ItemProps {
  message: Message;
  parent: Message | undefined;
  agents: Agent[];
  members: ReturnType<typeof useBoardroomIdentity>["members"];
  names: ReturnType<typeof useNames>;
  userId: string | null;
  reactions: { message_id: string; user_id: string; emoji: string }[];
  onReply: () => void;
  onQuote: () => void;
  onToggleReaction: (emoji: string, on: boolean) => Promise<void>;
  onEdited: () => void;
  decisionIds: string[];
}

function MessageItem({ message: m, parent, agents, members, names, userId, reactions, onReply, onQuote, onToggleReaction, onEdited }: ItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ previous_content: string; edited_at: string }[] | null>(null);
  const pending = m.id.startsWith("pending-");

  if (m.author_type === "system") {
    return (
      <div className={`${styles.msg} ${styles.msgSystem}`} data-author="system">
        {m.content} <span className={styles.meta}>· {formatTime(m.created_at)}</span>
      </div>
    );
  }

  const isAi = m.author_type === "ai";
  const agent = agents.find((a) => a.id === m.agent_id);
  const mine = !isAi && m.author_id === userId;
  const provider = agent?.provider === "claude" ? "Claude" : "ChatGPT";

  async function save() {
    try {
      await boardroomApi.edit(m.id, draft);
      setEditing(false);
      onEdited();
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <article
      className={`${styles.msg} ${isAi ? styles.msgAi : ""} ${pending ? styles.msgPending : ""}`}
      data-author={isAi ? "ai" : "human"}
      aria-label={isAi ? `AI answer from ${agent?.display_name ?? "AI profile"}` : `Message from ${names.person(m.author_id)}`}
    >
      <div className={styles.msgHead}>
        {isAi ? <Badge tone="accent">AI</Badge> : null}
        <span className={styles.author}>{isAi ? (agent?.display_name ?? "Removed AI profile") : names.person(m.author_id)}</span>
        {!isAi && names.role(m.author_id) === "founder" ? <Badge>founder</Badge> : null}
        {isAi ? (
          <span className={styles.via}>
            {provider} subscription of {names.person(agent?.owner_id)} · pasted by {names.person(m.submitted_by)}
          </span>
        ) : null}
        {m.round_label ? <Badge>{m.round_label}</Badge> : null}
        <span className={styles.meta}>{pending ? "sending…" : formatTime(m.created_at)}</span>
        {m.status === "edited" ? <span className={styles.meta}>(edited)</span> : null}
      </div>

      {parent ? <p className={styles.quote}>↳ {parent.author_type === "ai" ? names.agent(parent.agent_id) : names.person(parent.author_id)}: {parent.content.slice(0, 120)}</p> : null}

      {editing ? (
        <div className={styles.field}>
          <textarea className={styles.textarea} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit message" />
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.row}>
            <Button size="sm" variant="primary" disabled={draft.trim() === ""} onClick={() => void save()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(m.content); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : isAi ? (
        <div className={styles.body}>{renderMarkdownNodes(m.content)}</div>
      ) : (
        <div className={styles.body} style={{ whiteSpace: "pre-wrap" }}>
          <MentionText text={m.content} agents={agents} members={members} />
        </div>
      )}

      {m.attachments.length > 0 ? (
        <div className={styles.row}>
          {m.attachments.map((a) => (
            <Badge key={a.document_id}>{a.title}</Badge>
          ))}
        </div>
      ) : null}

      {!pending ? (
        <div className={styles.msgActions}>
          {REACTIONS.map((r) => {
            const count = reactions.filter((x) => x.emoji === r.key).length;
            const mineOn = reactions.some((x) => x.emoji === r.key && x.user_id === userId);
            return (
              <Button key={r.key} size="sm" variant={mineOn ? "secondary" : "ghost"} aria-pressed={mineOn} onClick={() => void onToggleReaction(r.key, !mineOn)}>
                {r.label}
                {count > 0 ? ` ${count}` : ""}
              </Button>
            );
          })}
          <Button size="sm" variant="ghost" onClick={onReply}>
            Reply
          </Button>
          <Button size="sm" variant="ghost" onClick={onQuote}>
            Quote
          </Button>
          {mine ? (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null}
          {m.status === "edited" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => setHistory(history ? null : await boardroomApi.edits(m.id))}
            >
              {history ? "Hide history" : "Edit history"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {history ? (
        <ul className={styles.manifest}>
          {history.map((h) => (
            <li key={h.edited_at}>
              {formatTime(h.edited_at)}: {h.previous_content}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/** Start a round: pick profiles, a task type and a round number, then prepare one prompt per profile. */
function RoundModal({
  ws,
  thread,
  agents,
  members,
  existingRounds,
  attachedIds,
  onClose,
  onDone,
}: {
  ws: string;
  thread: Parameters<typeof startRelay>[0]["thread"];
  agents: Agent[];
  members: Parameters<typeof startRelay>[0]["members"];
  existingRounds: number[];
  attachedIds?: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<TaskMode>(existingRounds.length ? "cross_examination" : "independent");
  const [picked, setPicked] = useState<string[]>([]);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const round = Math.max(DEFAULT_ROUND[mode] ?? 1, 1);
  const proposals = useProposals(ws).data ?? [];
  const [proposalId, setProposalId] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    try {
      // One call for every picked profile: all of the prompts are prepared, or none.
      await startRelay({
        thread,
        agents,
        members,
        targets: agents.filter((a) => picked.includes(a.id) && a.enabled),
        mode,
        round,
        trigger: null,
        request: request.trim() || `Continue the discussion: ${MODES[mode].label.toLowerCase()}.`,
        proposal: proposals.find((p) => p.id === proposalId) ?? null,
        attachedIds,
      });
      onDone();
    } catch (e) {
      setError(`Nothing was prepared: ${friendlyErrorMessage(e instanceof Error ? e.message : String(e))}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Ask AI profiles"
      subtitle="Each profile gets its own prompt. Nothing is sent: the account owner runs it and pastes the answer back."
      footer={
        <Button variant="primary" busy={busy} disabled={picked.length === 0} onClick={() => void go()}>
          Prepare {picked.length || ""} prompt{picked.length === 1 ? "" : "s"}
        </Button>
      }
    >
      <div className={styles.field}>
        <label className={styles.field}>
          <span className={styles.label}>Task</span>
          <select className={styles.select} value={mode} onChange={(e) => setMode(e.target.value as TaskMode)}>
            {TASK_MODES.map((m) => (
              <option key={m} value={m}>
                {MODES[m].label}
              </option>
            ))}
          </select>
          <span className={styles.meta}>{MODES[mode].task}</span>
        </label>
        <fieldset className={styles.field}>
          <legend className={styles.label}>Profiles</legend>
          {agents.map((a) => (
            <label key={a.id} className={styles.row}>
              <input
                type="checkbox"
                disabled={!a.enabled || !a.allowed_modes.includes(mode)}
                checked={picked.includes(a.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, a.id] : picked.filter((x) => x !== a.id))}
              />
              <span>{a.display_name}</span>
              {!a.enabled ? <span className={styles.meta}>(disabled)</span> : null}
              {a.enabled && !a.allowed_modes.includes(mode) ? <span className={styles.meta}>(not allowed this task)</span> : null}
            </label>
          ))}
        </fieldset>
        {proposals.length > 0 ? (
          <label className={styles.field}>
            <span className={styles.label}>Review a proposal (optional)</span>
            <select className={styles.select} value={proposalId} onChange={(e) => setProposalId(e.target.value)}>
              <option value="">None</option>
              {proposals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className={styles.field}>
          <span className={styles.label}>Question for them (optional)</span>
          <textarea className={styles.textarea} value={request} onChange={(e) => setRequest(e.target.value)} />
        </label>
        {mode === "independent" ? (
          <p className={styles.muted}>Independent analysis withholds other AI answers on purpose.</p>
        ) : (
          <p className={styles.muted}>This task includes the AI answers already submitted, in full, for each profile to examine.</p>
        )}
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </Modal>
  );
}
