import { fenceUntrusted } from "../../lib/actionTags";
import { buildTopicStates, scoreOf } from "../../lib/trajectory";
import { getGradeScale, normaliseScore, renderGrade } from "../../lib/gradeScale";
import { useQuizAttempts } from "../../hooks/useQuizzes";
import { useLearningEvents } from "../../hooks/useLearningEvents";
import { useFolders } from "../../hooks/useFolders";
import { candidatesFromQuizAnswers } from "../../lib/misconceptions";
import type { LearningEvent } from "../../api/types";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../Button";
import { Skeleton } from "../Skeleton";
import { generateQuizQuestions } from "../../api/aiQuiz";
import { learningEventsApi } from "../../api/learningEvents";
import { learningEventsKeys } from "../../hooks/useLearningEvents";
import { useAllDecks } from "../../hooks/useDecks";
import { useFlashcards } from "../../hooks/useFlashcards";
import { useMaterials } from "../../hooks/useMaterials";
import { useSettings } from "../../context/settings";
import { buildQuickCheckSource, missedTopics, scoreQuickCheck, QUICK_CHECK_QUESTIONS } from "../../lib/quickCheck";
import { normaliseTopicKey } from "../../lib/topicKey";
import type { QuizQuestion } from "../../lib/aiJson";
import styles from "./QuickCheck.module.css";

export interface QuickCheckResult {
  correct: number;
  total: number;
  score: number;
  change?: string;
  saved?: boolean;
  /** What they got wrong, most-missed first, so the panel that shows this
   *  result can offer a way into fixing it instead of a bare score. */
  missed: string[];
}

