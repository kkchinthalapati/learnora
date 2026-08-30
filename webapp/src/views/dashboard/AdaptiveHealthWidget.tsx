import { Link, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useAdaptiveLearning } from "../../hooks/useAdaptiveLearning";
import styles from "./AdaptiveHealthWidget.module.css";

export function AdaptiveHealthWidget() {
  const navigate = useNavigate();
  const {
    overallRetentionRate,
    forgettingRiskCards,
    subjectMasteries,
    topWeakTopics,
    surgeCards,
    examReadiness,
    isPending,
    isError,
    error,
    totalCardsCount,
  } = useAdaptiveLearning();

  const atRiskCount = forgettingRiskCards.length;
  const surgeCount = surgeCards.length;

  const getHealthBadge = (retention: number) => {
    if (retention >= 85) {
      return {
        label: "Optimal",
        className: styles.healthOptimal,
        icon: "check" as const,
      };
    }
    if (retention >= 70) {
      return {
        label: "Stable",
        className: styles.healthGood,
        icon: "brain" as const,
      };
    }
    if (retention >= 50) {
      return {
        label: "Review Recommended",
        className: styles.healthWarning,
        icon: "alert-triangle" as const,
      };
    }
    return {
      label: "Needs Refresher",
      className: styles.healthDanger,
      icon: "alert-triangle" as const,
    };
  };

  const getTierBadgeClass = (tier: string) => {
    switch (tier) {
      case "Mastered":
        return styles.tierMastered;
      case "Competent":
        return styles.tierCompetent;
      case "Developing":
        return styles.tierDeveloping;
      default:
        return styles.tierNovice;
    }
  };

  const getProgressBarColor = (score: number) => {
    if (score >= 85) return "var(--success)";
    if (score >= 70) return "var(--accent)";
    if (score >= 50) return "var(--warning)";
    return "var(--danger)";
  };

  const healthBadge = getHealthBadge(overallRetentionRate);

  return (
    <Card
      as="section"
      aria-label="Adaptive learning health"
      variant="elevated"
      className={styles.widget}
      aria-busy={isPending || undefined}
    >
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <div className={styles.headerIcon} aria-hidden="true">
            <Icon name="brain" size={20} />
          </div>
          <div>
            <span className={styles.eyebrow}>Revision Health & AI</span>
            <h2 className={styles.title}>Memory Decay & Retention</h2>
          </div>
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}
        >
          <Link to="/analytics" className={styles.analyticsLink}>
            Full Analytics →
          </Link>
          {!isPending && !isError && (
            <div className={`${styles.healthBadge} ${healthBadge.className}`}>
              <Icon name={healthBadge.icon} size={14} />
              <span>{healthBadge.label}</span>
            </div>
          )}
        </div>
      </div>

      {isPending ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-3)",
          }}
        >
          <Skeleton label="Loading adaptive retention metrics" height={70} />
          <Skeleton label="Loading subject mastery" height={100} />
        </div>
      ) : isError ? (
        <p role="alert" className={styles.emptyPrompt}>
          Could not load your adaptive learning data.{" "}
          {(error as Error)?.message}
        </p>
      ) : (
        <>
          <div className={styles.metricsRow}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Memory Retention</span>
              <div className={styles.metricValue}>
                {totalCardsCount === 0 ? "100" : overallRetentionRate}
                <span className={styles.metricUnit}>%</span>
              </div>
              <span className={styles.metricSubtext}>
                {totalCardsCount === 0
                  ? "No cards created yet"
                  : `${totalCardsCount} active flashcards`}
              </span>
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Cards to Refresh</span>
              <div className={styles.metricValue}>
                {atRiskCount}
                <span className={styles.metricUnit}>cards</span>
              </div>
              <span className={styles.metricSubtext}>
                {atRiskCount > 0 ? "Ready for a quick revision" : "All memory stable"}
              </span>
            </div>
          </div>

          {examReadiness && (
            <div className={styles.readinessCard}>
              <div className={styles.readinessHeader}>
                <div className={styles.readinessTitleGroup}>
                  <Icon name="award" size={14} />
                  <span>Exam Readiness Score</span>
                </div>
                <span
                  className={`${styles.tierBadge} ${getTierBadgeClass(examReadiness.tier)}`}
                >
                  {examReadiness.tier} ({examReadiness.score}%)
                </span>
              </div>
              <div className={styles.progressBarTrack}>
                <div
                  className={styles.progressBarFill}
                  style={{
                    width: `${examReadiness.score}%`,
                    backgroundColor: getProgressBarColor(examReadiness.score),
                  }}
                />
              </div>
              <div className={styles.readinessBreakdown}>
                <span>Syllabus: {examReadiness.syllabusCoverage}%</span>
                <span>Stability: {examReadiness.flashcardStability}%</span>
                <span>Quiz: {examReadiness.quizMastery}%</span>
              </div>
            </div>
          )}

          {surgeCount > 0 && (
            <div className={styles.surgeCallout}>
              <span className={styles.surgeIcon} aria-hidden="true">
                <Icon name="zap" size={16} />
              </span>
              <span>
                <strong>Pre-Exam Surge Active:</strong> {surgeCount} cards
                prioritised for upcoming exams.
              </span>
            </div>
          )}

          {subjectMasteries.length > 0 ? (
            <div>
              <div className={styles.sectionTitle}>Subject Mastery Curves</div>
              <div className={styles.masteryList}>
                {subjectMasteries.slice(0, 3).map((mastery) => (
                  <div key={mastery.folderId} className={styles.masteryItem}>
                    <div className={styles.masteryItemHead}>
                      <span className={styles.masteryName}>
                        {mastery.folderName}
                      </span>
                      <span
                        className={`${styles.tierBadge} ${getTierBadgeClass(mastery.tier)}`}
                      >
                        {mastery.tier} ({mastery.masteryScore}%)
                      </span>
                    </div>
                    <div className={styles.progressBarTrack}>
                      <div
                        className={styles.progressBarFill}
                        style={{
                          width: `${mastery.masteryScore}%`,
                          backgroundColor: getProgressBarColor(
                            mastery.masteryScore,
                          ),
                        }}
                      />
                    </div>
                    <div className={styles.masteryMeta}>
                      <span>
                        {mastery.cardsCount} cards ({mastery.retentionRate}%
                        retention)
                      </span>
                      {mastery.atRiskCount > 0 && (
                        <span style={{ color: "var(--warning)" }}>
                          {mastery.atRiskCount} to revise
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className={styles.emptyPrompt}>
              Organise study decks into subjects to track individual mastery
              curves and revision areas.
            </p>
          )}

          {topWeakTopics.length > 0 && (
            <div>
              <div className={styles.sectionTitle}>Confidence Boosters</div>
              <div className={styles.weakTopicsContainer}>
                {topWeakTopics.slice(0, 3).map((topic) => (
                  <span key={topic.topic} className={styles.weakTopicTag}>
                    <Icon name="target" size={12} />
                    {topic.topic} ({topic.count})
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className={styles.actions}>
            {/* Secondary, not primary: this navigates to /review/daily-drill,
                which DailyDrillCard's "Start drill" already offers as a filled
                button one row above. Two filled buttons for one destination on
                one screen is the decision paralysis the audit flagged. */}
            <Button
              variant="secondary"
              className={styles.smartReviewBtn}
              onClick={() => {
                if (totalCardsCount > 0) {
                  navigate("/review/daily-drill");
                } else {
                  navigate("/library/flashcards");
                }
              }}
            >
              <Icon
                name="zap"
                size={16}
                style={{ marginRight: "var(--s-1)" }}
              />
              {atRiskCount > 0
                ? `Smart Adaptive Review (${atRiskCount})`
                : "Smart Adaptive Review"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
