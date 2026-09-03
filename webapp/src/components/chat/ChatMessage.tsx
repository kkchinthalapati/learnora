import { useState } from "react";
import { Icon } from "../Icon";
import { Button } from "../Button";
import {
  renderMarkdownNodes,
  renderMarkdownSegments,
  renderMathText,
  type MarkdownSegment,
} from "../../lib/markdownToReact";
import type { ActionWidget, ChatMessage as Message, WebCitation } from "../../context/chat";
import styles from "./chat.module.css";

/* One chat bubble — ports `_appendBubble` (js/ai.js:1276-1298) and the action
 * widgets from the replace pass at :1181-1240.
 *
 * The vanilla built every bubble with `innerHTML`: the user's own text went
 * through `esc()`, and the model's reply through `renderMarkdown` (which
 * escapes first). Here both are React children, so escaping is structural
 * rather than a call someone has to remember. */

function ActionWidgetChip({ widget }: { widget: ActionWidget }) {
  return (
    <div
      className={`${styles.widget}${widget.cancelled ? ` ${styles.widgetCancelled}` : ""}`}
    >
      <span className={styles.widgetIcon}>
        <Icon name={widget.icon} size={14} />
      </span>
      <span>
        {widget.text}
        {widget.subject ? (
          <>
            {" "}
            <strong>{widget.subject}</strong>
          </>
        ) : null}
      </span>
    </div>
  );
}

function ThinkingDots() {
  /* The edge function returns one complete response, not a token stream, so
     this is an honest "thinking" state rather than a typing cursor implying
     text is arriving gradually (js/ai.js:1074-1078). */
  return (
    <span className={styles.thinking} aria-label="Learnora AI is thinking">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </span>
  );
}

function extractDomain(url?: string): string {
  if (!url) return "web";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function extractInlineWebCitations(text: string): WebCitation[] {
  if (!text) return [];
  const regex = /<WEB_CITATION>([\s\S]*?)<\/WEB_CITATION>/gi;
  const list: WebCitation[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const parts = match[1].split("||");
    const title = parts[0]?.trim() || "Web Source";
    const url = parts[1]?.trim() || "";
    const snippet = parts[2]?.trim() || "";
    list.push({
      title,
      url,
      snippet,
      domain: extractDomain(url),
    });
  }
  return list;
}

export function ChatMessageBubble({
  message,
  onSaveCards,
  onAddToNotebook,
}: {
  message: Message;
  /** Persists `message.cards` as a real deck. Omitted where a cards-shaped
   *  message can never occur (the notes sidebar generates no such replies —
   *  see NotesAiSidebar's header comment), so the button silently isn't
   *  offered rather than wired to nothing. */
  onSaveCards?: (messageId: string) => void;
  onAddToNotebook?: (citation: {
    title: string;
    url?: string;
    snippet?: string;
  }) => void | Promise<void>;
}) {
  const [addedCitations, setAddedCitations] = useState<Set<string>>(new Set());

  if (message.role === "user") {
    return (
      <div className={`${styles.bubble} ${styles.userBubble}`}>
        {message.fileName ? (
          <div className={styles.attachment}>
            <Icon name="paperclip" size={13} />
            <em>{message.fileName}</em>
          </div>
        ) : null}
        {message.text}
      </div>
    );
  }

  const classes = [
    styles.bubble,
    styles.aiBubble,
    message.error ? styles.errorBubble : null,
  ]
    .filter(Boolean)
    .join(" ");

  // Extract or resolve web citations
  const inlineCitations = extractInlineWebCitations(message.text);
  const webSources: WebCitation[] =
    message.webSources && message.webSources.length > 0
      ? message.webSources
      : inlineCitations;

  // Clean raw tags from message text for display
  const cleanDisplayContent = message.text
    ? message.text.replace(/<WEB_CITATION>[\s\S]*?<\/WEB_CITATION>/gi, "").trim()
    : "";

  let body;
  if (message.pending) {
    body = <ThinkingDots />;
  } else if (message.cards) {
    body = (
      <div>
        <div className={styles.cardsHead}>
          <p className={styles.cardsIntro}>{message.cards.length} flashcards</p>
          {onSaveCards ? (
            message.savedDeckId ? (
              <span className={styles.cardsSaved}>
                <Icon name="check" size={14} />
                Saved
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={message.savingCards}
                onClick={() => onSaveCards(message.id)}
              >
                <Icon name="layers" size={14} />
                {message.savingCards ? "Saving…" : "Save as deck"}
              </Button>
            )
          ) : null}
        </div>
        <dl className={styles.cards}>
          {message.cards.map((card, i) => (
            <div key={i} className={styles.card}>
              {/* Typeset, not printed — same treatment the review screen
                  gives these cards once they are saved, so a deck does not
                  change appearance the moment it lands in the library.
                  Maths only: a card face is one question, not a document. */}
              <dt>{renderMathText(card.front)}</dt>
              <dd>{renderMathText(card.back)}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  } else if (message.parts) {
    const segments: MarkdownSegment[] = message.parts.map((part, i) =>
      part.kind === "text"
        ? { kind: "text", text: part.text }
        : {
            kind: "node",
            node: <ActionWidgetChip key={`w-${i}`} widget={part.widget} />,
          },
    );
    body = renderMarkdownSegments(segments);
  } else if (cleanDisplayContent) {
    body = renderMarkdownNodes(cleanDisplayContent);
  } else {
    /* Every visible word was an action tag — the vanilla said the same
       (js/ai.js:1256). */
    body = <em>Action completed.</em>;
  }

  const handleAddCitation = (citation: WebCitation) => {
    setAddedCitations((prev) => new Set([...prev, citation.title]));
    onAddToNotebook?.({
      title: citation.title,
      url: citation.url,
      snippet: citation.snippet,
    });
  };

  return (
    <div className={classes} role={message.error ? "alert" : undefined}>
      {body}

      {/* Web Citation Cards */}
      {webSources.length > 0 && !message.pending && (
        <div className={styles.citationsWrapper} data-testid="web-citations-container">
          <div className={styles.citationsHeader}>
            <Icon name="globe" size={12} />
            <span>Web Sources ({webSources.length})</span>
          </div>
          <div className={styles.citationList}>
            {webSources.map((citation, i) => {
              const isAdded = addedCitations.has(citation.title);
              const domain = citation.domain || extractDomain(citation.url);
              return (
                <div
                  key={citation.id || `cit-${i}`}
                  className={styles.citationCard}
                  data-testid="web-citation-card"
                >
                  <div className={styles.citationHeader}>
                    {citation.url ? (
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.citationTitle}
                      >
                        {citation.title} ↗
                      </a>
                    ) : (
                      <span className={styles.citationTitle}>
                        {citation.title}
                      </span>
                    )}
                    <span className={styles.citationDomainBadge}>
                      🌐 {domain}
                    </span>
                  </div>

                  {citation.snippet && (
                    <p className={styles.citationSnippet}>{citation.snippet}</p>
                  )}

                  <div className={styles.citationAction}>
                    <button
                      type="button"
                      className={`${styles.addCitationBtn}${
                        isAdded ? ` ${styles.addCitationBtnSuccess}` : ""
                      }`}
                      onClick={() => handleAddCitation(citation)}
                      disabled={isAdded}
                      aria-label={
                        isAdded
                          ? `Added ${citation.title} to Notebook`
                          : `Add ${citation.title} to Notebook`
                      }
                    >
                      {isAdded ? "✓ Added to Notebook" : "📥 Add to Notebook"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
