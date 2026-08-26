import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import {
  getLatestPreMortemReport,
  type PreMortemReport,
} from "../../api/aiPreMortem";
import { TrapNeutralizerModal } from "./TrapNeutralizerModal";
import styles from "./PreMortemRadarView.module.css";

interface PreMortemRadarViewProps {
  report?: PreMortemReport | null;
  onRetest?: () => void;
}

export function PreMortemRadarView({
  report: initialReport,
  onRetest,
}: PreMortemRadarViewProps) {
  const navigate = useNavigate();
  const [report, setReport] = useState<PreMortemReport | null>(
    initialReport ?? null
  );
  const [activeNeutralizerId, setActiveNeutralizerId] = useState<string | null>(
    null
  );
  const [neutralizedTraps, setNeutralizedTraps] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    if (!report) {
      const latest = getLatestPreMortemReport();
      if (latest) {
        setReport(latest);
      }
    }
  }, [report]);

  const handleOpenNeutralizer = (trapId: string) => {
    setActiveNeutralizerId(trapId);
  };

  const handleCloseNeutralizer = () => {
    setActiveNeutralizerId(null);
  };

  const handleTrapNeutralized = (trapId: string) => {
    setNeutralizedTraps((prev) => {
      const next = new Set(prev);
      next.add(trapId);
      return next;
    });
  };

  if (!report) {
    return (
      <div className={styles.container}>
        <PageHeader
          title="Exam Pre-Mortem Failure Radar"
          eyebrow="Adversarial Audit"
          sub="No recent stress-test audit found. Launch a gauntlet to compute your failure prediction radar."
        />
        <Card variant="panel" padding="lg" style={{ textAlign: "center" }}>
          <p style={{ marginBottom: "var(--s-4)", color: "var(--text-muted)" }}>
            Ready to stress-test your exam preparation against adversarial traps?
          </p>
          <Button
            variant="primary"
            onClick={() => (onRetest ? onRetest() : navigate("/premortem"))}
          >
            Go to Pre-Mortem Hub
          </Button>
        </Card>
      </div>
    );
  }

  const scoreClass =
    report.predictedScore >= 80
      ? styles.gradeHigh
      : report.predictedScore >= 65
      ? styles.gradeMed
      : styles.gradeLow;

  const totalLostMarks = report.predictedFailures.reduce(
    (acc, f) => acc + (neutralizedTraps.has(f.neutralizerId) ? 0 : f.predictedLostMarks),
    0
  );

  // SVG Radar Polygon points computation
  const radarTopics = report.radarData.slice(0, 6);
  const centerX = 160;
  const centerY = 160;
  const maxRadius = 110;
  const numPoints = Math.max(3, radarTopics.length);

  const polygonPoints = radarTopics
    .map((topic, i) => {
      const angle = (Math.PI * 2 * i) / numPoints - Math.PI / 2;
      const r = (topic.failureProbability / 100) * maxRadius;
      const x = centerX + r * Math.cos(angle);
      const y = centerY + r * Math.sin(angle);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className={styles.container}>
      <PageHeader
        title="Exam Pre-Mortem Failure Radar"
        eyebrow={`Adversarial Audit • ${report.subject || "All Subjects"}`}
        sub={`Predictive simulation generated on ${new Date(
          report.timestamp
        ).toLocaleDateString()} at ${new Date(
          report.timestamp
        ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => (onRetest ? onRetest() : navigate("/premortem"))}
          >
            Launch New Gauntlet
          </Button>
        }
      />

      {/* Top Metric Summary Cards */}
      <section className={styles.scoreBanner} aria-label="Audit summary metrics">
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Predicted Exam Score</span>
          <span className={`${styles.metricValue} ${scoreClass}`}>
            {report.predictedScore}%
          </span>
          <span className={styles.metricSub}>{report.gradeEstimate}</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Predicted Lost Marks</span>
          <span className={`${styles.metricValue} ${styles.gradeLow}`}>
            {`-${totalLostMarks} pts`}
          </span>
          <span className={styles.metricSub}>
            {neutralizedTraps.size > 0
              ? `${neutralizedTraps.size} trap(s) neutralized`
              : "Vulnerable to professor traps"}
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Audited Questions</span>
          <span className={styles.metricValue}>
            {report.correctCount ?? 0} / {report.totalQuestions ?? 0}
          </span>
          <span className={styles.metricSub}>
            Adversarial Gauntlet Performance
          </span>
        </div>
      </section>

      {/* Visual Risk Radar & Topic Gauge */}
      <section className={styles.radarLayout} aria-label="Topic failure radar">
        <div className={styles.radarCard}>
          <h2 className={styles.radarTitle}>Topic Failure Probability Radar</h2>
          <svg
            className={styles.svgRadar}
            width="320"
            height="320"
            viewBox="0 0 320 320"
            aria-label="SVG radar spiderweb chart"
          >
            {/* Concentric Guide Circles */}
            {[0.25, 0.5, 0.75, 1.0].map((ratio) => (
              <circle
                key={ratio}
                cx={centerX}
                cy={centerY}
                r={maxRadius * ratio}
                fill="none"
                stroke="var(--line)"
                strokeDasharray={ratio < 1 ? "4 4" : undefined}
                strokeWidth="1"
              />
            ))}

            {/* Radial Spokes */}
            {Array.from({ length: numPoints }).map((_, i) => {
              const angle = (Math.PI * 2 * i) / numPoints - Math.PI / 2;
              const x2 = centerX + maxRadius * Math.cos(angle);
              const y2 = centerY + maxRadius * Math.sin(angle);
              return (
                <line
                  key={i}
                  x1={centerX}
                  y1={centerY}
                  x2={x2}
                  y2={y2}
                  stroke="var(--line)"
                  strokeWidth="1"
                />
              );
            })}

            {/* Radar Polygon Risk Fill */}
            {polygonPoints && (
              <polygon
                points={polygonPoints}
                fill="rgba(194, 69, 58, 0.25)"
                stroke="var(--danger)"
                strokeWidth="2.5"
              />
            )}

            {/* Topic Node Markers */}
            {radarTopics.map((topic, i) => {
              const angle = (Math.PI * 2 * i) / numPoints - Math.PI / 2;
              const r = (topic.failureProbability / 100) * maxRadius;
              const x = centerX + r * Math.cos(angle);
              const y = centerY + r * Math.sin(angle);
              return (
                <g key={i}>
                  <circle
                    cx={x}
                    cy={y}
                    r="4.5"
                    fill="var(--danger)"
                    stroke="var(--surface)"
                    strokeWidth="1.5"
                  />
                  <text
                    x={centerX + (maxRadius + 18) * Math.cos(angle)}
                    y={centerY + (maxRadius + 18) * Math.sin(angle)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="11"
                    fontWeight="600"
                    fill="var(--text-muted)"
                  >
                    {topic.topic.length > 14
                      ? `${topic.topic.slice(0, 12)}…`
                      : topic.topic}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Topic Breakdown Bars */}
        <div className={styles.topicList}>
          <h2 className={styles.radarTitle}>Topic Risk Index</h2>
          {report.radarData.map((item, idx) => {
            const riskClass =
              item.riskLevel === "high"
                ? styles.riskHigh
                : item.riskLevel === "medium"
                ? styles.riskMedium
                : styles.riskLow;

            const fillClass =
              item.riskLevel === "high"
                ? styles.fillHigh
                : item.riskLevel === "medium"
                ? styles.fillMed
                : styles.fillLow;

            return (
              <div key={idx} className={styles.topicItem}>
                <div className={styles.topicHeader}>
                  <span className={styles.topicName}>{item.topic}</span>
                  <span className={`${styles.riskBadge} ${riskClass}`}>
                    {item.failureProbability}% {item.riskLevel} Risk
                  </span>
                </div>
                <div className={styles.progressBarContainer}>
                  <div
                    className={`${styles.progressBarFill} ${fillClass}`}
                    style={{ width: `${item.failureProbability}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Predicted Failure Points Section */}
      <section className={styles.failuresSection} aria-label="Predicted failure points">
        <div className={styles.sectionHeading}>
          <div>
            <h2 className={styles.sectionTitle}>
              Predicted Exam-Day Failure Traps
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>
              High-vulnerability trick patterns identified during stress analysis.
              Disarm each trap with a 1-click Trap Neutralizer drill.
            </p>
          </div>
        </div>

        <div className={styles.failuresGrid}>
          {report.predictedFailures.map((failure, idx) => {
            const isNeutralized = neutralizedTraps.has(failure.neutralizerId);

            return (
              <Card
                key={idx}
                variant="panel"
                padding="md"
                className={styles.failureCard}
              >
                <div className={styles.failureTop}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--s-2)",
                    }}
                  >
                    <span className={styles.trapTag}>
                      <Icon name="shield" size={14} />
                      <span>{failure.coreTrap}</span>
                    </span>
                    <span className={styles.lostMarksBadge}>
                      -{failure.predictedLostMarks} marks
                    </span>
                  </div>

                  <h3 className={styles.failureTopic}>{failure.topic}</h3>

                  <div className={styles.statsRow}>
                    <span>Failure Probability:</span>
                    <strong
                      style={{
                        color:
                          failure.failureProbability > 60
                            ? "var(--danger)"
                            : "var(--warning)",
                      }}
                    >
                      {failure.failureProbability}%
                    </strong>
                  </div>

                  <div className={styles.progressBarContainer}>
                    <div
                      className={`${styles.progressBarFill} ${
                        failure.failureProbability > 60
                          ? styles.fillHigh
                          : styles.fillMed
                      }`}
                      style={{ width: `${failure.failureProbability}%` }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: "var(--s-3)" }}>
                  {isNeutralized ? (
                    <div className={styles.neutralizedBadge}>
                      <Icon name="check" size={14} />
                      <span>Trap Neutralized! Deflection Mastered</span>
                    </div>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      style={{ width: "100%" }}
                      onClick={() => handleOpenNeutralizer(failure.neutralizerId)}
                    >
                      <Icon name="zap" size={16} />
                      <span>Neutralize Trap</span>
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Footer Navigation */}
      <footer className={styles.footerActions}>
        <Link to="/premortem">
          <Button variant="secondary">Back to Pre-Mortem Hub</Button>
        </Link>

        <Button
          variant="primary"
          onClick={() => (onRetest ? onRetest() : navigate("/premortem"))}
        >
          Retest Gauntlet
        </Button>
      </footer>

      {/* Trap Neutralizer Modal */}
      <TrapNeutralizerModal
        trapId={activeNeutralizerId}
        open={activeNeutralizerId !== null}
        onClose={handleCloseNeutralizer}
        onNeutralized={handleTrapNeutralized}
      />
    </div>
  );
}
