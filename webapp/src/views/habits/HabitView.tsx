import { useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton } from "../../components/Skeleton";
import { MisconceptionRepair } from "../../components/learning/MisconceptionRepair";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import {
  habitBySlug,
  habitSentence,
  habitsForStudent,
  type ActiveHabit,
  type HabitRow,
} from "../../lib/errorHabits";
import { mistakeTitle } from "../../lib/mistakeLoop";
import { useDocumentTitle } from "../../lib/routeTitle";
import styles from "./habit.module.css";

/* /analytics/habits/:slug — the same kind of mistake, across subjects
 * (lib/errorHabits.ts). It owns its page title like the rest of /analytics.
 *
 * Everything here is the student's own: their rows, grouped by subject, with
 * the catalogue's re-teach one tap away. Nothing is asked of a model, and
 * nothing is claimed beyond what the ledger shows: a habit is a label for a
 * kind of mistake, not a verdict on the student. */
export function HabitView() {
  const { slug = "" } = useParams<{ slug: string }>();
  const habit = habitBySlug(slug);
  const { all, isPending } = useMisconceptions();
  useDocumentTitle(habit ? habit.name : "Habit");

  if (!habit) {
    return (
      <div className={styles.page}>
        <EmptyState icon="alert-circle" title="We don’t have that habit" message="The link may be out of date.">
          <Link to="/analytics?tab=mistakes" className={styles.link}>
            Back to your mistakes
          </Link>
        </EmptyState>
      </div>
    );
  }

  const active = habitsForStudent(all).find((h) => h.habit.slug === habit.slug) ?? null;

  return (
    <div className={styles.page}>
      <Link to="/analytics?tab=mistakes" className={styles.back}>
        ← Your mistakes
      </Link>
      <PageHeader as="h1" title={habit.name} sub={habit.looksLike} />

      {isPending ? (
        <div className={styles.stack} aria-busy="true">
          <Skeleton label="Finding your examples" height={72} radius="var(--r-lg)" />
        </div>
      ) : active ? (
        <>
          <p className={styles.lead}>{habitSentence(active)}</p>
          <Where active={active} />
        </>
      ) : (
        <p className={styles.lead}>
          Nothing in your mistakes shows this one across subjects right now.
        </p>
      )}

      <section className={styles.section} aria-labelledby="habit-move">
        <SectionHeader id="habit-move" title="The habit that helps" />
        <div className={styles.move}>
          <p className={styles.moveText}>{habit.move}</p>
          <p className={styles.question}>
            Ask yourself: <strong>{habit.question}</strong>
          </p>
        </div>
      </section>
    </div>
  );
}

function Where({ active }: { active: ActiveHabit }) {
  const subjects = [...new Set([...active.open, ...active.fixed].map((r) => r.subject))];
  return (
    <section className={styles.section} aria-labelledby="habit-where">
      <SectionHeader id="habit-where" title="Where it shows up" />
      <div className={styles.subjects}>
        {subjects.map((subject) => (
          <section key={subject} className={styles.subject} aria-label={subject}>
            <h3 className={styles.subjectName}>{subject}</h3>
            <ul className={styles.rows}>
              {active.open
                .filter((r) => r.subject === subject)
                .map((r) => (
                  <OpenRow key={r.row.id} item={r} />
                ))}
              {active.fixed
                .filter((r) => r.subject === subject)
                .map((r) => (
                  <li key={r.row.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <p className={styles.rowTitle}>{mistakeTitle(r.row)}</p>
                      <span className={styles.fixed}>Fixed</span>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function OpenRow({ item }: { item: HabitRow }) {
  const [open, setOpen] = useState(false);
  const { row, entry } = item;
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowText}>
          <p className={styles.rowTitle}>{mistakeTitle(row)}</p>
          {row.summary ? <p className={styles.rowBelief}>{row.summary}</p> : null}
        </div>
        <Button size="sm" variant="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Fix it"}
        </Button>
      </div>
      {open ? (
        <div className={styles.fix}>
          {/* Opened from the ledger, so the mistake is already on record:
              showing the re-teach is the repair, as on the Progress list. */}
          <MisconceptionRepair
            entry={entry}
            sourceId={`habit:${row.id}`}
            tool={row.originTool}
            detail="Opened from a habit"
            recordEvidence={false}
            ledgerRow={row}
          />
        </div>
      ) : null}
    </li>
  );
}
