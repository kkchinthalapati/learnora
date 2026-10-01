import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { useQuizAttempts } from "../../hooks/useQuizzes";
import type { QuizQuestion } from "../../lib/aiJson";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import { newSessionHref } from "../../lib/sessionModes";
import text from "../../styles/text.module.css";
import { parseStoredAnswers, type StoredAnswer } from "./quizMeta";
import {
  byConcept,
  compareAttempts,
  confidentButWrong,
  resultsHeadline,
  type Mark,
} from "./testResultsModel";
import styles from "./results.module.css";

const MARK_LABEL: Record<Mark, string> = {
  right: "correct",
  guessed: "correct, but guessed",
  wrong: "wrong",
  blank: "not answered",
};

const MARK_GLYPH: Record<Mark, string> = {
  right: "✓",
  guessed: "?",
  wrong: "✕",
  blank: "–",
};

/* The results screen both runners end on. The score is a caption; the
 * headline is the finding. Confident-but-wrong answers are grouped by the
 * idea behind them (from the misconception ledger) and lead, because one
 * belief costing several marks is the most useful thing a test can tell
 * you. Every mark carries a glyph as well as a colour. */
export function TestResults({
  quizId,
  title,
  questions,
  answers,
  onRetake,
  note,
}: {
  quizId: string;
  title: string;
  questions: QuizQuestion[];
  answers: StoredAnswer[];
  onRetake?: () => void;
  /** A line about how the sitting ended ("Time's up."). */
  note?: string;
}) {
  const { all: ledger } = useMisconceptions();
  const attempts = useQuizAttempts();
  /* The attempt before this one: this one may already be in the list once
     its write lands, so anything newer than the screen's first paint is
     ignored. */
  const [shownAt] = useState(() => Date.now());

  const rows = useMemo(() => byConcept(questions, answers), [questions, answers]);
  const groups = useMemo(
    () => confidentButWrong(questions, answers, ledger),
    [questions, answers, ledger],
  );
  const score = answers.filter((a) => a.correct).length;
  const total = questions.length;
  const headline = resultsHeadline(rows, groups);

  const previous = useMemo(() => {
    const prior = (attempts.data ?? [])
      .filter(
        (a) => a.quiz_id === quizId && new Date(a.created_at).getTime() < shownAt - 1000,
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return prior ? { answers: parseStoredAnswers(prior.answers_json), score: prior.score } : null;
  }, [attempts.data, quizId, shownAt]);
  const comparison = compareAttempts(previous?.answers ?? null, answers, previous?.score);

  const lead = groups[0];
  const weakest = rows.find((r) => r.status === "review");
  const clean = rows.every((r) => r.status === "secure" || r.status === "lucky");

  /* A link, because it goes somewhere; the click hands the concept to the
     Session the way every tool-to-tool handoff does. */
  const handOff = (concept: string, summary?: string) => {
    CognitiveBridge.setPayload({
      subject: title,
      topic: concept,
      concept,
      sourceTool: "quiz",
      sourceId: quizId,
      evidencePrompt: summary,
      misconceptions: summary ? [summary] : undefined,
      suggestedAction: "spar_orally",
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <p className={text.meta}>
          {title} · {score} of {total}
        </p>
        {/* h2: the shell's header already names the page ("Quiz") as its
            one h1. */}
        <h2 className={`${text.display} ${styles.headline}`}>{headline}</h2>
        {note ? <p className={styles.caption}>{note}</p> : null}

        {lead ? (
          <section className={styles.card} aria-labelledby="confident-wrong">
            <p className={styles.cardLabel} id="confident-wrong">
              Confident but wrong{" "}
              <span className={styles.qs}>
                {lead.questions.map((n) => `Q${n}`).join(", ")}
              </span>
            </p>
            <p className={styles.diagnosis}>
              {lead.misconception?.summary ??
                `You were sure of ${lead.questions.length === 1 ? "an answer" : `${lead.questions.length} answers`} on ${lead.concept}, and ${lead.questions.length === 1 ? "it was" : "they were"} wrong. That usually means one idea is off, not separate slips.`}
            </p>
            <div className={styles.actions}>
              <Link
                to={newSessionHref("socratic", {
                  topic: lead.concept,
                  misconception: lead.misconception?.id,
                })}
                onClick={() => handOff(lead.concept, lead.misconception?.summary)}
                className={styles.primaryLink}
              >
                Fix it · 8 min Socratic
              </Link>
              <Link to={`/quiz/${quizId}/review`} className={styles.secondaryLink}>
                Review the {lead.questions.length}{" "}
                {lead.questions.length === 1 ? "question" : "questions"}
              </Link>
            </div>
          </section>
        ) : weakest ? (
          <div className={styles.actions}>
            <Link
              to={newSessionHref("socratic", { topic: weakest.concept })}
              onClick={() => handOff(weakest.concept)}
              className={styles.primaryLink}
            >
              Work on {weakest.concept}
            </Link>
            <Link to={`/quiz/${quizId}/review`} className={styles.secondaryLink}>
              Review answers
            </Link>
          </div>
        ) : clean ? (
          <p className={styles.caption}>
            Recall will bring these back before they fade.
          </p>
        ) : null}

        <section aria-labelledby="by-concept">
          <h2 id="by-concept" className={styles.sectionTitle}>
            By concept
          </h2>
          <ul className={styles.rows}>
            {rows.map((row) => (
              <li key={row.concept} className={styles.row}>
                <span className={styles.concept}>{row.concept}</span>
                <span className={styles.squares}>
                  {row.marks.map((m) => (
                    <span
                      key={m.number}
                      className={styles.square}
                      data-mark={m.mark}
                      title={`Q${m.number}: ${MARK_LABEL[m.mark]}`}
                    >
                      <span aria-hidden="true">{MARK_GLYPH[m.mark]}</span>
                      <span className={styles.srOnly}>
                        Q{m.number}: {MARK_LABEL[m.mark]}.
                      </span>
                    </span>
                  ))}
                </span>
                <span className={styles.status} data-status={row.status}>
                  {row.note}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className={styles.rail} aria-label="What happens next">
        {comparison ? (
          <section className={styles.railSection}>
            <h2 className={styles.railTitle}>Compared with last attempt</h2>
            <p className={styles.railText}>
              {comparison.before} → {comparison.after} correct.
              {comparison.guessesBefore !== undefined
                ? ` Your guesses went from ${comparison.guessesBefore} to ${comparison.guessesAfter}.`
                : ""}
            </p>
          </section>
        ) : null}
        <section className={styles.railSection}>
          <h2 className={styles.railTitle}>Scheduled for you</h2>
          <p className={styles.railText}>
            {clean
              ? "Nothing to fix. Recall brings these back before they fade."
              : "Wrong and guessed questions come back in Recall, sooner than the ones you knew. Today will put them in front of you."}
          </p>
          <Link to="/plan" className={styles.railLink}>
            Change plan
          </Link>
        </section>
        <section className={styles.railSection}>
          <h2 className={styles.railTitle}>This test</h2>
          <div className={styles.railActions}>
            {onRetake ? (
              <Button variant="secondary" size="sm" onClick={onRetake}>
                Retake test
              </Button>
            ) : null}
            {clean ? (
              <Link to={`/quiz/${quizId}/review`} className={styles.railLink}>
                Review answers
              </Link>
            ) : null}
            <Link to="/library/quizzes" className={styles.railLink}>
              Back to Quizzes
            </Link>
          </div>
        </section>
      </aside>
    </div>
  );
}
