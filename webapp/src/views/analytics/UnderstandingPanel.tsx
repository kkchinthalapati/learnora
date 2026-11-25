import { useMemo } from "react";
import { Link } from "react-router";
import { EmptyState } from "../../components/EmptyState";
import { ListRow, ListRows } from "../../components/ListRow";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton } from "../../components/Skeleton";
import { useFolders } from "../../hooks/useFolders";
import { useLearningEvents } from "../../hooks/useLearningEvents";
import { useMaterials } from "../../hooks/useMaterials";
import { useQuizAttempts, useQuizzes } from "../../hooks/useQuizzes";
import { newSessionHref, type SessionMode } from "../../lib/sessionModes";
import { buildUnderstanding, type UnderstandingState } from "../../lib/understanding";
import styles from "./progress.module.css";

/* Progress > What you know. Each subject's topics in words: secure, right
 * so far, still learning, starting to slip, with what that rests on. No
 * percentages, no grade, and nothing about a topic with no answered
 * questions (lib/understanding.ts). Where something would help, the row
 * leads to it; a secure topic is left alone. */

const NEXT: Record<UnderstandingState, { mode: SessionMode; label: string } | null> = {
  slipping: { mode: "recall", label: "Check it" },
  learning: { mode: "explain", label: "Go over it" },
  sofar: { mode: "practice", label: "Try new questions" },
  secure: null,
};

export function UnderstandingPanel() {
  const attempts = useQuizAttempts();
  const quizzes = useQuizzes();
  const events = useLearningEvents();
  const materials = useMaterials();
  const folders = useFolders();

  const subjects = useMemo(
    () =>
      buildUnderstanding({
        quizAttempts: attempts.data ?? [],
        quizzes: quizzes.data ?? [],
        events: events.data ?? [],
        materials: materials.data ?? [],
        folders: folders.data ?? [],
      }),
    [attempts.data, quizzes.data, events.data, materials.data, folders.data],
  );

  if (attempts.isPending || events.isPending || quizzes.isPending || folders.isPending) {
    return (
      <div className={styles.stack} aria-busy="true">
        <Skeleton label="Working out what you know" height={32} width="40%" />
        <Skeleton height={160} radius="var(--r-lg)" />
      </div>
    );
  }
  /* Both sources failing means there is nothing to stand on; one failing
     still leaves a true, if smaller, picture. */
  if (attempts.isError && events.isError) {
    return (
      <EmptyState icon="alert-circle" title="This didn't load" message="Check your connection and try again.">
        <button
          type="button"
          className={styles.quietLink}
          onClick={() => {
            void attempts.refetch();
            void events.refetch();
          }}
        >
          Try again
        </button>
      </EmptyState>
    );
  }
  if (subjects.length === 0) {
    return (
      <EmptyState
        icon="book-open"
        title="Nothing checked yet"
        message="Answer the checks in a lesson, or take a quiz, and what you know shows up here in plain words."
      >
        <Link to="/subjects" className={styles.quietLink}>
          Open a lesson
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className={styles.stack}>
      {subjects.map((s) => {
        const id = `know-${s.subjectId ?? "other"}`;
        return (
          <section key={id} className={styles.knowSection} aria-labelledby={id}>
            <SectionHeader
              id={id}
              title={s.subject}
              action={
                s.subjectId ? (
                  <Link to={`/subjects/${encodeURIComponent(s.subjectId)}`} className={styles.quietLink}>
                    Open subject
                  </Link>
                ) : null
              }
            />
            {s.summary ? <p className={styles.knowSummary}>{s.summary}</p> : null}
            <ListRows label={`What you know in ${s.subject}`}>
              {s.topics.map((t) => {
                const next = NEXT[t.state];
                return (
                  <ListRow
                    key={t.key}
                    icon={t.state === "secure" ? "check-square" : t.state === "slipping" ? "clock" : "target"}
                    title={t.label}
                    meta={`${t.stateLabel} · ${t.evidence}`}
                    chevron={false}
                    trailing={
                      next ? (
                        <Link
                          to={newSessionHref(next.mode, { topic: t.label })}
                          className={styles.quietLink}
                          aria-label={`${next.label}: ${t.label}`}
                        >
                          {next.label}
                        </Link>
                      ) : undefined
                    }
                  />
                );
              })}
            </ListRows>
          </section>
        );
      })}
      <p className={styles.knowNote}>
        This comes only from questions you have answered. A topic you haven&apos;t been checked on isn&apos;t listed.
      </p>
    </div>
  );
}
