import { Icon } from "../Icon";
import {
  renderMarkdownNodes,
  renderMarkdownSegments,
  type MarkdownSegment,
} from "../../lib/markdownToReact";
import type { ActionWidget, ChatMessage as Message } from "../../context/chat";
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

export function ChatMessageBubble({ message }: { message: Message }) {
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

  let body;
  if (message.pending) {
    body = <ThinkingDots />;
  } else if (message.cards) {
    body = (
      <div>
        <p className={styles.cardsIntro}>
          {message.cards.length} flashcards. Use <strong>+ Create</strong> to
          save a set you want to keep.
        </p>
        <dl className={styles.cards}>
          {message.cards.map((card, i) => (
            <div key={i} className={styles.card}>
              <dt>{card.front}</dt>
              <dd>{card.back}</dd>
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
  } else if (message.text) {
    body = renderMarkdownNodes(message.text);
  } else {
    /* Every visible word was an action tag — the vanilla said the same
       (js/ai.js:1256). */
    body = <em>Action completed.</em>;
  }

  return (
    <div className={classes} role={message.error ? "alert" : undefined}>
      {body}
    </div>
  );
}
