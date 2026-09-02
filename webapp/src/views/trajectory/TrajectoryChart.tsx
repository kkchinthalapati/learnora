import { formatMonthDay, parseLocalDate } from "../../lib/date";
import type { TrajectoryForecast } from "../../lib/trajectory";
import styles from "./trajectory.module.css";

/* Two lines and a target.
 *
 * The chart's whole job is one comparison — where you land if you use your
 * hours against where you land if you don't — so it draws exactly that and
 * nothing else. No gridlines, no y-axis furniture, no second series competing
 * for the eye. The gap between the lines *is* the message, so it is filled.
 *
 * Inline SVG rather than a charting library: this is two paths, and a
 * dependency would cost more in bundle than the whole feature. Every colour is
 * a token, so it reads correctly in both themes. */

const W = 640;
const H = 200;
const PAD = { top: 16, right: 12, bottom: 24, left: 34 };

interface TrajectoryChartProps {
  forecast: TrajectoryForecast;
}

export function TrajectoryChart({ forecast }: TrajectoryChartProps) {
  const points = forecast.curve;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) =>
    PAD.left +
    (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (score: number) => PAD.top + innerH - (score / 100) * innerH;

  const line = (get: (i: number) => number) =>
    points
      .map((_, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(get(i))}`)
      .join(" ");

  const projectedPath = line((i) => points[i].projected);
  const driftPath = line((i) => points[i].drift);

  /* The area between the two lines: down the projected line, back along the
     drift line. This is the plan's value, drawn. */
  const gapPath =
    points.length > 1
      ? `${projectedPath} ${points
          .map((_, i) => {
            const j = points.length - 1 - i;
            return `L ${x(j)} ${y(points[j].drift)}`;
          })
          .join(" ")} Z`
      : "";

  const targetY = y(forecast.targetScore);
  const last = points[points.length - 1];

  const summary =
    `Forecast for ${forecast.examName}: ${forecast.projectedScore} out of 100 on exam day ` +
    `if you use your available hours, versus ${forecast.driftScore} if you study no further. ` +
    `Target is ${forecast.targetScore}.`;

  return (
    <figure className={styles.chartFigure}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
      >
        {[0, 50, 100].map((score) => (
          <line
            key={score}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(score)}
            y2={y(score)}
            className={styles.axisLine}
          />
        ))}
        {[0, 50, 100].map((score) => (
          <text
            key={score}
            x={PAD.left - 8}
            y={y(score) + 4}
            textAnchor="end"
            className={styles.axisLabel}
          >
            {score}
          </text>
        ))}

        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={targetY}
          y2={targetY}
          className={styles.targetLine}
        />

        {gapPath ? <path d={gapPath} className={styles.gapArea} /> : null}
        <path d={driftPath} className={styles.driftLine} />
        <path d={projectedPath} className={styles.projectedLine} />

        {points.length > 1 ? (
          <>
            <circle
              cx={x(points.length - 1)}
              cy={y(last.projected)}
              r={4}
              className={styles.projectedDot}
            />
            <circle
              cx={x(points.length - 1)}
              cy={y(last.drift)}
              r={3.5}
              className={styles.driftDot}
            />
          </>
        ) : null}

        <text x={PAD.left} y={H - 6} className={styles.axisLabel}>
          today
        </text>
        <text
          x={W - PAD.right}
          y={H - 6}
          textAnchor="end"
          className={styles.axisLabel}
        >
          {formatMonthDay(parseLocalDate(forecast.examDate))}
        </text>
      </svg>

      <figcaption className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchProjected}`} />
          If you use your hours
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchDrift}`} />
          If you stop here
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchTarget}`} />
          Your target ({forecast.targetScore})
        </span>
      </figcaption>
    </figure>
  );
}
