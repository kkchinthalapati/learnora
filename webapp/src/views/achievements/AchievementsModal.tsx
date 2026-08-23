import { useId, useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { Icon } from "../../components/Icon";
import {
  evaluateAchievements,
  loadStudyGoals,
  saveStudyGoals,
  computeDaysGoalMetInWeek,
  type AchievementFilterCategory,
  type EvaluatedAchievement,
  type StudyGoals,
} from "../../lib/achievements";
import { useSessionsSince } from "../../hooks/useSessions";
import { useFlashcards } from "../../hooks/useFlashcards";
import { useQuizAttempts } from "../../hooks/useQuizzes";
import { useTasks } from "../../hooks/useTasks";
import { useExams } from "../../hooks/useExams";
import { computeStreak, remoteTotals } from "../dashboard/analytics";
import styles from "./achievementsModal.module.css";

export interface AchievementsModalProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES: ReadonlyArray<{
  key: AchievementFilterCategory;
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "consistency", label: "Consistency" },
  { key: "focus", label: "Focus" },
  { key: "mastery", label: "Mastery" },
  { key: "excellence", label: "Excellence" },
];

export function AchievementsModal({ open, onClose }: AchievementsModalProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<AchievementFilterCategory>("all");
  const [goals, setGoals] = useState<StudyGoals>(loadStudyGoals);
  const [savedFeedback, setSavedFeedback] = useState(false);

  const minutesInputId = useId();
  const cardsInputId = useId();
  const tasksInputId = useId();

  // Queries for live metrics
  const { data: sessions = [] } = useSessionsSince(90);
  const { data: flashcards = [] } = useFlashcards();
  const { data: quizAttempts = [] } = useQuizAttempts();
  const { data: tasks = [] } = useTasks();
  const { data: exams = [] } = useExams();

  const streak = useMemo(() => computeStreak(sessions), [sessions]);
  const totals = useMemo(() => remoteTotals(sessions), [sessions]);
  const daysGoalMetInWeek = useMemo(
    () => computeDaysGoalMetInWeek(sessions, goals.dailyMinutesGoal),
    [sessions, goals.dailyMinutesGoal],
  );

  const cardsReviewed = useMemo(() => {
    return flashcards.filter(
      (c) => c.srs_interval > 0 || c.next_review_date !== null,
    ).length;
  }, [flashcards]);

  const tasksCompleted = useMemo(() => {
    return tasks.filter((t) => t.is_done).length;
  }, [tasks]);

  // Exam readiness evaluation: compute readiness if exams are registered
  const examReadinessScore = useMemo(() => {
    if (exams.length === 0) return 0;
    // If there are exams completed or with high score, estimate readiness
    return exams.some((e) => e.status === "Completed") ? 100 : 80;
  }, [exams]);

  const achievements: EvaluatedAchievement[] = useMemo(() => {
    return evaluateAchievements({
      streak,
      totalFocusMinutes: totals.total,
      cardsReviewed,
      quizAttempts: quizAttempts.map((q) => ({
        score: q.score,
        total: q.total,
        created_at: q.created_at,
      })),
      examReadinessScore,
      daysGoalMetInWeek,
    });
  }, [
    streak,
    totals.total,
    cardsReviewed,
    quizAttempts,
    examReadinessScore,
    daysGoalMetInWeek,
  ]);

  const unlockedCount = useMemo(
    () => achievements.filter((a) => a.unlocked).length,
    [achievements],
  );

  const totalCount = achievements.length;
  const overallPercent = Math.round((unlockedCount / totalCount) * 100);

  const filteredBadges = useMemo(() => {
    if (selectedCategory === "all") return achievements;
    return achievements.filter((a) => a.category === selectedCategory);
  }, [achievements, selectedCategory]);

  const handleGoalChange = (
    field: keyof StudyGoals,
    value: number,
  ) => {
    const nextGoals: StudyGoals = {
      ...goals,
      [field]: Math.max(1, value),
    };
    setGoals(nextGoals);
    saveStudyGoals(nextGoals);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Trophy Cabinet & Goals"
      subtitle="Track your study streaks, earn milestone badges, and customize your daily targets."
      contentClassName={styles.modalDialog}
    >
      <div className={styles.container}>
        {/* Overview Hero Banner */}
        <section className={styles.heroBanner}>
          <div className={styles.heroHeader}>
            <div className={styles.heroTitleGroup}>
              <div className={styles.heroTrophyIcon}>
                <Icon name="trophy" size={24} />
              </div>
              <div>
                <h3 className={styles.heroTitle}>Trophy Cabinet</h3>
                <p className={styles.heroSubtitle}>
                  {unlockedCount} of {totalCount} badges unlocked ({overallPercent}%)
                </p>
              </div>
            </div>
            <div className={styles.heroStatPill}>
              <Icon name="flame" size={16} />
              <span>{streak} Day Streak</span>
            </div>
          </div>
          <div
            className={styles.totalProgressBar}
            role="progressbar"
            aria-valuenow={overallPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall badges completion progress"
          >
            <div
              className={styles.totalProgressFill}
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </section>

        {/* Daily Goals Customization */}
        <section className={styles.goalsSection}>
          <div className={styles.goalsHeader}>
            <h4 className={styles.sectionTitle}>
              <Icon name="target" size={18} />
              Customize Daily Study Goals
            </h4>
            {savedFeedback && (
              <span className={styles.savedPill}>
                <Icon name="check" size={14} /> Saved
              </span>
            )}
          </div>

          <div className={styles.goalsGrid}>
            {/* Minutes Goal */}
            <div className={styles.goalCard}>
              <div className={styles.goalCardHead}>
                <span>Daily Focus</span>
                <Icon name="clock" size={16} className={styles.goalIcon} />
              </div>
              <div className={styles.goalInputRow}>
                <input
                  id={minutesInputId}
                  type="number"
                  min="5"
                  max="480"
                  step="5"
                  value={goals.dailyMinutesGoal}
                  onChange={(e) =>
                    handleGoalChange(
                      "dailyMinutesGoal",
                      parseInt(e.target.value, 10) || 30,
                    )
                  }
                  className={styles.goalInput}
                  aria-label="Daily focus goal in minutes"
                />
                <span className={styles.goalUnit}>mins</span>
              </div>
              <div className={styles.goalPresets}>
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className={`${styles.presetBtn} ${
                      goals.dailyMinutesGoal === mins
                        ? styles.presetBtnActive
                        : ""
                    }`}
                    onClick={() =>
                      handleGoalChange("dailyMinutesGoal", mins)
                    }
                  >
                    {mins}m
                  </button>
                ))}
              </div>
              <div className={styles.goalCardStatus}>
                <span>Today:</span>
                <span>{totals.today}m focus</span>
              </div>
            </div>

            {/* Flashcards Goal */}
            <div className={styles.goalCard}>
              <div className={styles.goalCardHead}>
                <span>Flashcards</span>
                <Icon name="layers" size={16} className={styles.goalIcon} />
              </div>
              <div className={styles.goalInputRow}>
                <input
                  id={cardsInputId}
                  type="number"
                  min="1"
                  max="500"
                  step="5"
                  value={goals.dailyCardsGoal}
                  onChange={(e) =>
                    handleGoalChange(
                      "dailyCardsGoal",
                      parseInt(e.target.value, 10) || 15,
                    )
                  }
                  className={styles.goalInput}
                  aria-label="Daily flashcards review goal"
                />
                <span className={styles.goalUnit}>cards</span>
              </div>
              <div className={styles.goalPresets}>
                {[10, 15, 25, 50].map((cards) => (
                  <button
                    key={cards}
                    type="button"
                    className={`${styles.presetBtn} ${
                      goals.dailyCardsGoal === cards
                        ? styles.presetBtnActive
                        : ""
                    }`}
                    onClick={() => handleGoalChange("dailyCardsGoal", cards)}
                  >
                    {cards}
                  </button>
                ))}
              </div>
              <div className={styles.goalCardStatus}>
                <span>Reviewed:</span>
                <span>{cardsReviewed} cards</span>
              </div>
            </div>

            {/* Tasks Goal */}
            <div className={styles.goalCard}>
              <div className={styles.goalCardHead}>
                <span>Daily Tasks</span>
                <Icon name="list-checks" size={16} className={styles.goalIcon} />
              </div>
              <div className={styles.goalInputRow}>
                <input
                  id={tasksInputId}
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={goals.dailyTasksGoal}
                  onChange={(e) =>
                    handleGoalChange(
                      "dailyTasksGoal",
                      parseInt(e.target.value, 10) || 3,
                    )
                  }
                  className={styles.goalInput}
                  aria-label="Daily tasks completed goal"
                />
                <span className={styles.goalUnit}>tasks</span>
              </div>
              <div className={styles.goalPresets}>
                {[1, 3, 5, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={`${styles.presetBtn} ${
                      goals.dailyTasksGoal === num
                        ? styles.presetBtnActive
                        : ""
                    }`}
                    onClick={() => handleGoalChange("dailyTasksGoal", num)}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <div className={styles.goalCardStatus}>
                <span>Done:</span>
                <span>{tasksCompleted} tasks</span>
              </div>
            </div>
          </div>
        </section>

        {/* Category Filters */}
        <div className={styles.filtersRow} role="tablist" aria-label="Achievement Categories">
          {CATEGORIES.map(({ key, label }) => {
            const count =
              key === "all"
                ? achievements.length
                : achievements.filter((a) => a.category === key).length;
            const isSelected = selectedCategory === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`${styles.filterPill} ${
                  isSelected ? styles.filterPillActive : ""
                }`}
                onClick={() => setSelectedCategory(key)}
              >
                <span>{label}</span>
                <span className={styles.filterCount}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Badges Cabinet Grid */}
        <div className={styles.cabinetGrid}>
          {filteredBadges.map((badge) => {
            const isUnlocked = badge.unlocked;
            return (
              <div
                key={badge.id}
                className={`${styles.badgeCard} ${
                  isUnlocked ? styles.badgeUnlocked : styles.badgeLocked
                }`}
              >
                <div className={styles.badgeTop}>
                  <div className={styles.badgeIconBox}>
                    <Icon
                      name={isUnlocked ? badge.iconName : "lock"}
                      size={22}
                    />
                  </div>
                  <div className={styles.badgeInfo}>
                    <div className={styles.badgeTitleRow}>
                      <h5 className={styles.badgeTitle}>{badge.title}</h5>
                      <span className={styles.categoryTag}>
                        {badge.category}
                      </span>
                    </div>
                    <p className={styles.badgeDesc}>{badge.description}</p>
                  </div>
                </div>

                <div className={styles.badgeBottom}>
                  {isUnlocked ? (
                    <div className={styles.unlockedChip}>
                      <Icon name="star" size={14} />
                      <span>
                        Unlocked{" "}
                        {badge.unlockedAt
                          ? new Date(badge.unlockedAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })
                          : "Earned!"}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div
                        className={styles.badgeProgressBar}
                        role="progressbar"
                        aria-valuenow={badge.progressPercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${badge.title} progress`}
                      >
                        <div
                          className={styles.badgeProgressFill}
                          style={{ width: `${badge.progressPercent}%` }}
                        />
                      </div>
                      <div className={styles.badgeProgressText}>
                        <span>
                          {badge.currentProgress} / {badge.maxProgress}{" "}
                          {badge.unit}
                        </span>
                        <span>{badge.progressPercent}%</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
