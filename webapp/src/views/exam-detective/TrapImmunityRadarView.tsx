import { useMemo } from "react";
import {
  CANONICAL_TRAP_ARCHETYPES,
  type TrapArchetype,
} from "../../api/aiExamDeconstructor";
import { Icon } from "../../components/Icon";
import styles from "./examDetective.module.css";

interface TrapImmunityRadarViewProps {
  subject?: string;
  disarmedTrapIds?: string[];
  score?: number;
  categoryScores?: Record<string, number>;
  archetypes?: TrapArchetype[];
}

interface RadarAxis {
  label: string;
  key: string;
  badgeName: string;
}

const RADAR_AXES: RadarAxis[] = [
  {
    label: "Edge Cases",
    key: "edge-case-hazards",
    badgeName: "Edge Case Disarmer",
  },
  {
    label: "Negative Wording",
    key: "negative-wording-maze",
    badgeName: "Wording Sleuth",
  },
  {
    label: "Assumptions",
    key: "hidden-assumptions",
    badgeName: "Assumption Buster",
  },
  {
    label: "Lookalikes",
    key: "lookalike-terms",
    badgeName: "Lookalike Master",
  },
  {
    label: "Units & Scale",
    key: "units-and-scale-drift",
    badgeName: "Scale Sentry",
  },
  {
    label: "Shortcuts",
    key: "premature-shortcut-traps",
    badgeName: "Shortcut Verifier",
  },
];

export function TrapImmunityRadarView({
  subject = "All Subjects",
  disarmedTrapIds = [],
  score,
  categoryScores,
  archetypes = CANONICAL_TRAP_ARCHETYPES,
}: TrapImmunityRadarViewProps) {
  const effectiveDisarmed = useMemo(
    () => new Set(disarmedTrapIds),
    [disarmedTrapIds]
  );

  // Calculate radar axis values (0 to 100)
  const axisValues = useMemo(() => {
    return RADAR_AXES.map((axis) => {
      if (categoryScores && typeof categoryScores[axis.key] === "number") {
        return Math.min(100, Math.max(20, categoryScores[axis.key]));
      }
      const isDisarmed = effectiveDisarmed.has(axis.key);
      const baseArch = archetypes.find((a) => a.id === axis.key);
      const defaultScore = baseArch?.defaultImmunity ?? 65;
      return isDisarmed ? 95 : defaultScore;
    });
  }, [categoryScores, effectiveDisarmed, archetypes]);

  // Overall score
  const overallImmunityScore = useMemo(() => {
    if (typeof score === "number") return score;
    const sum = axisValues.reduce((a, b) => a + b, 0);
    return Math.round(sum / axisValues.length);
  }, [score, axisValues]);

  // SVG Radar Calculations
  const size = 380;
  const center = size / 2;
  const radius = 130;
  const totalAxes = RADAR_AXES.length;

  const getPointCoordinates = (index: number, valueRatio: number) => {
    const angle = (Math.PI * 2 * index) / totalAxes - Math.PI / 2;
    const r = radius * valueRatio;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y, angle };
  };

  // Concentric guideline rings (25%, 50%, 75%, 100%)
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Polygon points for data
  const dataPolygonPoints = axisValues
    .map((val, idx) => {
      const { x, y } = getPointCoordinates(idx, val / 100);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className={styles.radarContainer}>
      {/* Header */}
      <div style={{ textAlign: "center" }}>
        <span className={styles.heroEyebrow}>Exam Trap Immunity Radar</span>
        <h3 className={styles.sectionTitle}>{subject} Trap Shield</h3>
        <p className={styles.sectionDesc}>
          Measures your resilience against tricky professor distractor archetypes.
        </p>
      </div>

      {/* Score Banner */}
      <div className={styles.scoreBanner}>
        <span className={styles.scoreBig}>{overallImmunityScore}%</span>
        <div>
          <span
            className={`${styles.badgePill} ${
              overallImmunityScore >= 80
                ? styles.badgePillSuccess
                : styles.badgePillAccent
            }`}
          >
            {overallImmunityScore >= 90
              ? "Master Detective"
              : overallImmunityScore >= 75
                ? "Trap Immune Guardian"
                : "Active Sleuth"}
          </span>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
            {effectiveDisarmed.size} archetypes disarmed
          </div>
        </div>
      </div>

      {/* SVG Radar Chart */}
      <svg
        className={styles.radarSvg}
        viewBox={`0 0 ${size} ${size}`}
        aria-label="Trap Immunity Radar Chart"
      >
        {/* Background guideline rings */}
        {rings.map((ring, rIdx) => {
          const ringPoints = RADAR_AXES.map((_, aIdx) => {
            const { x, y } = getPointCoordinates(aIdx, ring);
            return `${x},${y}`;
          }).join(" ");

          return (
            <polygon
              key={rIdx}
              points={ringPoints}
              fill="none"
              stroke="var(--glass-border)"
              strokeWidth="1"
              strokeDasharray={rIdx < 3 ? "3 3" : undefined}
            />
          );
        })}

        {/* Axis spokes from center */}
        {RADAR_AXES.map((_, idx) => {
          const { x, y } = getPointCoordinates(idx, 1.0);
          return (
            <line
              key={idx}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="var(--glass-border)"
              strokeWidth="1"
            />
          );
        })}

        {/* The student's immunity data polygon */}
        <polygon
          points={dataPolygonPoints}
          fill="var(--accent-soft)"
          stroke="var(--accent)"
          strokeWidth="2.5"
        />

        {/* Vertex dots */}
        {axisValues.map((val, idx) => {
          const { x, y } = getPointCoordinates(idx, val / 100);
          return (
            <circle
              key={idx}
              cx={x}
              cy={y}
              r="4.5"
              fill="var(--surface)"
              stroke="var(--accent)"
              strokeWidth="2"
            />
          );
        })}

        {/* Axis label text */}
        {RADAR_AXES.map((axis, idx) => {
          const { x, y } = getPointCoordinates(idx, 1.18);
          return (
            <text
              key={idx}
              x={x}
              y={y}
              fontSize="11"
              fontWeight="600"
              fill="var(--text-muted)"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {axis.label}
            </text>
          );
        })}
      </svg>

      {/* Disarmed Trap Badges */}
      <div style={{ textAlign: "center", width: "100%" }}>
        <h4
          style={{
            fontSize: "var(--fs-xs)",
            fontWeight: 700,
            textTransform: "uppercase",
            color: "var(--text-faint)",
            letterSpacing: "var(--tracking-wide)",
            marginBottom: "var(--s-2)",
          }}
        >
          Professor Trap Badges
        </h4>
        <div className={styles.badgesGrid}>
          {RADAR_AXES.map((axis) => {
            const isEarned = effectiveDisarmed.has(axis.key);
            return (
              <span
                key={axis.key}
                className={`${styles.badgePill} ${
                  isEarned ? styles.badgePillSuccess : ""
                }`}
              >
                {isEarned ? (
                  <Icon name="check" size={12} />
                ) : (
                  <Icon name="shield" size={12} />
                )}
                {axis.badgeName}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
