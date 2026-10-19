import { useState } from "react";
import { Renderer, type Library, type OpenUIError } from "@openuidev/react-lang";
import { AskContext } from "../../lib/openui/askContext";
import { askLibrary, guideLibrary } from "../../lib/openui/library";
import styles from "./chat.module.css";

/* One ```openui block from a reply, drawn with the Ask library.
 *
 * The block is model output, so it can be wrong: an unknown component, a
 * missing argument, no root. The parser drops what it cannot use and reports
 * it, and when anything was dropped this says so — a half-drawn card that
 * looked complete would be a model's mistake passing as the app's. The
 * Markdown around the block is untouched either way. */
export default function OpenUiBlock({
  code,
  onAsk,
  library,
  notes = false,
  streaming = false,
}: {
  code: string;
  /** Still arriving: the card may be partial, so no notice is drawn yet. */
  streaming?: boolean;
  /** Which components the block may use. Defaults to the notes set when
   *  `notes` is on, otherwise the chat's full set. */
  library?: Library;
  /** A page of notes: no quizzes, flashcards or follow-up chips. */
  notes?: boolean;
  /** Sends a follow-up as the student's next message; absent where the
   *  surface cannot send, which hides the follow-up chips. */
  onAsk?: (text: string) => void;
}) {
  const [errors, setErrors] = useState<OpenUIError[]>([]);
  const failed = !streaming && errors.some((e) => e.severity !== "warning");

  return (
    <div data-testid="openui-block">
      <AskContext.Provider value={onAsk ?? null}>
        <Renderer
          library={library ?? (notes ? guideLibrary : askLibrary)}
          response={code}
          isStreaming={streaming}
          onError={setErrors}
        />
      </AskContext.Provider>
      {failed ? (
        <p className={styles.cardNotice} role="note">
          Some of this card couldn’t be drawn, so it was left out. The rest is above.
        </p>
      ) : null}
    </div>
  );
}
