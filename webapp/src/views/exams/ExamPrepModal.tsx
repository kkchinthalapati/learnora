import { useState } from "react";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useAddTask } from "../../hooks/useTasks";
import { useExamReadiness } from "../../hooks/useExamReadiness";
import type { Exam } from "../../api/types";
import type { PrepMilestoneTask } from "../../lib/examReadiness";
import styles from "./examPrepModal.module.css";

export interface ExamPrepModalProps {
  open: boolean;
  exam: Exam | null;
  folderId?: string | null;
  onClose: () => void;
}

export function ExamPrepModal({ open, exam, onClose }: ExamPrepModalProps) {
  const { readiness, roadmap, isPending } = useExamReadiness(exam);
  const addTask = useAddTask();

  const [checkedTaskIds, setCheckedTaskIds] = useState<Record<string, boolean>>({});
  const [addingAll, setAddingAll] = useState(false);
  const [addedSuccessMsg, setAddedSuccessMsg] = useState<string | null>(null);
  const [addedTaskIds, setAddedTaskIds] = useState<Record<string, boolean>>({});

  if (!open || !exam) return null;

  const toggleTaskCheck = (taskId: string) => {
    setCheckedTaskIds((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const handleAddSingleTask = async (task: PrepMilestoneTask) => {
    try {
      await addTask.mutateAsync({
        text: `[${exam.exam_name}] ${task.title}`,
        dueDate: task.dueDate,
      });
      setAddedTaskIds((prev) => ({ ...prev, [task.id]: true }));
    } catch {
      // Handled by react query
    }
  };

  const handleAddAllTasks = async () => {
    if (!roadmap || roadmap.length === 0) return;
    setAddingAll(true);
    setAddedSuccessMsg(null);

    const allTasks = roadmap.flatMap((p) => p.tasks);
    let count = 0;

    try {
      for (const task of allTasks) {
        if (!addedTaskIds[task.id]) {
          await addTask.mutateAsync({
            text: `[${exam.exam_name}] ${task.title}`,
            dueDate: task.dueDate,
          });
          count++;
        }
      }
      const newAdded: Record<string, boolean> = { ...addedTaskIds };
      allTasks.forEach((t) => {
        newAdded[t.id] = true;
      });
      setAddedTaskIds(newAdded);
      setAddedSuccessMsg(`Added ${count} prep tasks to Task Manager!`);
      setTimeout(() => setAddedSuccessMsg(null), 4000);
    } catch {
      // Handled by react query
    } finally {
      setAddingAll(false);
    }
  };

  const daysLeft = readiness?.daysRemaining ?? 0;
  const countdownText =
    daysLeft <= 0
      ? "Exam Today!"
      : daysLeft === 1
        ? "1 Day Remaining"
        : `${daysLeft} Days Remaining`;

  const score = readiness?.score ?? 0;
  const tier = readiness?.tier ?? "Critical Gap";

  // Circular gauge math: radius 42, circumference ~ 263.89
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const tierClass =
    tier === "Exam Ready"
      ? styles.tierReady
      : tier === "In Progress"
        ? styles.tierProgress
        : styles.tierGap;

  const prettyDate = new Date(`${exam.exam_date}T00:00:00`).toLocaleDateString(
    undefined,
    { weekday: "short", month: "short", day: "numeric", year: "numeric" },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Exam Countdown & AI Prep Roadmap"
      subtitle="Intelligent readiness score and adaptive multi-phase prep blueprint"
      closeOnOverlayClick
      footer={
        <div className={styles.modalFooter}>
          {addedSuccessMsg ? (
            <span className={styles.footerFeedback} role="status">
              <Icon name="check" size={16} /> {addedSuccessMsg}
            </span>
          ) : (
            <div />
          )}
          <div style={{ display: "flex", gap: "var(--s-3)" }}>
            <Button onClick={onClose}>Close</Button>
            <Button
              variant="primary"
              onClick={handleAddAllTasks}
              disabled={addingAll || !roadmap || roadmap.length === 0}
            >
              <Icon name="list-checks" size={16} />
              {addingAll ? "Adding..." : "Add All Prep Tasks to Task Manager"}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.modalBody}>
        {isPending && !readiness ? (
          <Skeleton label="Calculating exam readiness..." height={200} />
        ) : (
          <>
            {/* Top Hero Section: Exam Details & Circular Readiness Gauge */}
            <div className={styles.heroCard}>
              <div className={styles.heroLeft}>
                <div className={styles.examTitleRow}>
                  <h3 className={styles.examTitle}>{exam.exam_name}</h3>
                  <span
                    className={`${styles.countdownPill} ${
                      daysLeft <= 3 ? styles.countdownPillUrgent : ""
                    }`}
                  >
                    <Icon name="clock" size={13} />
                    {countdownText}
                  </span>
                </div>
                <div className={styles.metaRow}>
                  <span>
                    <Icon name="calendar" size={14} /> {prettyDate}
                  </span>
                  <span>•</span>
                  <span>Difficulty: {exam.difficulty || "Medium"}</span>
                  {readiness && (
                    <>
                      <span>•</span>
                      <span>
                        Target:{" "}
                        {Math.round(readiness.targetStudyMinutes / 60)}h
                        ({readiness.targetHoursRemaining}h remaining)
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Circular Gauge */}
              <div className={styles.gaugeContainer}>
                <svg
                  className={styles.gaugeSvg}
                  viewBox="0 0 100 100"
                  aria-hidden="true"
                >
                  <circle
                    className={styles.gaugeBg}
                    cx="50"
                    cy="50"
                    r={radius}
                  />
                  <circle
                    className={`${styles.gaugeFill} ${tierClass}`}
                    cx="50"
                    cy="50"
                    r={radius}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                  />
                </svg>
                <div className={styles.gaugeCenter}>
                  <span className={styles.gaugeValue}>{score}%</span>
                  <span className={styles.gaugeTier}>{tier}</span>
                </div>
              </div>
            </div>

            {/* Three-Factor Breakdown Bars */}
            {readiness && (
              <div className={styles.factorsGrid}>
                {/* 1. Material Coverage */}
                <div className={styles.factorCard}>
                  <div className={styles.factorHeader}>
                    <span>Material Coverage (30%)</span>
                    <span className={styles.factorScore}>
                      {readiness.breakdown.coverage}%
                    </span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: `${readiness.breakdown.coverage}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                  <span className={styles.factorDesc}>
                    Syllabus notes, lecture materials & study decks synthesized
                  </span>
                </div>

                {/* 2. Retention & Quiz Mastery */}
                <div className={styles.factorCard}>
                  <div className={styles.factorHeader}>
                    <span>Quiz Mastery (40%)</span>
                    <span className={styles.factorScore}>
                      {readiness.breakdown.mastery}%
                    </span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: `${readiness.breakdown.mastery}%`,
                        background:
                          readiness.breakdown.mastery >= 75
                            ? "var(--success)"
                            : "var(--warning)",
                      }}
                    />
                  </div>
                  <span className={styles.factorDesc}>
                    Quiz test accuracy & spaced retrieval card maturity
                  </span>
                </div>

                {/* 3. Study Time Investment */}
                <div className={styles.factorCard}>
                  <div className={styles.factorHeader}>
                    <span>Study Investment (30%)</span>
                    <span className={styles.factorScore}>
                      {readiness.breakdown.studyTime}%
                    </span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: `${readiness.breakdown.studyTime}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                  <span className={styles.factorDesc}>
                    {Math.round(readiness.totalStudyMinutes / 60)}h logged of{" "}
                    {Math.round(readiness.targetStudyMinutes / 60)}h target
                  </span>
                </div>
              </div>
            )}

            {/* Weak Topics Alert Banner */}
            {readiness && readiness.weakTopics.length > 0 && (
              <div className={styles.weakBanner} role="alert">
                <Icon
                  name="alert-triangle"
                  size={18}
                  className={styles.weakBannerIcon}
                />
                <div className={styles.weakBannerContent}>
                  <span className={styles.weakBannerTitle}>
                    Key Weak Topics Identified
                  </span>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--fs-xs)",
                      color: "var(--text-muted)",
                    }}
                  >
                    Your recent quiz performance highlights high error rates in
                    these areas:
                  </p>
                  <div className={styles.weakTopicList}>
                    {readiness.weakTopics.map((topic) => (
                      <span key={topic} className={styles.weakPill}>
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 4-Phase Countdown Roadmap */}
            <div className={styles.roadmapSection}>
              <div className={styles.roadmapHeader}>
                <h4 className={styles.roadmapTitle}>
                  <Icon name="compass" size={18} />
                  Milestone Countdown Roadmap
                </h4>
              </div>

              <div className={styles.phaseList}>
                {roadmap.map((phase) => {
                  const isCurrent = phase.status === "current";
                  const isCompleted = phase.status === "completed";
                  const statusClass = isCompleted
                    ? styles.statusCompleted
                    : isCurrent
                      ? styles.statusCurrent
                      : styles.statusUpcoming;

                  return (
                    <div
                      key={phase.phaseNumber}
                      className={`${styles.phaseCard} ${
                        isCurrent ? styles.phaseCardCurrent : ""
                      }`}
                    >
                      <div className={styles.phaseHeaderRow}>
                        <div className={styles.phaseTitleGroup}>
                          <span className={styles.phaseTitle}>
                            {phase.title}
                          </span>
                          <span className={styles.phaseSubtitle}>
                            {phase.subtitle}
                          </span>
                        </div>
                        <div className={styles.phaseBadges}>
                          <span className={styles.phaseRangePill}>
                            {phase.daysRange}
                          </span>
                          <span
                            className={`${styles.phaseStatusPill} ${statusClass}`}
                          >
                            {phase.status}
                          </span>
                        </div>
                      </div>

                      <div className={styles.taskList}>
                        {phase.tasks.map((task) => {
                          const isDone =
                            checkedTaskIds[task.id] ?? task.completed;
                          const isAdded = addedTaskIds[task.id];

                          const prettyDue = new Date(
                            `${task.dueDate}T00:00:00`,
                          ).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          });

                          return (
                            <div key={task.id} className={styles.taskRow}>
                              <input
                                type="checkbox"
                                checked={isDone}
                                onChange={() => toggleTaskCheck(task.id)}
                                className={styles.taskCheck}
                                aria-label={`Mark task completed: ${task.title}`}
                              />
                              <div className={styles.taskInfo}>
                                <div className={styles.taskTitleRow}>
                                  <span
                                    className={`${styles.taskTitle} ${
                                      isDone ? styles.taskTitleDone : ""
                                    }`}
                                  >
                                    {task.title}
                                  </span>
                                  <span className={styles.taskCategoryPill}>
                                    {task.category}
                                  </span>
                                </div>
                                <span className={styles.taskDesc}>
                                  {task.description}
                                </span>
                                <div className={styles.taskMeta}>
                                  <span>Due: {prettyDue}</span>
                                  <span>•</span>
                                  <span>
                                    {task.daysBeforeExam === 0
                                      ? "Exam Day"
                                      : `${task.daysBeforeExam}d before`}
                                  </span>
                                </div>
                              </div>
                              <Button
                                variant="secondary"
                                className={styles.taskAddBtn}
                                onClick={() => handleAddSingleTask(task)}
                                disabled={isAdded || addTask.isPending}
                              >
                                {isAdded ? (
                                  <>
                                    <Icon name="check" size={12} /> Added
                                  </>
                                ) : (
                                  <>
                                    <Icon name="plus" size={12} /> Task
                                  </>
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
