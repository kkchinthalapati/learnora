import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../context/toast";
import { createBankQuiz, hasBank } from "../../api/questionBank";
import { quizzesKeys } from "../../hooks/useQuizzes";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { Skeleton } from "../../components/Skeleton";
import { useExams } from "../../hooks/useExams";
import { useQuizAttempts, useQuizzes } from "../../hooks/useQuizzes";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { localDateStr } from "../../lib/date";
import { plural } from "../../lib/plural";
import { anyPending } from "../../lib/queryState";
import {
  defaultTier,
  getSpec,
  isTier,
  matchSpecTopic,
  specWithTierLabel,
} from "../../lib/syllabus";
import { buildStudentEvidence } from "../../lib/studentEvidence";
import {
  MIN_FORECAST_QUIZZES,
  calculateQuizForecast,
  daysUntil,
  formatForecastRange,
} from "../../lib/quizForecast";
import {
  nextSpecTopics,
  prioritiseSpecTopics,
  specCoverage,
  type SpecTopicPriority,
} from "../../lib/specPriorities";
import {
  attemptTimeline,
  buildCalibration,
  scopeToSpec,
} from "../../lib/examEvidence";
import { ExamModal } from "./ExamModal";
import { PastPapersCard } from "./PastPapersCard";
import styles from "./examDetail.module.css";

/* One exam, and the evidence behind every number the app says about it.
 *
 * The forecast elsewhere is a headline; here it is taken apart: which topics
 * carry the marks, which of them the student has actually been tested on, how
 * the forecast was arrived at, what they currently believe that is wrong, and
 * whether their confidence can be trusted. Every figure is computed from the
 * student's own quizzes on this exam's topics, and says so when there are too
 * few of them to mean anything. */

const TOP_TOPICS = 8;

const STATUS_LABEL: Record<SpecTopicPriority["status"], string> = {
  weak: "Weak",
  developing: "Developing",
  secure: "Secure",
  untested: "Not tested yet",
};

function formatWeight(percent: number): string {
  return percent >= 1 ? `${Math.round(percent)}%` : "<1%";
}

