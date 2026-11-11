import { useId, useState } from "react";
import { Button } from "../../components/Button";
import {
  checkExplanation,
  copiedFromNotes,
  explainBackScore,
  MIN_EXPLAIN_WORDS,
  wordCount,
  type ExplainPart,
} from "../../api/explainBack";
import { learningEventsApi } from "../../api/learningEvents";
import { candidatesFromMarking, type Marking } from "../../lib/photoMarking";
import { normaliseTopicKey } from "../../lib/topicKey";
import styles from "./learn.module.css";

/* The last step of a lesson: say it in your own words.
 *
 * Every check before this one is a choice between four answers, which shows
 * a student can recognise the idea. This shows whether they can produce it.
 * It is an invitation, not a test: there is no score, only what came across
 * (with the student's own words quoted back), what was left out, and
 * anything that was actually wrong. The reading is api/explainBack.ts.
 *
 * What is recorded: a wrong idea the student wrote goes to the ledger, as it
 * does from a marked exam answer. Knowing the lesson is recorded only when
 * every part came across. A part left out is recorded as nothing. */

export interface ExplainBackProgress {
  answer: string;
  marking: Marking;
}

/** A short, stable tag for an answer's wording (FNV-1a), so a retried write
 *  lands once and a second attempt is its own event. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function ExplainBack({
  materialId,
  lesson,
  subject,
  parts,
  saved,
  onSave,
  onRevisit,
}: {
  materialId: string;
  lesson: string;
  subject: string | null;
  parts: readonly ExplainPart[];
  saved: ExplainBackProgress | undefined;
  onSave: (next: ExplainBackProgress | undefined) => void;
  /** Go back to one part of the lesson. */
  onRevisit: (sectionKey: string) => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState(saved?.answer ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    const answer = draft.trim();
    if (!answer || busy) return;
    if (wordCount(answer) < MIN_EXPLAIN_WORDS) {
      setError("Give it a few sentences, so there's something to read.");
      return;
    }
    if (copiedFromNotes(answer, parts.map((p) => p.notes).join("\n"))) {
      setError("That reads like the notes themselves. Put them away and say it the way you'd tell a friend.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const marking = await checkExplanation({
        materialId,
        lesson,
        subject: subject || "General",
        parts,
        answer,
      });
      onSave({ answer, marking });
      if (marking.kind === "marked") {
        const runId = `learn-explain:${materialId}:${hash(answer)}`;
        void learningEventsApi
          .record(
            {
              source: "quick_check",
              topicKey: normaliseTopicKey(lesson),
              score: explainBackScore(marking),
              clientId: runId,
              payload: { mode: "learn-explain-back", materialId, parts: marking.total, covered: marking.awarded },
            },
            candidatesFromMarking(marking, subject || "General", runId),
          )
          .catch(() => {
            /* Best-effort, like every other evidence write. */
          });
      }
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "The tutor didn't answer.");
    } finally {
      setBusy(false);
    }
  };

  const marking = saved?.marking;
  if (marking && marking.kind === "marked") {
    const covered = marking.points.filter((p) => p.verdict === "awarded");
    const leftOut = marking.points
      .map((p, i) => ({ p, part: parts[i] }))
      .filter(({ p }) => p.verdict !== "awarded");
    return (
      <section className={styles.explainBack} aria-labelledby={titleId}>
        <h3 id={titleId} className={styles.explainTitle}>
          Your explanation
        </h3>
        <div className={styles.results} aria-live="polite">
          <p className={styles.lead}>
            {leftOut.length === 0
              ? "All of it came across, in your own words."
              : covered.length === 0
                ? "None of the lesson's parts came across clearly yet. That's what a first go is for."
                : `${covered.length} of ${marking.total} parts came across.`}
          </p>
          {covered.length ? (
            <>
              <h4 className={styles.explainLabel}>What came across</h4>
              <ul className={styles.points} aria-label="What came across">
                {covered.map((p, i) => (
                  <li key={i} data-verdict="awarded">
                    <span className={styles.pointMark} aria-hidden="true">
                      ✓
                    </span>
                    <span>
                      {p.point.text}
                      <span className={styles.pointNote}>Your words: “{p.evidence}”</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {leftOut.length ? (
            <>
              <h4 className={styles.explainLabel}>What you left out</h4>
              <ul className={styles.points} aria-label="What you left out">
                {leftOut.map(({ p, part }, i) => (
                  <li key={i} data-verdict="unchecked">
                    <span className={styles.pointMark} aria-hidden="true">
                      ·
                    </span>
                    <span>
                      {p.point.text}
                      {p.note ? <span className={styles.pointNote}>{p.note}</span> : null}
                      {part ? (
                        <button type="button" className={styles.quietLink} onClick={() => onRevisit(part.key)}>
                          Go over this part again
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {marking.beliefs.length ? (
            <>
              <h4 className={styles.explainLabel}>Worth another look</h4>
              <ul className={styles.points} aria-label="Worth another look">
                {marking.beliefs.map((b, i) => (
                  <li key={i} data-verdict="missed">
                    <span className={styles.pointMark} aria-hidden="true">
                      !
                    </span>
                    <span>
                      {b.belief}
                      <span className={styles.pointNote}>You wrote: “{b.quote}”. Saved, so it comes back.</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => onSave(undefined)}>
              {leftOut.length ? "Try again" : "Explain it again"}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.explainBack} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.explainTitle}>
        Can you explain this in your own words?
      </h3>
      <p className={styles.note}>
        A few sentences, the way you'd tell a friend who missed the lesson. No marks: you'll see what came across
        and what you left out.
      </p>
      <div className={styles.examForm}>
        <textarea
          className={styles.answer}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Start anywhere. What is this lesson about, and how does it work?"
          aria-label="Your explanation"
          rows={5}
          disabled={busy}
        />
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button variant="primary" busy={busy} disabled={!draft.trim()} onClick={() => void check()}>
            {busy ? "Reading" : "Check my explanation"}
          </Button>
        </div>
      </div>
    </section>
  );
}
