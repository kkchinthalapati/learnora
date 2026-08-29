import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { useDialog } from "../../context/dialog";
import { useTimer } from "../../context/timer";
import { useFolders } from "../../hooks/useFolders";
import { useTasks } from "../../hooks/useTasks";
import { useStudyRoom } from "../../hooks/useStudyRoom";
import { useTranslation } from "../../hooks/useTranslation";
import type { TranslationKey } from "../../lib/i18n";
import { Storage } from "../../lib/storage";
import { SESSION_LOGGED_EVENT } from "../../context/TimerProvider";
import {
  WORKFLOW_PRESETS,
  format,
  isCountUp,
  isStopAndLog,
  modeLabel,
  progressFraction,
  type TimerType,
} from "../../lib/timer";
import styles from "./timer.module.css";

/* Timer view — ports index.html:596-846 + js/timer.js's rendering (:520-744)
 * and js/main.js:1177-1280.
 *
 * All the clock logic lives in lib/timer.ts and TimerProvider; this file is
 * only the screen. That split is what replaces `Timer.updateUI()`, which
 * hand-wrote nine elements and toggled five `.hidden` classes on every tick. */

const TYPE_LABELS: ReadonlyArray<{ id: TimerType; label: string }> = [
  { id: "pomodoro", label: "Pomodoro" },
  { id: "countdown", label: "Countdown" },
  { id: "stopwatch", label: "Stopwatch" },
  { id: "flowtime", label: "Flowtime" },
];

const TYPE_NOTES: Partial<
  Record<TimerType, { heading: string; note: string }>
> = {
  countdown: {
    heading: "Countdown",
    note: "A single stretch of focus. The ring empties as it rings and logs your session when it reaches zero.",
  },
  stopwatch: {
    heading: "Stopwatch",
    note: 'Open-ended count-up for flow sessions. Start it and focus — "Stop & log" records the minutes you studied.',
  },
  flowtime: {
    heading: "Flowtime",
    note: 'Focus as long as you like, then hit "Take a break". You\'ll get a break about a fifth as long, then it loops back to focus.',
  },
};

const RING_RADIUS = 90;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RECENT_SESSION_LIMIT = 5;

interface RecentFocusSession {
  id: number;
  timestamp: string;
  minutes: number;
  task: string;
}

function readRecentFocusSessions(): RecentFocusSession[] {
  const storedSessions = Storage.get<RecentFocusSession[]>("sessions", []);
  return Array.isArray(storedSessions)
    ? storedSessions.slice(0, RECENT_SESSION_LIMIT)
    : [];
}

