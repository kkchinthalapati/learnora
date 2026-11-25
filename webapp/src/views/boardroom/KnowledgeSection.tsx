import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { boardroomApi } from "../../api/boardroom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { renderMarkdownNodes } from "../../lib/markdownToReact";
import { isPdf, extractPdfText } from "../../lib/pdfText";
import { SEED_DOCS } from "../../lib/boardroom/seedDocs";
import type { DocumentRow } from "../../lib/boardroom/types";
import { useBoardroomRefresh, useDocuments, useDocumentContent, useMembers } from "../../hooks/useBoardroom";
import { Field, formatTime, Titled } from "./shared";
import styles from "./boardroom.module.css";

const CATEGORY_OPTIONS = ["overview", "architecture", "product", "design", "engineering", "issues", "roadmap", "sprint", "decisions", "general"];
const MAX_UPLOAD = 1_000_000;

function slugFor(title: string): string {
  const base = title.trim().replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 70);
  return base.includes(".") ? base : `${base || "document"}.md`;
}

export function KnowledgeSection({ ws }: { ws: string }) {
  const docs = useDocuments(ws);
  const members = useMembers(ws).data ?? [];
  const refresh = useBoardroomRefresh(ws);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs.data ?? []).filter(
      (d) =>
        (showArchived || !d.archived) &&
        (!q || d.title.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q)),
    );
  }, [docs.data, query, showArchived]);
  const current = docs.data?.find((d) => d.id === selected);
  const missingSeeds = SEED_DOCS.filter((s) => !(docs.data ?? []).some((d) => d.slug === s.slug));

  async function seed() {
    setSeeding(true);
    setError("");
    try {
      for (const s of missingSeeds) {
        await boardroomApi.saveDocument({ ws, slug: s.slug, title: s.title, category: s.category, content: s.content });
      }
      refresh();
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className={styles.main}>
      <Titled
        title="Knowledge base"
        sub="Shared documents the AI prompts draw on. Every save keeps the earlier version, and each prompt records which versions it used."
        actions={
          <>
            {missingSeeds.length > 0 ? (
              <Button busy={seeding} onClick={() => void seed()}>
                Add {missingSeeds.length} starter document{missingSeeds.length === 1 ? "" : "s"} from the repo
              </Button>
            ) : null}
            <Button variant="primary" onClick={() => setSelected("new")}>
              New document
            </Button>
          </>
        }
      />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.formGrid}>
        <input className={styles.input} type="search" aria-label="Search documents" placeholder="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className={styles.row}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          <span>Show archived</span>
        </label>
      </div>

      {docs.isLoading ? <Skeleton height={160} /> : null}
      {docs.data && docs.data.length === 0 ? (
        <EmptyState icon="book-open" title="No documents yet" message="Add the starter documents, which are written from what the repository actually contains, or start your own." />
      ) : null}

      <div className={styles.grid}>
        <ul className={styles.list} aria-label="Documents">
          {list.map((d) => (
            <li key={d.id}>
              <button type="button" className={styles.listItem} style={{ width: "100%", textAlign: "left", font: "inherit" }} onClick={() => setSelected(d.id)} aria-current={selected === d.id}>
                <span className={styles.rowBetween}>
                  <span className={styles.itemTitle}>{d.title}</span>
                  <Badge>{d.category}</Badge>
                </span>
                <span className={styles.meta}>
                  {d.slug} · v{d.current_version} · owner {members.find((m) => m.user_id === d.owner_id)?.display_name ?? "—"} · {formatTime(d.updated_at)}
                  {d.archived ? " · archived" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <DocEditor
            key={selected}
            ws={ws}
            doc={current}
            onSaved={(id) => {
              refresh();
              setSelected(id);
            }}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

function DocEditor({
  ws,
  doc,
  onSaved,
  onClose,
}: {
  ws: string;
  doc: DocumentRow | undefined;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(doc?.title ?? "");
  const [category, setCategory] = useState(doc?.category ?? "general");
  const [content, setContent] = useState("");
  const [baseVersion, setBaseVersion] = useState<number>(doc?.current_version ?? 0);
  const [isDirty, setIsDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(false);

  const contentQuery = useDocumentContent(ws, doc?.id, doc?.current_version);

  useEffect(() => {
    setTitle(doc?.title ?? "");
    setCategory(doc?.category ?? "general");
    if (!isDirty) {
      setBaseVersion(doc?.current_version ?? 0);
      if (contentQuery.data !== undefined) {
        setContent(contentQuery.data);
      }
    }
  }, [doc?.id, doc?.current_version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (contentQuery.data !== undefined && !isDirty) {
      setContent(contentQuery.data);
    }
  }, [contentQuery.data, isDirty]);

  const versions = useQuery({
    queryKey: ["boardroom", ws, "versions", doc?.id ?? ""],
    queryFn: () => boardroomApi.versions(doc!.id),
    enabled: history && !!doc,
  });

  async function save(archived = doc?.archived ?? false, text = content) {
    setBusy(true);
    setError("");
    try {
      const id = await boardroomApi.saveDocument({
        ws,
        slug: doc?.slug ?? slugFor(title),
        title: title.trim(),
        category,
        content: text,
        archived,
        expectedVersion: baseVersion,
      });
      setIsDirty(false);
      setBaseVersion((prev) => prev + 1);
      onSaved(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/version conflict|updated by someone else|40001/i.test(msg)) {
        setError("This document has been modified by someone else. Please refresh to see the latest changes or copy your draft.");
      } else {
        setError(friendlyErrorMessage(msg));
      }
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      if (file.size > MAX_UPLOAD * (isPdf(file) ? 10 : 1)) throw new Error("That file is too large. Keep documents under 1 MB (PDFs under 10 MB).");
      let text: string;
      if (isPdf(file)) {
        const extraction = await extractPdfText(file);
        text = extraction.text;
        if (!text.trim()) throw new Error("No text could be read from that PDF (it may be a scan).");
      } else if (/\.(md|markdown|txt)$/i.test(file.name) || file.type.startsWith("text/")) {
        text = await file.text();
      } else {
        throw new Error("Only Markdown, text and PDF files are supported.");
      }
      setContent(text.slice(0, 200000));
      setIsDirty(true);
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.rowBetween}>
        <h2 className={styles.cardTitle}>{doc ? doc.slug : "New document"}</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <Field label="Title">
        <input className={styles.input} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Category">
        <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <div className={styles.row}>
        <Button size="sm" variant={preview ? "ghost" : "secondary"} onClick={() => setPreview(false)}>
          Edit
        </Button>
        <Button size="sm" variant={preview ? "secondary" : "ghost"} onClick={() => setPreview(true)}>
          Preview
        </Button>
        <label className={styles.meta}>
          Import .md, .txt or .pdf{" "}
          <input type="file" accept=".md,.markdown,.txt,.pdf,text/plain,text/markdown,application/pdf" onChange={(e) => void upload(e.target.files?.[0])} />
        </label>
      </div>
      {preview ? (
        <div className={styles.preview}>{renderMarkdownNodes(content)}</div>
      ) : (
        <>
          {contentQuery.isLoading && !isDirty && contentQuery.data === undefined ? (
            <Skeleton height={20} />
          ) : null}
          <textarea
            className={`${styles.textarea} ${styles.mono}`}
            rows={16}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setIsDirty(true);
            }}
            placeholder={contentQuery.isLoading && !isDirty ? "Loading document content…" : undefined}
            aria-label="Document text"
          />
        </>
      )}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.row}>
        <Button variant="primary" busy={busy} disabled={title.trim() === ""} onClick={() => void save()}>
          Save {doc ? "new version" : "document"}
        </Button>
        {doc ? (
          <>
            <Button onClick={() => void save(!doc.archived)}>{doc.archived ? "Restore" : "Archive"}</Button>
            <Button variant="ghost" onClick={() => setHistory((v) => !v)} aria-expanded={history}>
              Version history
            </Button>
          </>
        ) : null}
      </div>
      {history ? (
        <ul className={styles.list}>
          {versions.isLoading ? <li className={styles.muted}>Loading…</li> : null}
          {versions.data?.map((v) => (
            <li key={v.id} className={styles.rowBetween}>
              <span>
                v{v.version} · {formatTime(v.created_at)}
              </span>
              <span className={styles.row}>
                <Button size="sm" variant="ghost" onClick={() => { setContent(v.content); setIsDirty(true); }}>
                  Load into editor
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
