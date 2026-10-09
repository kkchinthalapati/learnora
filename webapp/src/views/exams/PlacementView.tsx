import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { Skeleton } from "../../components/Skeleton";
import { useExams } from "../../hooks/useExams";
import { learningEventsKeys } from "../../hooks/useLearningEvents";
import { bankToQuiz, fetchBankQuestions } from "../../api/questionBank";
import { learningEventsApi } from "../../api/learningEvents";
import type { QuizQuestion } from "../../lib/aiJson";
import { storedAnswer } from "../../lib/attempts";
import { renderMathText } from "../../lib/markdownToReact";
import { newSessionHref } from "../../lib/sessionModes";
import {
  defaultTier,
  getSpec,
  isTier,
  specWithTierLabel,
  topicInTier,
  type SyllabusSpec,
} from "../../lib/syllabus";
import {
  nextPlacementTopic,
  PLACEMENT_MAX_QUESTIONS,
  placementResult,
  recordPlacement,
  startPlacement,
  type PlacementOutcome,
  type PlacementState,
} from "../../lib/placement";
import { normaliseTopicKey } from "../../lib/topicKey";
import styles from "../../components/quickcheck/QuickCheck.module.css";
import examStyles from "./examDetail.module.css";

/* "Find my level": up to twelve questions from the practice bank, chosen one
 * at a time (lib/placement.ts), with no feedback until the end. The answers
 * are recorded like any practice (a learning event with per-answer items),
 * so the knowledge model starts from them rather than from nothing. */

type Asked = {
  question: QuizQuestion;
  topicRef: string;
  chosen: number | null;
  outcome: PlacementOutcome;
  secondsSpent: number;
};

export function PlacementView() {
  const { examId } = useParams<{ examId: string }>();
  const exams = useExams();
  const exam = (exams.data ?? []).find((e) => String(e.id) === examId) ?? null;
  const spec = getSpec(exam?.syllabus_id);
  const tier = spec ? (isTier(spec, exam?.syllabus_tier) ? exam!.syllabus_tier! : defaultTier(spec)) : null;

  if (exams.isPending) return <Skeleton height={240} />;
  if (!exam || !spec || !tier) {
    return (
      <EmptyState
        title="No specification on this exam"
        message="Choose the exam board and specification on the exam page first; the check is built from it."
        icon="calendar"
      >
        <Link to={exam ? `/exams/${exam.id}` : "/exams"}>Back</Link>
      </EmptyState>
    );
  }
  return <Placement key={spec.id} spec={spec} tier={tier} examId={String(exam.id)} examName={exam.exam_name} />;
}

