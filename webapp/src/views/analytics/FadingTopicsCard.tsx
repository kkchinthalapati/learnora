import { Link } from "react-router";
import { Card } from "../../components/Card";
import { MasteryLadder } from "../../components/learning/MasteryLadder";
import { Skeleton } from "../../components/Skeleton";
import { useTrajectory } from "../../hooks/useTrajectory";
import { useFlashcardsDueCount } from "../../hooks/useFlashcards";
import { daysUntilFading, topicMastery } from "../../lib/mastery";
import { newSessionHref } from "../../lib/sessionModes";
import { fadingTopics } from "../../lib/todayPlan";
import text from "../../styles/text.module.css";
import styles from "./fadingTopics.module.css";

/* Progress: what is slipping, on the four-rung ladder. When nothing is, it
   says so plainly and names the next topic due — and offers a stretch, not
   a congratulation. */
export function FadingTopicsCard() {
  const { exam, forecast, isPending } = useTrajectory();
  const due = useFlashcardsDueCount().data ?? 0;

  if (isPending) {
    return (
      <Card as="section" aria-busy="true" className={styles.card}>
        <Skeleton label="Working out what is fading" height={120} />
      </Card>
    );
  }

  const topics = forecast?.topics ?? [];
  if (topics.length === 0) return null;

  const fading = fadingTopics(topics).slice(0, 5);
  const next = topics
    .map((t) => ({ t, days: daysUntilFading(t) }))
    .filter((x): x is { t: (typeof topics)[number]; days: number } => x.days !== null)
    .sort((a, b) => a.days - b.days)[0];
  const strongest = [...topics].sort((a, b) => b.mastery - a.mastery)[0];

  return (
    <Card as="section" aria-labelledby="fading-title" className={styles.card}>
      <div className={styles.head}>
        <h2 id="fading-title" className={styles.title}>
          What's fading{exam ? ` · ${exam.exam_name}` : ""}
        </h2>
      </div>
      {fading.length > 0 ? (
        <ul className={styles.rows}>
          {fading.map((t) => {
            const m = topicMastery(t);
            return (
              <li key={t.id} className={styles.row}>
                <MasteryLadder topic={t.label} rung={m.rung} fading={m.fading} size="sm" />
                <Link
                  to={newSessionHref("recall", { topic: t.label })}
                  className={styles.action}
                  aria-label={`Check ${t.label}, about 4 minutes`}
                >
                  Check · 4 min
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={styles.empty}>
          <p className={text.subtitle}>Nothing is fading right now.</p>
          <p className={styles.caption}>
            {/* "Every topic is holding" sat beside Today's "Review 3
                flashcards". Due cards are memory slipping, so say so. */}
            {due > 0
              ? `${due} ${due === 1 ? "card is" : "cards are"} due for review, so Recall will bring ${due === 1 ? "it" : "them"} back today.`
              : next
                ? `${next.t.label} is next: it starts to slip in about ${next.days} ${next.days === 1 ? "day" : "days"}, and Today will bring it back then.`
                : "Every topic you've studied is holding."}
          </p>
          {strongest ? (
            <Link
              to={newSessionHref("practice", { topic: strongest.label })}
              className={styles.action}
            >
              Challenge me anyway
            </Link>
          ) : null}
        </div>
      )}
      <p className={styles.caption}>
        Seen → Recalled → Applied → Explained. Each step needs evidence from a
        check, not time spent.
      </p>
    </Card>
  );
}
