import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { useProAction } from "../../components/ProGate";
import type { IconName } from "../../components/icons";
import { Skeleton } from "../../components/Skeleton";
import { useTimer } from "../../context/timer";
import { useToast } from "../../context/toast";
import { useStudySchedule } from "../../hooks/useStudySchedule";
import type { ScheduledBlock } from "../../lib/autoSchedule";
import type { BusyBlock } from "../../lib/availability";
import { downloadICS, generateScheduleICS } from "../../lib/ics";
import { formatClock, formatDuration } from "../../lib/lifeContext";
import { DashboardCardHeader } from "./DashboardCardHeader";
import styles from "./todayTimeline.module.css";

/* The day, decided.
 *
 * Every other card on this dashboard reports a number and leaves the student
 * to work out what to do about it: cards are due, a task is overdue, an exam
 * is in nine days. This one answers the question those numbers raise. It takes
 * the same data, lays it against the student's real commitments, and says
 * "9:30, forty-five minutes, this" — with a button that starts the timer.
 *
 * That is the whole product thesis in one card. The people we are building for
 * are not short of capability or material; they are short of a decision about
 * what to do at three o'clock on a Tuesday. */

type TimelineItem =
  | {
      type: "commitment";
      key: string;
      startMin: number;
      endMin: number;
      block: BusyBlock;
    }
  | {
      type: "study";
      key: string;
      startMin: number;
      endMin: number;
      block: ScheduledBlock;
    };

const KIND_ICON: Record<ScheduledBlock["kind"], IconName> = {
  review: "layers",
  task: "check-square",
  exam: "graduation-cap",
  subject: "brain",
};

const KIND_LABEL: Record<ScheduledBlock["kind"], string> = {
  review: "Recall",
  task: "Task",
  exam: "Exam prep",
  subject: "Deep work",
};

/* Above this the block landed in one of the day's genuinely good hours, and
 * saying so is the point — a student who learns that their 8pm is worth more
 * than their 2pm has learned something they keep after they stop using us. */
const PRIME_ENERGY = 0.8;

