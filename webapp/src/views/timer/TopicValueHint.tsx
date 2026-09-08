import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { useTrajectory } from "../../hooks/useTrajectory";
import styles from "./topicValueHint.module.css";

/* The timer is where the hour is actually spent, and it had no idea what the
 * hour was worth.
 *
 * The task binder above this offers the student their to-do list, which
 * answers "what did I say I'd do" — a different question from "what is this
 * block worth", and usually a worse one. The forecast can answer the second in
 * marks, so it should, at the moment the student is deciding rather than
 * afterwards on a chart.
 *
 * One line and one button, on purpose. This is a nudge in a panel the student
 * came to for a timer, not a second dashboard; the ranked list of every topic
 * lives on /trajectory and is one click from here anyway.
 */

/** Below this the comparison stops being a reason and starts being noise —
 *  the same bar the dashboard card applies. */
const MEANINGFUL_RATIO = 1.5;

export function TopicValueHint({
  activeTask,
  onUseTopic,
}: {
  activeTask: string;
  onUseTopic: (topic: string) => void;
}) {
  const { forecast, isPending } = useTrajectory();

  /* Silent while loading, and silent when there is nothing to rank. A hint
     that flickers in after the student has already started is worse than one
     that never appears. */
  if (isPending || !forecast) return null;

  const [top, ...rest] = forecast.interventions;
  if (!top || top.pointsPerHour <= 0) return null;

  const worst = rest.length > 0 ? rest[rest.length - 1] : null;
  const ratio =
    worst && worst.pointsPerHour > 0 ? top.pointsPerHour / worst.pointsPerHour : 0;

  const alreadyChosen = activeTask.trim().toLowerCase() === top.label.trim().toLowerCase();

  return (
    <p className={styles.hint}>
      <Icon name="zap" size={13} />
      <span>
        {alreadyChosen ? (
          <>
            Good pick — <strong>{top.label}</strong> is the highest-value hour you
            have before {forecast.examName}, at about{" "}
            {top.pointsPerHour.toFixed(1)} marks.
          </>
        ) : (
          <>
            <strong>{top.label}</strong> is worth about{" "}
            {top.pointsPerHour.toFixed(1)} marks an hour right now
            {ratio >= MEANINGFUL_RATIO && worst
              ? `, ${ratio.toFixed(1)}× an hour on ${worst.label}`
              : ""}
            .
          </>
        )}
      </span>
      {alreadyChosen ? null : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onUseTopic(top.label)}
        >
          Study that instead
        </Button>
      )}
    </p>
  );
}