function Placement({
  spec,
  tier,
  examId,
  examName,
}: {
  spec: SyllabusSpec;
  tier: NonNullable<ReturnType<typeof defaultTier>>;
  examId: string;
  examName: string;
}) {
  const qc = useQueryClient();
  const [bank, setBank] = useState<Map<string, QuizQuestion[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PlacementState>(() => startPlacement(spec, tier));
  const [asked, setAsked] = useState<Asked[]>([]);
  const [saved, setSaved] = useState<boolean | null>(null);
  const shownAt = useRef(Date.now());
  const eventId = useRef(crypto.randomUUID());

  useEffect(() => {
    let cancelled = false;
    const refs = spec.topics.filter((t) => topicInTier(t, tier)).map((t) => t.ref);
    fetchBankQuestions(spec, refs, tier)
      .then((rows) => {
        if (cancelled) return;
        const questions = bankToQuiz(spec, rows);
        const byTopic = new Map<string, QuizQuestion[]>();
        rows.forEach((row, i) => {
          const list = byTopic.get(row.topic_ref) ?? [];
          list.push(questions[i]);
          byTopic.set(row.topic_ref, list);
        });
        for (const list of byTopic.values()) list.sort(() => Math.random() - 0.5);
        setBank(byTopic);
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [spec, tier]);

  const used = useMemo(() => new Set(asked.map((a) => a.question.ref)), [asked]);
  const nextRef = bank
    ? nextPlacementTopic(spec, tier, state, (ref) => (bank.get(ref) ?? []).some((q) => !used.has(q.ref)))
    : null;
  const current = nextRef ? (bank!.get(nextRef) ?? []).find((q) => !used.has(q.ref)) ?? null : null;
  const done = bank !== null && (!nextRef || !current);

  /* Recorded once, at the end, as one learning event with every answer. */
  useEffect(() => {
    if (!done || saved !== null || asked.length === 0) return;
    const items = asked.map((a) => storedAnswer(a.question, a.chosen, { topic: a.question.topic, secondsSpent: a.secondsSpent }));
    const right = asked.filter((a) => a.outcome === "right").length;
    learningEventsApi
      .record({
        topicKey: normaliseTopicKey(examName),
        source: "quick_check",
        score: right / asked.length,
        clientId: eventId.current,
        payload: { kind: "placement", specId: spec.id, items },
      })
      .then((r) => {
        setSaved(!r?.queued);
        void qc.invalidateQueries({ queryKey: learningEventsKeys.all });
      })
      .catch(() => setSaved(false));
  }, [done, saved, asked, examName, spec.id, qc]);

  const answer = (chosen: number | null) => {
    if (!current || !nextRef) return;
    const outcome: PlacementOutcome =
      chosen === null ? "not-learned" : chosen === current.correctIndex ? "right" : "wrong";
    const secondsSpent = Math.round((Date.now() - shownAt.current) / 1000);
    setAsked((a) => [...a, { question: current, topicRef: nextRef, chosen, outcome, secondsSpent }]);
    setState((s) => recordPlacement(spec, s, nextRef, outcome));
    shownAt.current = Date.now();
  };

  const header = (
    <PageHeader
      eyebrow={specWithTierLabel(spec, tier)}
      title="Find my level"
      sub={`${examName} · up to ${PLACEMENT_MAX_QUESTIONS} questions, no marks shown until the end`}
    />
  );

  if (error) {
    return (
      <div className={examStyles.page}>
        {header}
        <p role="alert">Couldn&rsquo;t load the questions. {error}</p>
      </div>
    );
  }
  if (!bank) {
    return (
      <div className={examStyles.page}>
        {header}
        <Skeleton label="Choosing your first question" height={200} />
      </div>
    );
  }

  if (done) {
    const result = placementResult(spec, state);
    const title = (ref: string) => spec.topics.find((t) => t.ref === ref)?.title ?? ref;
    const firstGap = result.gaps[0] ? title(result.gaps[0]) : null;
    return (
      <div className={examStyles.page}>
        {header}
        <Card padding="lg" as="section" aria-labelledby="placement-result">
          <h2 id="placement-result" className={examStyles.sectionTitle}>
            Where you are: a starting estimate
          </h2>
          <p className={examStyles.muted}>
            From {asked.length} {asked.length === 1 ? "question" : "questions"}. It is a first guess, not a
            mark: every practice session from here sharpens it.
            {saved === false ? " Your answers couldn't be saved; they will be retried." : ""}
          </p>
          {result.gaps.length > 0 && (
            <>
              <h3 className={examStyles.subTitle}>Start with</h3>
              <ul>
                {result.gaps.map((ref) => (
                  <li key={ref}>{title(ref)}</li>
                ))}
              </ul>
            </>
          )}
          {result.known.length > 0 && (
            <>
              <h3 className={examStyles.subTitle}>Looks secure for now</h3>
              <p className={examStyles.muted}>{result.known.map(title).join(", ")}</p>
            </>
          )}
          {result.unsure.length > 0 && (
            <>
              <h3 className={examStyles.subTitle}>Not sure yet</h3>
              <p className={examStyles.muted}>{result.unsure.map(title).join(", ")}</p>
            </>
          )}
          <div className={styles.actions}>
            <Link className={examStyles.secondaryLink} to={`/exams/${examId}`}>
              Back to the exam
            </Link>
            {firstGap && (
              <Link className={examStyles.primaryLink} to={newSessionHref("explain", { topic: firstGap })}>
                Start {firstGap}
              </Link>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={examStyles.page}>
      {header}
      <Card padding="lg">
        <div className={styles.check}>
          <p className={styles.progress}>
            Question {asked.length + 1} · {current!.topic}
          </p>
          <h3 className={styles.question}>{renderMathText(current!.question)}</h3>
          <div className={styles.choices} role="group" aria-label="Answers">
            {current!.choices.map((choice, i) => (
              <button key={i} type="button" className={styles.choice} onClick={() => answer(i)}>
                {renderMathText(choice)}
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => answer(null)}>
              I haven&rsquo;t learned this yet
            </Button>
          </div>
          {current!.attribution ? <p className={examStyles.muted}>{current!.attribution}</p> : null}
        </div>
      </Card>
    </div>
  );
}