export function TimerView() {
  const {
    state,
    draftConfig,
    setDraftConfig,
    panelType,
    start,
    pause,
    reset,
    extend,
    takeBreak,
    selectType,
    applyAndReset,
    activeTask,
    setActiveTask,
    activeFolderId,
    setActiveFolderId,
    favs,
    saveFav,
    deleteFav,
    applyFav,
    quote,
  } = useTimer();
  const { confirm, promptText } = useDialog();
  const { data: tasks } = useTasks();
  const { data: folders } = useFolders();
  const { focusParticipants, activeCount } = useStudyRoom();
  const t = useTranslation();

  const focusId = useId();
  const shortId = useId();
  const longId = useId();
  const cyclesId = useId();
  const countdownId = useId();
  const taskId = useId();
  const folderId = useId();
  const recentSessionsTitleId = useId();
  const [recentSessions, setRecentSessions] = useState(readRecentFocusSessions);

  useEffect(() => {
    const refreshRecentSessions = () => {
      setRecentSessions(readRecentFocusSessions());
    };
    window.addEventListener(SESSION_LOGGED_EVENT, refreshRecentSessions);
    window.addEventListener("storage", refreshRecentSessions);
    return () => {
      window.removeEventListener(SESSION_LOGGED_EVENT, refreshRecentSessions);
      window.removeEventListener("storage", refreshRecentSessions);
    };
  }, []);

  /* A bound task that isn't one of the fetched rows — see the note on the
     select below. Also covers a task renamed or completed since it was bound. */
  const unlistedTask =
    activeTask !== "None" && !(tasks ?? []).some((t) => t.text === activeTask)
      ? activeTask
      : null;

  const countUp = isCountUp(state);
  const seconds = countUp ? state.elapsed : state.timeLeft;
  const fraction = progressFraction(state);
  const stopAndLog = isStopAndLog(state);
  const showBreak = state.type === "flowtime" && state.mode === "Focus";
  const note = TYPE_NOTES[panelType];

  async function onReset() {
    /* The vanilla only guarded a count-down that had actually started —
       discarding progress is the destructive case. A count-up reset banks the
       session instead of losing it, so it needs no confirmation. */
    const hasProgress = !countUp && state.timeLeft < state.totalTime;
    if (hasProgress) {
      const ok = await confirm(
        "Are you sure you want to discard your current session progress?",
        { title: "Reset Timer", confirmText: "Reset", danger: true },
      );
      if (!ok) return;
    }
    reset();
  }

  async function onApply() {
    if (state.isRunning) {
      const ok = await confirm(
        "A timer is currently running. Switch to these settings and reset it now?",
        {
          title: "Timer running",
          confirmText: "Reset & switch",
          cancelText: "Keep running",
          danger: true,
        },
      );
      if (!ok) return;
    }
    applyAndReset();
  }

  async function onSaveFav() {
    const name = await promptText(
      "Save these durations as a reusable preset.",
      {
        title: "Name this preset",
        placeholder: "e.g. Math Prep",
        confirmText: "Save preset",
      },
    );
    if (name?.trim()) saveFav(name);
  }

  return (
    <div className={styles.view}>
      <div className={styles.layout}>
        <Card variant="panel" padding="lg" className={styles.panel}>
          <div
            className={styles.typeSeg}
            role="radiogroup"
            aria-label="Timer type"
          >
            {TYPE_LABELS.map(({ id, label }) => (
              <label key={id} className={styles.segOption}>
                <input
                  type="radio"
                  name="timer-type"
                  value={id}
                  checked={panelType === id}
                  onChange={() => selectType(id)}
                />
                {label}
              </label>
            ))}
          </div>

          {/* Staging a type mid-run needs saying out loud, or the timer looks
              like it ignored the click. role=status announces it. */}
          {state.stagedType && (
            <p className={styles.stageHint} role="status">
              Saved for your next session — your current timer keeps running
              (docked bottom-left). Press Apply &amp; Reset to switch to it now.
            </p>
          )}

          {panelType === "pomodoro" && (
            <div>
              <h3>{t("timer_presets")}</h3>
              <div className={styles.presetButtons}>
                {(
                  [
                    { key: "deep", labelKey: "preset_deep" },
                    { key: "cram", labelKey: "preset_cram" },
                    { key: "light", labelKey: "preset_light" },
                  ] satisfies { key: string; labelKey: TranslationKey }[]
                ).map(({ key, labelKey }) => (
                  <Button
                    key={key}
                    onClick={() => setDraftConfig(WORKFLOW_PRESETS[key])}
                  >
                    {t(labelKey)}
                  </Button>
                ))}
              </div>

              <hr className={styles.divider} />

              <div className={styles.configRow}>
                <label htmlFor={focusId}>{t("config_focus")}</label>
                <input
                  id={focusId}
                  type="number"
                  min={1}
                  className={styles.smallInput}
                  value={draftConfig.focus}
                  onChange={(e) =>
                    setDraftConfig({ focus: Number(e.target.value) })
                  }
                />
              </div>
              <div className={styles.configRow}>
                <label htmlFor={shortId}>{t("config_short")}</label>
                <input
                  id={shortId}
                  type="number"
                  min={1}
                  className={styles.smallInput}
                  value={draftConfig.short}
                  onChange={(e) =>
                    setDraftConfig({ short: Number(e.target.value) })
                  }
                />
              </div>
              <div className={styles.configRow}>
                <label htmlFor={longId}>{t("config_long")}</label>
                <input
                  id={longId}
                  type="number"
                  min={1}
                  className={styles.smallInput}
                  value={draftConfig.long}
                  onChange={(e) =>
                    setDraftConfig({ long: Number(e.target.value) })
                  }
                />
              </div>
              <div className={styles.configRow}>
                <label htmlFor={cyclesId}>{t("config_cycles")}</label>
                <input
                  id={cyclesId}
                  type="number"
                  min={1}
                  className={styles.smallInput}
                  value={draftConfig.maxCycles}
                  onChange={(e) =>
                    setDraftConfig({ maxCycles: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          )}

          {panelType === "countdown" && (
            <div>
              <h3>{TYPE_NOTES.countdown!.heading}</h3>
              <div className={styles.configRow}>
                <label htmlFor={countdownId}>Duration (mins)</label>
                <input
                  id={countdownId}
                  type="number"
                  min={1}
                  className={styles.smallInput}
                  value={draftConfig.countdown}
                  onChange={(e) =>
                    setDraftConfig({ countdown: Number(e.target.value) })
                  }
                />
              </div>
              <p className={styles.typeNote}>{TYPE_NOTES.countdown!.note}</p>
            </div>
          )}

          {(panelType === "stopwatch" || panelType === "flowtime") && note && (
            <div>
              <h3>{note.heading}</h3>
              <p className={styles.typeNote}>{note.note}</p>
            </div>
          )}

          <div className={styles.taskBinder}>
            <label htmlFor={taskId}>{t("config_task")}</label>
            <select
              id={taskId}
              value={activeTask}
              onChange={(e) => setActiveTask(e.target.value)}
            >
              <option value="None">None</option>
              {/* The Weekly Plan hands off a *subject*, which is usually not
                  one of the student's tasks. Without an option to match it the
                  select falls back to showing "None" while the provider still
                  logs the session against the subject — the display would be
                  lying about where the time went. The vanilla appended the
                  option by hand for the same reason (js/main.js:1307-1318). */}
              {unlistedTask ? (
                <option value={unlistedTask}>{unlistedTask}</option>
              ) : null}
              {(tasks ?? [])
                .filter((t) => !t.is_done)
                .map((t) => (
                  <option key={t.id} value={t.text}>
                    {t.text}
                  </option>
                ))}
            </select>
          </div>

          <div className={styles.taskBinder}>
            <label htmlFor={folderId}>{t("config_folder")}</label>
            <select
              id={folderId}
              value={activeFolderId}
              onChange={(e) => setActiveFolderId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {(folders ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <Button className={styles.applyBtn} onClick={() => void onApply()}>
            {t("btn_apply")}
          </Button>

          <div className={styles.favs}>
            <Button
              className={styles.fullWidth}
              onClick={() => void onSaveFav()}
            >
              <Icon name="star" size={15} /> Save Current as Preset
            </Button>
            {favs.map((fav, i) => (
              <div key={`${fav.name}-${i}`} className={styles.favRow}>
                <Button onClick={() => applyFav(fav)}>
                  <Icon name="star" size={14} /> {fav.name} [
                  {fav.type[0].toUpperCase() + fav.type.slice(1)}]
                  {fav.type === "countdown"
                    ? ` (${fav.config.countdown}m)`
                    : ` (${fav.config.focus}m)`}
                </Button>
                <Button
                  variant="danger"
                  aria-label={`Delete preset: ${fav.name}`}
                  onClick={() => deleteFav(i)}
                >
                  ✖
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <div className={styles.focusColumn}>
          <div className={styles.display}>
            <p className={styles.quote}>&ldquo;{quote}&rdquo;</p>

            <div className={styles.ringWrapper}>
              <svg
                className={styles.ring}
                viewBox="0 0 200 200"
                aria-hidden="true"
              >
                <circle
                  className={styles.ringBg}
                  cx="100"
                  cy="100"
                  r={RING_RADIUS}
                />
                <circle
                  className={styles.ringProgress}
                  cx="100"
                  cy="100"
                  r={RING_RADIUS}
                  style={{
                    strokeDashoffset: RING_CIRCUMFERENCE * (1 - fraction),
                  }}
                />
              </svg>
              <div className={styles.ringContent}>
                <h2 className={styles.modeLabel}>{modeLabel(state)}</h2>
                {/* aria-live off: a per-second announcement would be unusable.
                  The mode label and the end-of-phase toast carry the news. */}
                <p className={styles.time} aria-live="off">
                  {format(seconds)}
                </p>
                {state.type === "pomodoro" && (
                  <p className={styles.cycles}>
                    Cycle: {state.cycles} / {state.config.maxCycles}
                  </p>
                )}
              </div>
            </div>

            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(fraction * 100)}
              aria-label={`${modeLabel(state)} progress`}
            >
              <div
                className={styles.progressBar}
                style={{ width: `${fraction * 100}%` }}
              />
            </div>

            <div className={styles.controls}>
              {state.isRunning ? (
                <Button variant="primary" onClick={pause}>
                  {t("btn_pause")}
                </Button>
              ) : (
                <Button variant="primary" onClick={start}>
                  {t("btn_start")}
                </Button>
              )}
              {/* +5 min is meaningless on a clock with no end. */}
              {!countUp && <Button onClick={extend}>+5 min</Button>}
              {showBreak && <Button onClick={takeBreak}>Take a break</Button>}
              <Button
                className={
                  stopAndLog ? styles.ghostSuccess : styles.ghostDanger
                }
                onClick={() => void onReset()}
              >
                {stopAndLog ? "Stop & log" : t("btn_reset")}
              </Button>
            </div>
          </div>

          <div className={styles.studyRoomWidget}>
            <div className={styles.studyRoomWidgetHeader}>
              <span className={styles.studyRoomTitle}>
                <span className={styles.studyRoomDot} />
                Study Room ·{" "}
                {activeCount > 0 ? `${activeCount} focusing` : "Live Room"}
              </span>
              <Link to="/room" className={styles.studyRoomCta}>
                Open Study Room →
              </Link>
            </div>
            {focusParticipants.length > 0 ? (
              <div className={styles.studyBuddiesList}>
                {focusParticipants.slice(0, 5).map((p) => {
                  const displayName = p.name || "Student";
                  const initials =
                    displayName
                      .split(" ")
                      .map((n: string) => n[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase() || "?";
                  return (
                    <div
                      key={p.id}
                      className={styles.studyBuddyAvatar}
                      title={`${displayName}${p.task ? ` (${p.task})` : ""}`}
                    >
                      {initials}
                      <span className={styles.buddyLiveIndicator} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={styles.studyRoomEmpty}>
                Study alongside friends in real time.{" "}
                <Link to="/room">Join the room</Link> to focus together.
              </p>
            )}
          </div>

          <Card
            as="section"
            variant="panel"
            padding="md"
            className={styles.recentSessions}
            aria-labelledby={recentSessionsTitleId}
          >
            <div className={styles.recentSessionsHeader}>
              <h2 id={recentSessionsTitleId}>Recent sessions</h2>
              <span>{recentSessions.length} shown</span>
            </div>
            {recentSessions.length > 0 ? (
              <ol className={styles.sessionList}>
                {recentSessions.map((session) => (
                  <li key={session.id} className={styles.sessionRow}>
                    <span className={styles.sessionTask}>{session.task}</span>
                    <span className={styles.sessionMeta}>
                      {session.minutes} min · {session.timestamp}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.sessionEmpty}>
                Finished focus sessions will appear here.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
