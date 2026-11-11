import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../../components/Button";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import {
  activeMentionQuery,
  agentTarget,
  humanTarget,
  parseMentions,
  resolveAmbiguous,
  suggestMentions,
  type MentionTarget,
} from "../../lib/boardroom/mentions";
import { MODES } from "../../lib/boardroom/prompt";
import { prepareContext } from "../../lib/boardroom/relay";
import { TASK_MODES, type Agent, type DocumentRow, type Member, type Message, type TaskMode, type Thread } from "../../lib/boardroom/types";
import { usePostMessage } from "../../hooks/useBoardroom";
import styles from "./boardroom.module.css";

interface Props {
  thread: Thread;
  limit: number;
  userId: string | null;
  members: Member[];
  agents: Agent[];
  documents: Pick<DocumentRow, "id" | "title" | "archived">[];
  replyTo: Message | null;
  onClearReply: () => void;
  prefill: { text: string; nonce: number } | null;
  onSent: () => void;
}

/** The message box. An @mention of an AI profile stores the message first, then prepares a task — it never invents an answer. */
export function Composer({ thread, limit, userId, members, agents, documents, replyTo, onClearReply, prefill, onSent }: Props) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<TaskMode>("independent");
  const [attachments, setAttachments] = useState<{ document_id: string; title: string }[]>([]);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const post = usePostMessage(thread.workspace_id, thread.id, limit, userId);

  useEffect(() => {
    if (!prefill) return;
    setText(prefill.text);
    requestAnimationFrame(() => area.current?.focus());
  }, [prefill]);

  const targets: MentionTarget[] = useMemo(
    () => [...agents.map((a) => agentTarget(a, members)), ...members.map(humanTarget)],
    [agents, members],
  );
  const query = activeMentionQuery(text, caret);
  const suggestions = useMemo(() => (query ? suggestMentions(query.query, targets) : []), [query, targets]);
  const parsed = useMemo(() => parseMentions(text, agents, members), [text, agents, members]);
  const agentMentions = parsed.mentions.filter((m) => m.target.kind === "agent");
  const blockers: string[] = [];
  if (parsed.ambiguous.length > 0) blockers.push("Pick which profile you mean for each bare @Claude / @ChatGPT.");
  for (const d of parsed.disabled) blockers.push(`${d.target.handle} is switched off. Enable it in AI Council or remove the mention.`);

  function accept(target: MentionTarget) {
    if (!query) return;
    const before = text.slice(0, query.start);
    const after = text.slice(caret);
    const next = `${before}@${target.handle} ${after}`;
    setText(next);
    const pos = before.length + target.handle.length + 2;
    setIndex(0);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0 && query) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        accept(suggestions[Math.min(index, suggestions.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setCaret(0);
        return;
      }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  }

  async function send() {
    const content = text;
    if (content.trim() === "" || blockers.length > 0 || working) return;
    setError("");
    setWorking(true);
    const humanIds = parsed.mentions.filter((m) => m.target.kind === "human").map((m) => m.target.id);
    const chosen = agentMentions
      .map((m) => agents.find((a) => a.id === m.target.id))
      .filter((a): a is Agent => !!a && a.enabled);
    try {
      // With AI mentions, the message and its tasks are stored in ONE call: if any task
      // cannot be created nothing is stored, and the text stays in the box.
      const relay =
        chosen.length > 0
          ? await prepareContext({ thread, agents, members, mode }).then((c) => ({
              agents: chosen.map((a) => a.id),
              mode,
              context: c.content,
              manifest: c.manifest,
            }))
          : undefined;
      await post.mutateAsync({
        thread: thread.id,
        content,
        replyTo: replyTo?.id ?? null,
        mentions: humanIds,
        attachments,
        relay,
      });
      setText("");
      setAttachments([]);
      onClearReply();
    } catch (e) {
      // The message box keeps the text: nothing the user typed is lost, and nothing half-stored.
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    } finally {
      setWorking(false);
      onSent();
    }
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {replyTo ? (
        <div className={styles.rowBetween}>
          <p className={styles.quote}>Replying to: {replyTo.content.slice(0, 140)}</p>
          <Button size="sm" variant="ghost" onClick={onClearReply}>
            Cancel reply
          </Button>
        </div>
      ) : null}

      <textarea
        ref={area}
        className={styles.textarea}
        rows={3}
        value={text}
        placeholder="Write a message. Type @ to mention a founder or an AI profile, for example @Claude (Nirav)."
        aria-label="Message"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          setText(e.target.value);
          setCaret(e.target.selectionStart);
          setIndex(0);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
      />

      {suggestions.length > 0 ? (
        <ul id={listId} role="listbox" className={styles.suggest} aria-label="Mention suggestions">
          {suggestions.map((s, i) => (
            <li
              key={`${s.kind}-${s.id}`}
              role="option"
              aria-selected={i === index}
              className={styles.suggestItem}
              onMouseDown={(e) => {
                e.preventDefault();
                accept(s);
              }}
            >
              <span>{s.handle}</span>
              <span className={styles.meta}>
                {s.kind === "human" ? "Founder" : `AI · ${s.provider === "claude" ? "Claude" : "ChatGPT"} subscription of ${s.ownerName ?? "?"}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {parsed.ambiguous.map((a) => (
        <div key={a.start} className={styles.notice} role="group" aria-label={`Which one did you mean by ${a.raw}?`}>
          <p>
            <strong>{a.raw}</strong> matches more than one profile. Which one?
          </p>
          <div className={styles.row}>
            {a.candidates.map((c) => (
              <Button key={c.id} size="sm" onClick={() => setText(resolveAmbiguous(text, a, c))}>
                {c.handle}
              </Button>
            ))}
          </div>
        </div>
      ))}

      {blockers.map((b) => (
        <p key={b} className={styles.error}>
          {b}
        </p>
      ))}
      {parsed.duplicates.length > 0 ? (
        <p className={styles.muted}>A repeated mention only creates one task.</p>
      ) : null}

      {agentMentions.length > 0 && blockers.length === 0 ? (
        <div className={styles.field}>
          <p className={styles.muted}>
            Sending prepares {agentMentions.length === 1 ? "a prompt" : `${agentMentions.length} separate prompts`} for{" "}
            {agentMentions.map((m) => m.target.handle).join(" and ")}. Nothing is sent to any AI: each account owner runs their own prompt and
            pastes the answer back.
          </p>
          <label className={styles.row}>
            <span className={styles.label}>Task</span>
            <select className={styles.select} value={mode} onChange={(e) => setMode(e.target.value as TaskMode)} aria-label="Task type">
              {TASK_MODES.map((m) => (
                <option key={m} value={m}>
                  {MODES[m].label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className={styles.rowBetween}>
        <div className={styles.row}>
          <select
            className={styles.select}
            aria-label="Attach a document"
            value=""
            onChange={(e) => {
              const doc = documents.find((d) => d.id === e.target.value);
              if (doc && !attachments.some((a) => a.document_id === doc.id)) {
                setAttachments([...attachments, { document_id: doc.id, title: doc.title }]);
              }
            }}
          >
            <option value="">Attach document…</option>
            {documents
              .filter((d) => !d.archived)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
          </select>
          {attachments.map((a) => (
            <Button key={a.document_id} size="sm" variant="ghost" onClick={() => setAttachments(attachments.filter((x) => x.document_id !== a.document_id))}>
              {a.title} ✕
            </Button>
          ))}
        </div>
        <Button type="submit" variant="primary" busy={working} disabled={text.trim() === "" || blockers.length > 0}>
          Send
        </Button>
      </div>

      {error ? (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      ) : null}
    </form>
  );
}