function minutesNow(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function TodayTimelineCard() {
  const schedule = useStudySchedule();
  const { prepareFocus } = useTimer();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const today = schedule.days[0];

  const items = useMemo<TimelineItem[]>(() => {
    if (!today) return [];
    const commitments: TimelineItem[] = today.busy.map((block, i) => ({
      type: "commitment",
      key: `c${i}-${block.startMin}`,
      startMin: block.startMin,
      endMin: block.endMin,
      block,
    }));
    const study: TimelineItem[] = schedule.today.map((block) => ({
      type: "study",
      key: block.id,
      startMin: block.startMin,
      endMin: block.endMin,
      block,
    }));
    return [...commitments, ...study].sort((a, b) => a.startMin - b.startMin);
  }, [today, schedule.today]);

  /* Read once per render rather than ticking. A minute-accurate "now" line
     would re-render the whole dashboard sixty times an hour to move a border
     colour, and the student is looking at a plan for the day, not a stopwatch. */
  const nowMin = minutesNow(new Date());

  const startBlock = (block: ScheduledBlock) => {
    prepareFocus(block.endMin - block.startMin, block.label, block.folderId);
    void navigate("/timer");
  };

  const exportGate = useProAction("scheduleExport");

  const exportWeek = () => {
    if (!exportGate.guard()) return;
    if (schedule.blocks.length === 0) return;
    downloadICS(generateScheduleICS(schedule.blocks), "learnora_this_week.ics");
    showToast(
      "Calendar file downloaded — open it to add this week to your calendar.",
    );
  };

  if (schedule.isPending) {
    return (
      <Card variant="elevated" className={styles.card}>
        <DashboardCardHeader eyebrow="Your day" />
        <Skeleton label="Building your day" height={24} width="60%" />
        <Skeleton height={140} />
      </Card>
    );
  }

  if (!schedule.configured) {
    return (
      <Card variant="elevated" className={styles.card}>
        <DashboardCardHeader eyebrow="Your day" />
        <div className={styles.invite}>
          <span className={styles.inviteIcon} aria-hidden="true">
            <Icon name="calendar" size={20} />
          </span>
          <div>
            <h3 className={styles.inviteTitle}>
              Learnora doesn&rsquo;t know your week yet
            </h3>
            <p className={styles.inviteCopy}>
              Tell us when your lectures, shifts and training are — or import
              your calendar — and every day gets a schedule built around them,
              in the hours your head actually works.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void navigate("/my-week")}
            >
              <Icon name="sparkles" size={14} /> Set up my week
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const dueToday = schedule.unplaced.filter(
    (u) => u.demand.dueDate === schedule.todayDate,
  );

  return (
    <Card variant="elevated" className={styles.card}>
      <DashboardCardHeader
        eyebrow="Your day"
        action={{ to: "/my-week", label: "Edit my week" }}
      />

      <div className={styles.summary}>
        <p className={styles.summaryLead}>
          {schedule.todayMins > 0 ? (
            <>
              <strong>{formatDuration(schedule.todayMins)}</strong> of study,
              placed around {today.busy.length}{" "}
              {today.busy.length === 1 ? "commitment" : "commitments"}.
            </>
          ) : today.protectedDay ? (
            <>Today is yours. Nothing is scheduled — that was the deal.</>
          ) : (
            <>
              No study fits today. Nothing is due, or the day is already full.
            </>
          )}
        </p>
        {schedule.blocks.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={exportWeek}>
            <Icon name="download" size={14} /> Add week to calendar
          </Button>
        ) : null}
      </div>

      {today.notes.length > 0 ? (
        <p className={styles.notes}>
          <Icon name="star" size={13} /> {today.notes.join(" · ")}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className={styles.quiet}>
          A clear day.{" "}
          <Link to="/tasks" className={styles.link}>
            Add something to work on
          </Link>{" "}
          and it will be scheduled here.
        </p>
      ) : (
        <ol className={styles.timeline}>
          {items.map((item) => {
            const past = item.endMin <= nowMin;
            const live = item.startMin <= nowMin && nowMin < item.endMin;
            const rowClass = [
              styles.row,
              past ? styles.rowPast : null,
              live ? styles.rowLive : null,
            ]
              .filter(Boolean)
              .join(" ");

            if (item.type === "commitment") {
              return (
                <li key={item.key} className={rowClass}>
                  <span className={styles.time}>
                    {formatClock(item.startMin)}
                  </span>
                  <span
                    className={`${styles.rail} ${styles.railMuted}`}
                    aria-hidden="true"
                  />
                  <div className={styles.body}>
                    <span className={styles.commitmentLabel}>
                      {item.block.label}
                    </span>
                    <span className={styles.meta}>
                      {formatDuration(item.endMin - item.startMin)}
                      {item.block.source === "calendar"
                        ? " · from your calendar"
                        : ""}
                    </span>
                  </div>
                </li>
              );
            }

            const block = item.block;
            const mins = item.endMin - item.startMin;
            return (
              <li key={item.key} className={rowClass}>
                <span className={styles.time}>
                  {formatClock(item.startMin)}
                </span>
                <span
                  className={`${styles.rail} ${styles.railStudy}`}
                  aria-hidden="true"
                />
                <div className={`${styles.body} ${styles.studyBody}`}>
                  <div className={styles.studyHead}>
                    <span className={styles.kind}>
                      <Icon name={KIND_ICON[block.kind]} size={13} />
                      {KIND_LABEL[block.kind]}
                    </span>
                    {block.energy >= PRIME_ENERGY ? (
                      <span className={styles.prime}>
                        <Icon name="flame" size={12} /> prime focus
                      </span>
                    ) : null}
                  </div>
                  <span className={styles.studyLabel}>
                    {block.label}
                    {block.part ? (
                      <span className={styles.part}>
                        {" "}
                        part {block.part.index} of {block.part.total}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.meta}>
                    {formatDuration(mins)} · until {formatClock(item.endMin)}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => startBlock(block)}
                  aria-label={`Start ${formatDuration(mins)} focus session: ${block.label}`}
                >
                  Start
                </Button>
              </li>
            );
          })}
        </ol>
      )}

      {dueToday.length > 0 ? (
        /* Saying this out loud is the point. A planner that quietly slid a
           deadline would be lying, and "there is more due today than there is
           day left" is the most actionable thing we can tell someone — while
           there is still a morning left to do something about it. */
        <p className={styles.shortfall} role="status">
          <Icon name="alert-triangle" size={14} />
          <span>
            {formatDuration(
              dueToday.reduce((sum, u) => sum + u.remainingMins, 0),
            )}{" "}
            of work due today doesn&rsquo;t fit in the time you have.{" "}
            <Link to="/my-week" className={styles.link}>
              Free up some space
            </Link>{" "}
            or move a deadline.
          </span>
        </p>
      ) : null}

      {exportGate.paywall}
    </Card>
  );
}
