import { useState, useRef, type KeyboardEvent, type ChangeEvent } from "react";
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  CodeIcon,
  ListIcon,
  SendIcon,
} from "./icons";
import styles from "../slackWorkspace.module.css";

export interface MentionCandidate {
  id: string;
  handle: string;
  name: string;
  role: string;
  isAi: boolean;
  badge: string;
}

const MENTION_CANDIDATES: MentionCandidate[] = [
  {
    id: "agent-k",
    handle: "K AI",
    name: "K AI",
    role: "Strategy & Growth Advisor",
    isAi: true,
    badge: "AI Advisor",
  },
  {
    id: "agent-n",
    handle: "N AI",
    name: "N AI",
    role: "Operations & Risk Advisor",
    isAi: true,
    badge: "AI Advisor",
  },
  {
    id: "karthik",
    handle: "Karthik",
    name: "Karthik",
    role: "Head of Strategy",
    isAi: false,
    badge: "Founder",
  },
  {
    id: "nirav",
    handle: "Nirav",
    name: "Nirav",
    role: "Head of Operations",
    isAi: false,
    badge: "Founder",
  },
];

export interface MessageComposerProps {
  placeholder?: string;
  onSendMessage: (content: string) => void;
  compact?: boolean;
  disabled?: boolean;
}

export function MessageComposer({
  placeholder = "Send a message...",
  onSendMessage,
  compact = false,
  disabled = false,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<{ query: string; atIndex: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = compact ? 120 : 200;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  };

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const caret = e.target.selectionStart;
    setText(val);
    adjustHeight();

    // Check for @mention trigger
    const beforeCaret = val.slice(0, caret);
    const lastAt = beforeCaret.lastIndexOf("@");
    if (lastAt >= 0 && (lastAt === 0 || /\s/.test(beforeCaret[lastAt - 1]))) {
      const q = beforeCaret.slice(lastAt + 1);
      if (!/[\n]/.test(q) && q.length <= 15) {
        setMentionQuery({ query: q, atIndex: lastAt });
        setMentionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
  };

  // Filter mention suggestions
  const filteredCandidates = mentionQuery
    ? MENTION_CANDIDATES.filter(
        (c) =>
          c.handle.toLowerCase().includes(mentionQuery.query.toLowerCase()) ||
          c.name.toLowerCase().includes(mentionQuery.query.toLowerCase()),
      )
    : [];

  const isMentionPopupOpen = Boolean(mentionQuery && filteredCandidates.length > 0);

  const insertMention = (candidate: MentionCandidate) => {
    if (!mentionQuery || !textareaRef.current) return;
    const { atIndex } = mentionQuery;
    const caret = textareaRef.current.selectionStart;

    const before = text.slice(0, atIndex);
    const after = text.slice(caret);
    const insertion = `@${candidate.handle} `;
    const updated = before + insertion + after;

    setText(updated);
    setMentionQuery(null);

    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        const nextPos = atIndex + insertion.length;
        el.setSelectionRange(nextPos, nextPos);
        adjustHeight();
      }
    }, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isMentionPopupOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(
          (prev) => (prev - 1 + filteredCandidates.length) % filteredCandidates.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredCandidates[mentionIndex]) {
          insertMention(filteredCandidates[mentionIndex]);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed);
    setText("");
    setMentionQuery(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const applyFormatting = (prefix: string, suffix: string = prefix, placeholderText = "") => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = text.slice(start, end);
    const replacement =
      selected.length > 0 ? `${prefix}${selected}${suffix}` : `${prefix}${placeholderText}${suffix}`;
    const nextText = text.slice(0, start) + replacement + text.slice(end);
    setText(nextText);

    setTimeout(() => {
      el.focus();
      const pos = start + prefix.length + (selected.length || placeholderText.length);
      el.setSelectionRange(pos, pos);
      adjustHeight();
    }, 0);
  };

  const applyList = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = text.slice(start, end);
    const replacement = selected ? `- ${selected}` : "- ";
    const nextText = text.slice(0, start) + replacement + text.slice(end);
    setText(nextText);

    setTimeout(() => {
      el.focus();
      const pos = start + replacement.length;
      el.setSelectionRange(pos, pos);
      adjustHeight();
    }, 0);
  };

  return (
    <div className={`${styles.composerContainer} ${compact ? styles.composerCompact : ""}`}>
      {/* Mention Autocomplete Suggestions Popup */}
      {isMentionPopupOpen && (
        <div
          className={styles.mentionSuggestionsPopup}
          role="listbox"
          aria-label="Mention suggestions"
        >
          <div className={styles.mentionSuggestionsHeader}>Matching Co-Founders &amp; Advisors</div>
          {filteredCandidates.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              className={`${styles.mentionSuggestionItem} ${
                idx === mentionIndex ? styles.mentionSuggestionActive : ""
              }`}
              onClick={() => insertMention(c)}
              role="option"
              aria-selected={idx === mentionIndex}
            >
              <div
                className={styles.mentionAvatar}
                style={{
                  backgroundColor: c.isAi
                    ? c.handle.startsWith("K")
                      ? "#7c3aed"
                      : "#d97706"
                    : c.handle === "Karthik"
                      ? "#0f766e"
                      : "#2563eb",
                }}
              >
                {c.name[0]}
              </div>
              <div className={styles.mentionMeta}>
                <div className={styles.mentionHandleRow}>
                  <span className={styles.mentionHandle}>@{c.handle}</span>
                  <span className={c.isAi ? styles.mentionBadgeAi : styles.mentionBadgeFounder}>
                    {c.badge}
                  </span>
                </div>
                <div className={styles.mentionRole}>{c.role}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Formatting Toolbar */}
      {!compact && (
        <div className={styles.composerToolbar} role="toolbar" aria-label="Formatting options">
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => applyFormatting("**", "**", "bold")}
            title="Bold (Ctrl+B)"
            aria-label="Bold"
          >
            <BoldIcon />
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => applyFormatting("*", "*", "italic")}
            title="Italic (Ctrl+I)"
            aria-label="Italic"
          >
            <ItalicIcon />
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => applyFormatting("~~", "~~", "strikethrough")}
            title="Strikethrough"
            aria-label="Strikethrough"
          >
            <StrikethroughIcon />
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => applyFormatting("`", "`", "code")}
            title="Inline code"
            aria-label="Code"
          >
            <CodeIcon />
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={applyList}
            title="Bullet list"
            aria-label="Bullet list"
          >
            <ListIcon />
          </button>
        </div>
      )}

      {/* Textarea */}
      <div className={styles.composerInputWrapper}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={compact ? 1 : 2}
          className={styles.composerTextarea}
          aria-label="Message input"
        />
      </div>

      {/* Action Footer */}
      <div className={styles.composerFooter}>
        <div className={styles.composerHints}>
          <span className={styles.shortcutHint}>
            <strong>Enter</strong> to send, <strong>Shift+Enter</strong> for newline
          </span>
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className={styles.composerSendButton}
          aria-label="Send message"
          title="Send message"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}
