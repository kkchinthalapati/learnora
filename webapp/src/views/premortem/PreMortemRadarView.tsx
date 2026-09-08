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
import { CognitiveCrossLinkBar } from "../../components/ai/CognitiveCrossLinkBar";
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
    initialReport ?? null,
  );
  const [activeNeutralizerId, setActiveNeutralizerId] = useState<string | null>(
    null,
  );
  const [neutralizedTraps, setNeutralizedTraps] = useState<Set<string>>(
    new Set(),
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
          title="Common Exam Traps"
          eyebrow="Study Lab"
          sub="You haven't tried a set of trap questions yet. Have a go and we'll show you what caught you out."
        />
        <Card variant="panel" padding="lg" style={{ textAlign: "center" }}>
          <p style={{ marginBottom: "var(--s-4)", color: "var(--text-muted)" }}>
            Want to see which tricky questions catch you out?
          </p>
          <Button
            variant="primary"
            onClick={() => (onRetest ? onRetest() : navigate("/premortem"))}
          >
            Pick some questions
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

  const totalMisses = report.predictedFailures.reduce(
    (acc, f) => acc + f.predictedLostMarks,
    0,
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
        title="Common Exam Traps"
        eyebrow={`Study Lab • ${report.subject || "All subjects"}`}
        sub={`Practice set completed on ${new Date(
          report.timestamp,
        ).toLocaleDateString()} at ${new Date(
          report.timestamp,
        ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => (onRetest ? onRetest() : navigate("/premortem"))}
          >
            Try another set
          </Button>
        }
      />

      {/* Cognitive Bridge Cross-Tool AI Actions */}
      <CognitiveCrossLinkBar
        payload={{
          subject: report.subject || "General",
          topic:
            report.predictedFailures[0]?.topic || report.subject || "Exam prep",
          concept:
            report.predictedFailures[0]?.coreTrap || report.radarData[0]?.topic,
          sourceTool: "premortem",
          sourceId: String(report.timestamp),
          evidencePrompt: `Trap practice: ${report.gradeEstimate} (${report.predictedScore}% accuracy)`,
          misconceptions: report.predictedFailures.map(
            (f) => `${f.topic}: ${f.coreTrap} (${f.predictedLostMarks} missed)`,
          ),
          severity:
            report.predictedScore < 65
              ? "critical"
              : report.predictedScore < 80
                ? "moderate"
                : "minor",
          suggestedAction: "debug_stack",
        }}
        currentTool="premortem"
      />

      {/* Summary cards */}
      <section
        className={styles.scoreBanner}
        aria-label="Summary of how you did"
      >
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Practice accuracy</span>
          <span className={`${styles.metricValue} ${scoreClass}`}>
            {report.predictedScore}%
          </span>
          <span className={styles.metricSub}>{report.gradeEstimate}</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Trap questions missed</span>
          <span className={`${styles.metricValue} ${styles.gradeLow}`}>
            {totalMisses}
          </span>
          <span className={styles.metricSub}>
            {neutralizedTraps.size > 0
              ? `${neutralizedTraps.size} sorted so far`
              : "These are the ones to work on"}
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Questions right</span>
          <span className={styles.metricValue}>
            {report.correctCount ?? 0} / {report.totalQuestions ?? 0}
          </span>
          <span className={styles.metricSub}>
            From your last set of trap questions
          </span>
        </div>
      </section>

      {/* Risk chart and topic gauge */}
      <section
        className={styles.radarLayout}
        aria-label="Chart of misses in this practice set"
      >
        <div className={styles.radarCard}>
          <h2 className={styles.radarTitle}>Where this set caught you</h2>
          <svg
            className={styles.svgRadar}
            width="320"
            height="320"
            viewBox="0 0 320 320"
            aria-label="Spiderweb chart of the miss rate for each topic in this set"
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
          <h2 className={styles.radarTitle}>Topic by topic</h2>
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
                    {item.failureProbability}% missed — {item.riskLevel}
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

      {/* The traps to work on */}
      <section
        className={styles.failuresSection}
        aria-label="Traps missed in this practice set"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h2 className={styles.sectionTitle}>The traps that caught you</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>
              These are the question styles you fell for. Tap one and we'll walk
              you through how to spot it next time.
            </p>
          </div>
        </div>

        <div className={styles.failuresGrid}>
          {report.predictedFailures.length === 0 ? (
            <p className={styles.allClear}>
              You spotted every trap in this set. Try another set or raise the
              question count before treating that as mastery.
            </p>
          ) : (
            report.predictedFailures.map((failure, idx) => {
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
                        {failure.predictedLostMarks} missed
                      </span>
                    </div>

                    <h3 className={styles.failureTopic}>{failure.topic}</h3>

                    <div className={styles.statsRow}>
                      <span>Miss rate in this set:</span>
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
                        <span>Sorted — you'll spot this one now</span>
                      </div>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        style={{ width: "100%" }}
                        onClick={() =>
                          handleOpenNeutralizer(failure.neutralizerId)
                        }
                      >
                        <Icon name="zap" size={16} />
                        <span>Learn to spot it</span>
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </section>

      {/* Footer Navigation */}
      <footer className={styles.footerActions}>
        <Link to="/premortem">
          <Button variant="secondary">Back</Button>
        </Link>

        <Button
          variant="primary"
          onClick={() => (onRetest ? onRetest() : navigate("/premortem"))}
        >
          Try another set
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
