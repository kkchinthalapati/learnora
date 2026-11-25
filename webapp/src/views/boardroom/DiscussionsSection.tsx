import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { boardroomApi } from "../../api/boardroom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";
import { Skeleton } from "../../components/Skeleton";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { CATEGORIES, type Category, type Message } from "../../lib/boardroom/types";
import {
  useBoardroomIdentity,
  useBoardroomRefresh,
  useThreads,
} from "../../hooks/useBoardroom";
import { Field, formatTime, Titled } from "./shared";
import styles from "./boardroom.module.css";

export function DiscussionsSection({ ws }: { ws: string }) {
  const threads = useThreads(ws);
  const { members } = useBoardroomIdentity(ws);
  const refresh = useBoardroomRefresh(ws);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"open" | "archived" | "all">("open");
  const [category, setCategory] = useState<Category | "all">("all");
  const [starter, setStarter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [hits, setHits] = useState<Message[] | null>(null);
  const [searchError, setSearchError] = useState("");

  // Searching the text of messages is a server query, debounced, so a long history is never loaded wholesale.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setHits(null);
      setSearchError("");
      return;
    }
    let live = true;
    const id = setTimeout(() => {
      boardroomApi
        .searchMessages(ws, term)
        .then((rows) => live && (setHits(rows), setSearchError("")))
        .catch((e) => live && setSearchError(friendlyErrorMessage(e instanceof Error ? e.message : String(e))));
    }, 300);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query, ws]);

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    const hitThreads = new Set((hits ?? []).map((m) => m.thread_id));
    return (threads.data ?? []).filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (category !== "all" && t.category !== category) return false;
      if (starter !== "all" && t.created_by !== starter) return false;
      if (!term) return true;
      return t.title.toLowerCase().includes(term) || t.problem.toLowerCase().includes(term) || hitThreads.has(t.id);
    });
  }, [threads.data, query, status, category, starter, hits]);

  return (
    <div className={styles.main}>
      <Titled
        title="Discussions"
        sub="Every conversation stays here with its full history, human and AI contributions together."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New discussion
          </Button>
        }
      />

      <div className={styles.formGrid} role="search">
        <input
          className={styles.input}
          type="search"
          placeholder="Search titles and messages"
          aria-label="Search discussions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className={styles.select} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="open">Open</option>
          <option value="archived">Archived</option>
          <option value="all">All statuses</option>
        </select>
        <select className={styles.select} aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className={styles.select} aria-label="Started by" value={starter} onChange={(e) => setStarter(e.target.value)}>
          <option value="all">Started by anyone</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </select>
      </div>
      {searchError ? <p className={styles.error}>{searchError}</p> : null}
      {hits && hits.length > 0 ? <p className={styles.muted}>{hits.length} message match{hits.length === 1 ? "" : "es"} in the discussions below.</p> : null}

      {threads.isLoading ? <Skeleton height={200} /> : null}
      {threads.isError ? (
        <p className={styles.error} role="alert">
          Couldn’t load discussions. <Button size="sm" onClick={() => void threads.refetch()}>Retry</Button>
        </p>
      ) : null}
      {threads.data && shown.length === 0 ? (
        <EmptyState
          icon="message-square"
          title={threads.data.length === 0 ? "No discussions yet" : "Nothing matches"}
          message={threads.data.length === 0 ? "Start one with a question for the founders and the AI profiles." : "Try a different search or filter."}
        />
      ) : null}
      <ul className={styles.list}>
        {shown.map((t) => (
          <li key={t.id}>
            <Link className={styles.listItem} to={`/boardroom/discussions/${t.id}`}>
              <span className={styles.rowBetween}>
                <span className={styles.itemTitle}>
                  {t.pinned ? "Pinned · " : ""}
                  {t.title}
                </span>
                <span className={styles.row}>
                  <Badge>{t.category}</Badge>
                  {t.status === "archived" ? <Badge tone="warning">archived</Badge> : null}
                </span>
              </span>
              {t.problem ? <span className={styles.muted}>{t.problem.slice(0, 160)}</span> : null}
              <span className={styles.meta}>Last activity {formatTime(t.last_message_at)}</span>
            </Link>
          </li>
        ))}
      </ul>

      {creating ? (
        <NewDiscussion
          ws={ws}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            refresh();
            setCreating(false);
            navigate(`/boardroom/discussions/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}

function NewDiscussion({ ws, onClose, onCreated }: { ws: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [category, setCategory] = useState<Category>("engineering");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    try {
      const t = await boardroomApi.createThread({ workspace_id: ws, title: title.trim(), problem: problem.trim(), category });
      onCreated(t.id);
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New discussion"
      footer={
        <Button variant="primary" busy={busy} disabled={title.trim() === ""} onClick={() => void create()}>
          Start discussion
        </Button>
      }
    >
      <div className={styles.field}>
        <Field label="Title">
          <input className={styles.input} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Problem statement" hint="Goes into every AI prompt for this discussion, so state the real question.">
          <textarea className={styles.textarea} value={problem} maxLength={4000} onChange={(e) => setProblem(e.target.value)} />
        </Field>
        <Field label="Category">
          <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </Modal>
  );
}