export function QuickCheck({
  topic,
  clientId,
  deckId = null,
  folderId = null,
  onDone,
  onSkip,
}: {
  topic: string;
  clientId?: string;
  deckId?: string | null;
  folderId?: string | null;
  onDone: (result: QuickCheckResult) => void;
  onSkip: () => void;
}) {
  const qc = useQueryClient();
  const eventId = useRef(clientId ?? crypto.randomUUID());
  const finished = useRef(false);
  const attempts = useQuizAttempts();
  const events = useLearningEvents();
  const folders = useFolders();
  const [grounded, setGrounded] = useState(false);
  const [saving, setSaving] = useState(false);
  const { settings } = useSettings();
  const decks = useAllDecks();
  const cards = useFlashcards();
  const materials = useMaterials();
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [attempt, setAttempt] = useState(0);
  const [resolvedDeckId, setResolvedDeckId] = useState<string | null>(deckId);

  const ready = !decks.isPending && !cards.isPending && !materials.isPending && !attempts.isPending && !events.isPending;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setError(null);
    setQuestions(null);
    const source = buildQuickCheckSource({
      topic, deckId, folderId,
      cards: cards.data ?? [],
      decks: decks.data ?? [],
      materials: materials.data ?? [],
    });
    setResolvedDeckId(deckId ?? source.deckId);
    setGrounded(source.grounded);
    generateQuizQuestions({
      sourceText: fenceUntrusted(source.sourceText),
      topic: fenceUntrusted(topic),
      settings,
      options: { questionCount: QUICK_CHECK_QUESTIONS, difficulty: "Medium" },
    })
      .then((qs) => {
        if (cancelled) return;
        if (!qs.length) throw new Error("No usable questions returned.");
        setQuestions(qs.slice(0, QUICK_CHECK_QUESTIONS));
        setAnswers(new Array(Math.min(qs.length, QUICK_CHECK_QUESTIONS)).fill(null));
        setIndex(0);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, attempt, topic, deckId, folderId]);

  if (error) {
    return (
      <div className={styles.state} role="alert">
        <p>Couldn&rsquo;t build a check for {topic}. {error}</p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onSkip}>Skip</Button>
          <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </div>
      </div>
    );
  }
  if (!questions) {
    return <div><Skeleton label={`Writing a quick check on ${topic}`} height={160} /><Button variant="secondary" onClick={onSkip}>Skip</Button></div>;
  }

  const q = questions[index];
  const chosen = answers[index];
  const last = index === questions.length - 1;

  const finish = async () => {
    if (finished.current) return;
    finished.current = true;
    setSaving(true);
    const result: QuickCheckResult = {
      ...scoreQuickCheck(questions, answers),
      missed: missedTopics(questions, answers, topic),
    };
    const event = { id: eventId.current, user_id: "", topic_key: normaliseTopicKey(topic), source: "quick_check", score: result.score, minutes: 0, deck_id: resolvedDeckId, folder_id: folderId, occurred_at: new Date().toISOString(), payload: {}, client_id: eventId.current } as LearningEvent;
    const sources = { decks: decks.data ?? [], cards: cards.data ?? [], attempts: attempts.data ?? [], events: events.data ?? [], now: new Date() };
    const before = buildTopicStates(sources).filter(t => t.id === resolvedDeckId);
    const after = buildTopicStates({ ...sources, events: [event, ...sources.events] }).filter(t => t.id === resolvedDeckId);
    if (before.length && after.length) {
      const grade = (n: number) => renderGrade(normaliseScore(n), getGradeScale());
      result.change = `${grade(scoreOf(before))} → ${grade(scoreOf(after))}`;
    }
    /* Feed the misconception ledger from the same result that produces the
     * learning event, through the one call — this is the same
     * candidatesFromQuizAnswers path the Quiz screens use (see
     * recordQuizMisconceptions in useQuizzes.ts). Quick Check runs after
     * nearly every study session, so leaving it out was the single biggest
     * gap in the ledger's coverage. */
    const subject = folders.data?.find((f) => f.id === folderId)?.name ?? "";
    const answerRecords = questions.map((question, i) => ({
      topic: question.topic || topic,
      correct: answers[i] === question.correctIndex,
      question: question.question,
      chosen: answers[i] != null ? question.choices[answers[i]!] : undefined,
    }));
    const candidates = candidatesFromQuizAnswers(answerRecords, { subject, attemptId: eventId.current });

    try {
      const recorded = await learningEventsApi.record({
        topicKey: normaliseTopicKey(topic),
        source: "quick_check",
        score: result.score,
        deckId: resolvedDeckId,
        folderId,
        clientId: eventId.current,
        occurredAt: event.occurred_at,
        payload: { questions, answers },
      }, candidates);
      result.saved = !recorded?.queued;
      void qc.invalidateQueries({ queryKey: learningEventsKeys.all });
    } catch (err) {
      result.saved = false;
      console.warn("[quickCheck] result not recorded:", err);
    }

    onDone(result);
  };

  return (
    <div className={styles.check}>
      {!grounded ? <p>No matching source text is available. These questions use general topic knowledge.</p> : null}
      <p className={styles.progress}>Question {index + 1} of {questions.length}</p>
      <h3 className={styles.question}>{q.question}</h3>
      <div className={styles.choices} role="group" aria-label="Answers">
        {q.choices.map((choice, i) => {
          const state =
            chosen == null ? "" : i === q.correctIndex ? styles.correct : i === chosen ? styles.wrong : "";
          return (
            <button
              key={i}
              type="button"
              className={`${styles.choice} ${state}`}
              disabled={chosen != null}
              onClick={() => setAnswers((a) => a.map((v, j) => (j === index ? i : v)))}
            >
              {choice}
            </button>
          );
        })}
      </div>
      {chosen != null ? <p role="status">{chosen === q.correctIndex ? "Correct" : `Correct answer: ${q.choices[q.correctIndex]}`}</p> : null}
      {chosen != null && q.feedback ? <p className={styles.feedback}>{q.feedback}</p> : null}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onSkip}>Skip</Button>
        {last ? (
          <Button variant="primary" disabled={chosen == null || saving} onClick={() => void finish()}>Finish</Button>
        ) : (
          <Button variant="primary" disabled={chosen == null} onClick={() => setIndex((i) => i + 1)}>Next</Button>
        )}
      </div>
    </div>
  );
}
