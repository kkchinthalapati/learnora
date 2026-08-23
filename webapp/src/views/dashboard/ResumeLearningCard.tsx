import { useNavigate, Link } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { useContinuity } from "../../hooks/useContinuity";
import styles from "./ResumeLearningCard.module.css";

export function ResumeLearningCard() {
  const navigate = useNavigate();
  const { resumeAction, recentItems } = useContinuity();

  const getActionIcon = (type: string) => {
    switch (type) {
      case "material":
        return "file-text" as const;
      case "deck":
        return "layers" as const;
      case "quiz":
        return "help-circle" as const;
      case "focus":
        return "clock" as const;
      default:
        return "play" as const;
    }
  };

  return (
    <Card
      as="section"
      aria-label="Pick up where you left off"
      variant="elevated"
      className={styles.card}
    >
      <div className={styles.cardHeroGlow} aria-hidden="true" />

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.iconWrapper} aria-hidden="true">
            <Icon name="sparkles" size={22} />
          </div>
          <div>
            <span className={styles.eyebrow}>Continuous Learning</span>
            <h2 className={styles.title}>Pick Up Where You Left Off</h2>
          </div>
        </div>
        {resumeAction && (
          <span className={styles.badge}>
            <Icon name={getActionIcon(resumeAction.type)} size={12} />
            {resumeAction.badgeLabel}
          </span>
        )}
      </div>

      {resumeAction ? (
        <>
          <div className={styles.mainResumeBlock}>
            <div className={styles.resumeInfo}>
              <h3 className={styles.resumeTitle}>{resumeAction.title}</h3>
              <div className={styles.resumeSubtitle}>
                <span>{resumeAction.subtitle}</span>
              </div>
            </div>

            <div className={styles.progressContainer}>
              <div
                className={styles.progressBarTrack}
                role="progressbar"
                aria-valuenow={resumeAction.progressPercentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progress: ${resumeAction.progressPercentage}%`}
              >
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${resumeAction.progressPercentage}%` }}
                />
              </div>
              <span className={styles.progressLabel}>
                {resumeAction.progressPercentage}% complete
              </span>
            </div>

            <Button
              variant="primary"
              className={styles.resumeCtaBtn}
              onClick={() => navigate(resumeAction.targetUrl)}
            >
              <Icon name="play" size={16} />
              <span>Resume</span>
            </Button>
          </div>

          {recentItems.length > 1 && (
            <div className={styles.recentTray}>
              <span className={styles.trayHeader}>Recent Activities</span>
              <div className={styles.trayList}>
                {recentItems
                  .filter((item) => item.targetUrl !== resumeAction.targetUrl)
                  .slice(0, 3)
                  .map((item) => (
                    <Link
                      key={item.targetUrl}
                      to={item.targetUrl}
                      className={styles.trayItem}
                    >
                      <div className={styles.trayItemLeft}>
                        <Icon name={getActionIcon(item.type)} size={14} />
                        <span className={styles.trayItemTitle}>{item.title}</span>
                      </div>
                      <span className={styles.trayItemType}>{item.badgeLabel}</span>
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            Ready to study? Jump into your notes, test your memory with flashcards,
            or start a focused timer session.
          </p>
          <Button
            variant="secondary"
            onClick={() => navigate("/library")}
          >
            Open Library
          </Button>
        </div>
      )}
    </Card>
  );
}
