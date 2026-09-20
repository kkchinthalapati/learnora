import { useNavigate, Link } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { useContinuity } from "../../hooks/useContinuity";
import { useMaterials } from "../../hooks/useMaterials";
import styles from "./ResumeLearningCard.module.css";

export function ResumeLearningCard() {
  const navigate = useNavigate();
  const { resumeAction, recentItems } = useContinuity();

  /* `useContinuity` reads a localStorage snapshot and nothing else, so a
     student who signs in on a second device — or clears site data, or uses
     a school machine — is told they have done nothing, however much work
     the account holds. The account's own most recent material is the
     honest fallback: it is real, it is theirs, and it is openable.

     Deliberately not dressed up as a resume point. There is no stored
     position to resume to, so this offers to open the thing rather than
     inventing a progress percentage — the card's own progress bar is
     reserved for a real local snapshot. */
  const materials = useMaterials();
  const lastMaterial =
    resumeAction || !materials.data?.length
      ? null
      : [...materials.data].sort((a, b) =>
          String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
        )[0];

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
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Last activity</span>
          <h2 className={styles.title}>Pick up where you left off</h2>
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
              <span className={styles.trayHeader}>Recent activity</span>
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
                        <span className={styles.trayItemTitle}>
                          {item.title}
                        </span>
                      </div>
                      <span className={styles.trayItemType}>
                        {item.badgeLabel}
                      </span>
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </>
      ) : lastMaterial ? (
        <div className={styles.mainResumeBlock}>
          <div className={styles.resumeInfo}>
            <h3 className={styles.resumeTitle}>{lastMaterial.title}</h3>
            <div className={styles.resumeSubtitle}>
              <span>The last thing you added to your library</span>
            </div>
          </div>
          <Button
            variant="primary"
            className={styles.resumeCtaBtn}
            onClick={() => navigate(`/notes/${lastMaterial.id}`)}
          >
            <Icon name="file-text" size={16} />
            <span>Open</span>
          </Button>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            Open a note, review a flashcard deck, or start a focus session.
          </p>
          <Button variant="secondary" onClick={() => navigate("/library")}>
            Open Library
          </Button>
        </div>
      )}
    </Card>
  );
}