export function ExamDetailView() {
  const { examId } = useParams<{ examId: string }>();
  const exams = useExams();
  const quizzes = useQuizzes();
  const attempts = useQuizAttempts();
  const { all: ledger } = useMisconceptions();
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();
  /* Which practice quiz is being built: "top" or a topic ref. */
  const [practising, setPractising] = useState<string | null>(null);

  const exam = (exams.data ?? []).find((e) => String(e.id) === examId) ?? null;
  const spec = getSpec(exam?.syllabus_id);
  const tier = spec ? (isTier(spec, exam?.syllabus_tier) ? exam!.syllabus_tier! : null) : null;
  const effectiveTier = spec ? (tier ?? defaultTier(spec)) : null;

  const derived = useMemo(() => {
    if (!spec || !effectiveTier || !exam) return null;
    const scoped = scopeToSpec(quizzes.data ?? [], attempts.data ?? [], spec, effectiveTier);
    const evidence = buildStudentEvidence(scoped);
    const specLedger = ledger.filter((m) => matchSpecTopic(spec, m.concept, effectiveTier) !== null);
    const priorities = prioritiseSpecTopics(spec, effectiveTier, evidence.topics, specLedger);
    return {
      evidence,
      priorities,
      coverage: specCoverage(priorities),
      forecast: calculateQuizForecast(evidence, exam.exam_date),
      calibration: buildCalibration(scoped.attempts),
      timeline: attemptTimeline(scoped.quizzes, scoped.attempts),
      misconceptions: specLedger
        .map((m) => ({ m, topic: matchSpecTopic(spec, m.concept, effectiveTier) }))
        .sort((a, b) => Number(a.m.status === "resolved") - Number(b.m.status === "resolved")),
    };
  }, [spec, effectiveTier, exam, quizzes.data, attempts.data, ledger]);

  if (anyPending(exams.isPending, quizzes.isPending, attempts.isPending)) {
    return (
      <div className={styles.page}>
        <Skeleton height={48} />
        <Skeleton height={220} />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className={styles.page}>
        <EmptyState
          title="Exam not found"
          message="It may have been removed. Your other exams are on the Exams page."
          icon="calendar"
        >
          <Link to="/exams">Back to exams</Link>
        </EmptyState>
      </div>
    );
  }

  /* A quiz from the practice bank on these topics, opened in the quiz
     runner so the attempt feeds the same evidence as any other quiz. */
  const practise = async (key: string, refs: string[], count: number, title: string) => {
    if (!spec || practising) return;
    setPractising(key);
    try {
      const made = await createBankQuiz({ spec, tier: effectiveTier, topicOrder: refs, count, title });
      if (!made) {
        showToast("There are no practice questions for this yet.", { error: true });
        return;
      }
      void qc.invalidateQueries({ queryKey: quizzesKeys.all });
      navigate(`/quiz/${made.quizId}`);
    } catch (err) {
      showToast(`Couldn't start practice. ${(err as Error).message}`, { error: true });
    } finally {
      setPractising(null);
    }
  };
  const canPractise = spec ? hasBank(spec) : false;

  /* Shows every topic first, so the printed report is complete, then opens
     the browser's print dialog — which is also its "Save as PDF". */
  const printReport = () => {
    setShowAll(true);
    window.setTimeout(() => window.print(), 50);
  };

  const days = daysUntil(exam.exam_date, localDateStr());
  const when =
    days < 0 ? `Sat on ${exam.exam_date}` : days === 0 ? "Today" : `In ${plural(days, "day")} · ${exam.exam_date}`;

  return (
    <div className={styles.page} data-print-root>
      <p className={styles.printOnly}>Learnora progress report · generated {localDateStr()}</p>
      <PageHeader
        eyebrow={spec ? specWithTierLabel(spec, tier) : "No specification chosen"}
        title={exam.exam_name}
        sub={when}
        actions={
          <div className={styles.headerActions} data-print-hide>
            <Button onClick={() => setEditing(true)}>Edit exam</Button>
            {derived && <Button onClick={printReport}>Save as PDF</Button>}
            {derived && canPractise && (
              <Button
                busy={practising === "top"}
                disabled={practising !== null}
                onClick={() =>
                  void practise(
                    "top",
                    nextSpecTopics(derived.priorities, 3).map((p) => p.topic.ref),
                    10,
                    `${exam.exam_name}: practice on your top topics`,
                  )
                }
              >
                Practise top topics
              </Button>
            )}
            {derived && derived.priorities[0] && (
              <Link
                className={styles.primaryLink}
                to={`/study?topic=${encodeURIComponent(derived.priorities[0].topic.title)}`}
              >
                Study {derived.priorities[0].topic.title}
              </Link>
            )}
          </div>
        }
      />

      {!spec || !derived ? (
        <Card padding="lg">
          <h2 className={styles.sectionTitle}>Which exam is this?</h2>
          <p className={styles.muted}>
            Choose the exam board and specification, and Learnora will show which topics carry the most
            marks, how ready you are on each, and pitch every explanation and quiz at this exam.
          </p>
          <Button variant="primary" onClick={() => setEditing(true)}>
            Choose specification
          </Button>
        </Card>
      ) : (
        <>
          <Card padding="lg" as="section" aria-labelledby="marks-heading">
            <h2 id="marks-heading" className={styles.sectionTitle}>
              Where the marks are
            </h2>
            <p className={styles.muted}>
              {spec.weightSource === "official"
                ? "Shares of the exam follow the published content weightings."
                : "Shares of the exam are estimates: each paper's marks spread evenly over the topics it covers."}{" "}
              Your quizzes have touched {derived.coverage}% of this specification.
            </p>
            <ol className={styles.topicList}>
              {(showAll ? derived.priorities : derived.priorities.slice(0, TOP_TOPICS)).map((p) => (
                <li key={p.topic.ref} className={styles.topicRow}>
                  <div className={styles.topicMain}>
                    <span className={styles.ref}>{p.topic.ref}</span>
                    <span className={styles.topicTitle}>{p.topic.title}</span>
                    <span className={`${styles.status} ${styles[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                  </div>
                  <div className={styles.topicMeta}>
                    <span>~{formatWeight(p.topic.weightPercent)} of the exam</span>
                    <span>
                      {p.accuracy === null
                        ? "No quiz answers yet"
                        : `${p.accuracy}% over ${plural(p.answered, "answer")}${p.provisional ? " (too few to be sure)" : ""}`}
                    </span>
                    {p.openMisconceptions > 0 && (
                      <span>{plural(p.openMisconceptions, "open misconception")}</span>
                    )}
                    {canPractise && (
                      <button
                        type="button"
                        className={styles.inlineAction}
                        data-print-hide
                        disabled={practising !== null}
                        aria-label={`Practise ${p.topic.title}`}
                        onClick={() =>
                          void practise(p.topic.ref, [p.topic.ref], 5, `${p.topic.title} (${p.topic.ref}) practice`)
                        }
                      >
                        {practising === p.topic.ref ? "Starting…" : "Practise"}
                      </button>
                    )}
                    <Link data-print-hide to={`/study?topic=${encodeURIComponent(p.topic.title)}`}>
                      Study
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
            {derived.priorities.length > TOP_TOPICS && (
              <Button variant="ghost" size="sm" data-print-hide onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show the top topics only" : `Show all ${derived.priorities.length} topics`}
              </Button>
            )}
          </Card>

          <PastPapersCard examId={exam.id} spec={spec} tier={effectiveTier} />

          <div className={styles.grid}>
            <Card padding="lg" as="section" aria-labelledby="forecast-heading">
              <h2 id="forecast-heading" className={styles.sectionTitle}>
                How the forecast is worked out
              </h2>
              {derived.forecast ? (
                <dl className={styles.breakdown}>
                  <dt>Your accuracy on this exam's topics</dt>
                  <dd>{derived.forecast.accuracyNow}%</dd>
                  <dt>
                    Weak-topic adjustment
                    {derived.forecast.weakTopics.length > 0 &&
                      ` (${derived.forecast.weakTopics.map((t) => t.topic).join(", ")})`}
                  </dt>
                  <dd>−{derived.forecast.penalty}</dd>
                  <dt>Uncertainty from how much you've quizzed</dt>
                  <dd>±{derived.forecast.band}</dd>
                  <dt className={styles.total}>Forecast</dt>
                  <dd className={styles.total}>{formatForecastRange(derived.forecast)}</dd>
                  <dt>Based on</dt>
                  <dd>
                    {plural(derived.forecast.quizzesTaken, "quiz", "quizzes")} ·{" "}
                    {derived.forecast.confidence}% confidence
                  </dd>
                </dl>
              ) : (
                <p className={styles.muted}>
                  {derived.evidence.quizzesTaken === 0
                    ? `No quizzes on this exam's topics yet. Take ${MIN_FORECAST_QUIZZES} and a forecast appears here, with every step shown.`
                    : `${plural(derived.evidence.quizzesTaken, "quiz", "quizzes")} so far. ${MIN_FORECAST_QUIZZES - derived.evidence.quizzesTaken} more and a forecast appears here.`}
                </p>
              )}
              <p className={styles.footnote}>
                Built from your quiz scores only. It does not model how much revision you'll do before the
                exam.
              </p>
            </Card>

            <Card padding="lg" as="section" aria-labelledby="calibration-heading">
              <h2 id="calibration-heading" className={styles.sectionTitle}>
                How well you judge yourself
              </h2>
              {derived.calibration.rated === 0 ? (
                <p className={styles.muted}>
                  Rate how sure you are when you answer quiz questions, and this shows whether your
                  confidence matches your results.
                </p>
              ) : (
                <>
                  <ul className={styles.calibration}>
                    {derived.calibration.rows.map((r) => (
                      <li key={r.level}>
                        <span>{r.label}</span>
                        <span>
                          {r.accuracy === null
                            ? "—"
                            : `right ${r.accuracy}% (${r.correct}/${r.answered})`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {derived.calibration.verdict && (
                    <p className={styles.verdict}>{derived.calibration.verdict}</p>
                  )}
                </>
              )}
            </Card>
          </div>

          <div className={styles.grid}>
            <Card padding="lg" as="section" aria-labelledby="misconceptions-heading">
              <h2 id="misconceptions-heading" className={styles.sectionTitle}>
                Misconceptions on this exam
              </h2>
              {derived.misconceptions.length === 0 ? (
                <p className={styles.muted}>
                  None recorded. When a quiz, Teach or Explain session finds something you believe that
                  isn't right, it shows up here until it's fixed.
                </p>
              ) : (
                <ul className={styles.misconceptions}>
                  {derived.misconceptions.map(({ m, topic }) => (
                    <li key={m.id}>
                      <div>
                        <strong>{m.concept}</strong>
                        {topic && <span className={styles.ref}> {topic.ref}</span>}
                        <span className={`${styles.status} ${m.status === "resolved" ? styles.secure : m.status === "improving" ? styles.developing : styles.weak}`}>
                          {m.status === "resolved" ? "Fixed" : m.status === "improving" ? "Improving" : "Open"}
                        </span>
                      </div>
                      <p className={styles.muted}>{m.summary}</p>
                      <p className={styles.footnote}>
                        Seen {plural(m.timesObserved, "time")}
                        {m.timesCorrected > 0 ? `, answered correctly since ${plural(m.timesCorrected, "time")}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card padding="lg" as="section" aria-labelledby="timeline-heading">
              <h2 id="timeline-heading" className={styles.sectionTitle}>
                Your scores over time
              </h2>
              {derived.timeline.length === 0 ? (
                <p className={styles.muted}>Your quiz results on this exam's topics will appear here.</p>
              ) : (
                <ol className={styles.timeline}>
                  {derived.timeline.map((p, i) => (
                    <li key={`${p.date}-${i}`}>
                      <span className={styles.timelineDate}>{p.date}</span>
                      <span className={styles.bar} aria-hidden="true">
                        <span style={{ width: `${p.percent}%` }} />
                      </span>
                      <span className={styles.timelineScore}>{p.percent}%</span>
                      <span className={styles.timelineTitle}>{p.title}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}

      <ExamModal open={editing} exam={exam} onClose={() => setEditing(false)} />
    </div>
  );
}
