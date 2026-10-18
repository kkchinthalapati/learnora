import { useState } from "react";
import { Renderer, type OpenUIError } from "@openuidev/react-lang";
import { AskContext } from "../../lib/openui/askContext";
import { askLibrary } from "../../lib/openui/library";
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
}: {
  code: string;
  /** Sends a follow-up as the student's next message; absent where the
   *  surface cannot send, which hides the follow-up chips. */
  onAsk?: (text: string) => void;
}) {
  const [errors, setErrors] = useState<OpenUIError[]>([]);
  const failed = errors.some((e) => e.severity !== "warning");

  return (
    <div data-testid="openui-block">
      <AskContext.Provider value={onAsk ?? null}>
        <Renderer
          library={askLibrary}
          response={code}
          isStreaming={false}
          onError={setErrors}
        />
      </AskContext.Provider>
      {failed ? (
        <p className={styles.cardNotice} role="note">
          Part of this card couldn’t be shown.
        </p>
      ) : null}
    </div>
  );
}
