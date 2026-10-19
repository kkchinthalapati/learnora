import { Fragment, Suspense, lazy, type ReactNode } from "react";
import { hasOpenUiBlock, splitOpenUiBlocks } from "../../lib/openui/fence";
import { renderMarkdownNodes } from "../../lib/markdownToReact";

/* Loaded on first use: the renderer and its Zod schemas are only needed once
   a reply actually carries a card. */
const OpenUiBlock = lazy(() => import("./OpenUiBlock"));

/** An AI reply as the student reads it: Markdown, with any ```openui blocks
 *  drawn as cards. Every surface that shows free-form tutor text goes through
 *  this, so a card looks and behaves the same wherever it turns up.
 *
 *  Cards are drawn whenever a reply carries one. The `openUi` flag decides
 *  whether the model is *asked* for cards; a card that arrives anyway (an
 *  older note, a stored reply) is still drawn, never shown as source. */
export function AiReply({
  text,
  diagrams = true,
  onAsk,
  streaming = false,
  notes = false,
}: {
  text: string;
  diagrams?: boolean;
  /** Sends a follow-up chip as the student's next message; omit where the
   *  surface cannot send, which hides the chips. */
  onAsk?: (text: string) => void;
  /** The reply is still arriving: a card that is cut short is not yet broken. */
  streaming?: boolean;
  /** A page of notes rather than a chat: cards use the notes set (no
   *  quizzes, flashcards or follow-up chips). */
  notes?: boolean;
}): ReactNode {
  if (!hasOpenUiBlock(text)) {
    return renderMarkdownNodes(text, { diagrams });
  }
  return splitOpenUiBlocks(text).map((segment, i) =>
    segment.kind === "openui" ? (
      <Suspense key={i} fallback={null}>
        <OpenUiBlock
          code={segment.code}
          onAsk={onAsk}
          streaming={streaming}
          notes={notes}
        />
      </Suspense>
    ) : (
      <Fragment key={i}>{renderMarkdownNodes(segment.text, { diagrams })}</Fragment>
    ),
  );
}
