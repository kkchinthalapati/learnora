import { useMemo, type ReactNode } from "react";
import { Badge } from "../../components/Badge";
import { splitForHighlight } from "../../lib/boardroom/mentions";
import type { Agent, Member } from "../../lib/boardroom/types";
import styles from "./boardroom.module.css";

/* Small pieces every Boardroom screen shares. */

export function useNames(members: Member[], agents: Agent[]) {
  return useMemo(() => {
    const person = (id: string | null | undefined) =>
      members.find((m) => m.user_id === id)?.display_name ?? "Someone";
    const agent = (id: string | null | undefined) =>
      agents.find((a) => a.id === id)?.display_name ?? "AI profile";
    const role = (id: string | null | undefined) => members.find((m) => m.user_id === id)?.role;
    return { person, agent, role };
  }, [members, agents]);
}

const TIME = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : TIME.format(d);
}

/** Copy to the clipboard. Resolves false — never pretends — when it could not. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function Titled({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.bar}>
      <div>
        <h1 className={styles.h1}>{title}</h1>
        {sub ? <p className={styles.sub}>{sub}</p> : null}
      </div>
      {actions ? <div className={styles.row}>{actions}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved" || status === "final" || status === "done" || status === "published"
      ? "success"
      : status === "rejected" || status === "failed" || status === "cancelled"
        ? "danger"
        : status === "contested" || status === "awaiting_founders" || status === "blocked" || status === "awaiting_owner"
          ? "warning"
          : status === "in_progress"
            ? "accent"
            : "neutral";
  return <Badge tone={tone}>{status.replace(/_/g, " ")}</Badge>;
}

/** Plain text with @mentions highlighted. Text nodes only: nothing is parsed as markup. */
export function MentionText({
  text,
  agents,
  members,
}: {
  text: string;
  agents: Agent[];
  members: Member[];
}) {
  const parts = useMemo(() => splitForHighlight(text, agents, members), [text, agents, members]);
  return (
    <>
      {parts.map((p, i) =>
        p.mention ? (
          <span key={i} className={styles.mention}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint ? <span className={styles.meta}>{hint}</span> : null}
    </label>
  );
}
