/* /welcome — the first thing a brand new account sees.
 *
 * The problem this solves: signing up drops you on a dashboard of nine cards,
 * eight of which say some version of "you have nothing here yet", with a
 * sidebar of twenty destinations and no indication which one is yours. The
 * fix is not a product tour — nobody reads those — it is a handful of taps
 * that visibly change the app before you ever reach it.
 *
 * Shape borrowed from a Discord server's join questions: pick what you're
 * here for, and the room you land in is already arranged around that. Every
 * answer here writes to a store that Settings, My week or Dashboard ▸
 * Customize already own (see lib/onboarding.ts), so nothing asked on this
 * screen is asked *only* on this screen, and skipping costs you nothing but a
 * default.
 *
 * Rendered outside AppShell on purpose: the sidebar is the overwhelm, and
 * putting it behind this screen would undercut the whole point.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { useAuth } from "../../context/auth";
import { useSettings } from "../../context/settings";
import { useToast } from "../../context/toast";
import { useUpdateProfile } from "../../hooks/useAuthActions";
import { useLifeContext } from "../../hooks/useLifeContext";
import { useAddFolder } from "../../hooks/useFolders";
import { useSaveExam } from "../../hooks/useExams";
import {
  CAPACITY_CHOICES,
  COACH_STYLES,
  EMPTY_ANSWERS,
  EXAM_BOARDS,
  FOCUS_AREAS,
  GOALS_WITH_BOARDS,
  ONBOARDING_METADATA_KEY,
  ONBOARDING_VERSION,
  STUDY_GOALS,
  STUDY_TIMES,
  dashboardLayoutFor,
  goalSummary,
  lifeContextPatchFor,
  markOnboardedLocally,
  nextStepsFor,
  readOnboarding,
  settingsPatchFor,
  studyProfilePatchFor,
  type FocusAreaId,
  type OnboardingAnswers,
} from "../../lib/onboarding";
import { profileApi } from "../../api/profile";
import { useProfileDetails } from "../../hooks/useProfileDetails";
import {
  loadDashboardLayout,
  saveDashboardLayout,
} from "../dashboard/DashboardCustomizeModal";
import { AI_LENGTH_OPTIONS } from "../../lib/settings";
import styles from "./welcome.module.css";

const STEPS = [
  "hello",
  "goal",
  "focus",
  "coach",
  "rhythm",
  "subject",
  "done",
] as const;
type StepId = (typeof STEPS)[number];

/* The last step is a summary, not a question — it doesn't get a progress dot
   or count toward "step 3 of 5". */
const QUESTION_STEPS = STEPS.slice(1, -1);

export function WelcomeView() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { updateAndSave } = useSettings();
  const { update: updateLifeContext } = useLifeContext();
  const updateProfile = useUpdateProfile();
  const addFolder = useAddFolder();
  const saveExam = useSaveExam();

  const replaying = params.get("replay") === "1";

  /* On a replay the previous answers are the starting point, so someone
     re-running setup is editing rather than starting from blank. */
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => {
    const saved = replaying ? readOnboarding(user) : null;
    return saved
      ? { ...saved, completedAt: null, skipped: false }
      : EMPTY_ANSWERS;
  });

  const [step, setStep] = useState<StepId>("hello");
  const [subjectName, setSubjectName] = useState("");
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [notifyOptIn, setNotifyOptIn] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [createdSubject, setCreatedSubject] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const firstName = useMemo(() => {
    const full = (user?.user_metadata as Record<string, unknown> | undefined)
      ?.full_name;
    if (typeof full !== "string") return null;
    const first = full.trim().split(/\s+/)[0];
    return first || null;
  }, [user]);

  /* Exam board and target grade are also editable in Settings ▸ Preferences ▸
     Study Focus, and that screen writes straight to `profiles`. Replaying the
     wizard from the answers blob alone would therefore show — and on finish,
     write back — whatever was answered at signup, silently reverting any edit
     made there since. Seeding from the live columns keeps Settings the source
     of truth for the two fields it shares with this screen. */
  const profileDetails = useProfileDetails();
  const seededFromProfile = useRef(false);
  useEffect(() => {
    if (!replaying || seededFromProfile.current || !profileDetails.data) return;
    seededFromProfile.current = true;
    const { examType, targetGrade, subject } = profileDetails.data;
    setAnswers((prev) => ({
      ...prev,
      examType: (examType as OnboardingAnswers["examType"]) ?? prev.examType,
      targetGrade: targetGrade ?? prev.targetGrade,
    }));
    if (subject) setSubjectName(subject);
  }, [profileDetails.data, replaying]);

  /* Each step is a fresh screenful of content in the same document, so focus
     has to be moved deliberately or a screen reader stays where the old
     "Continue" button used to be. */
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const index = STEPS.indexOf(step);
  const questionIndex = QUESTION_STEPS.indexOf(
    step as (typeof QUESTION_STEPS)[number],
  );

  const patch = useCallback((next: Partial<OnboardingAnswers>) => {
    setAnswers((prev) => ({ ...prev, ...next }));
  }, []);

  const toggleFocus = useCallback((id: FocusAreaId) => {
    setAnswers((prev) => ({
      ...prev,
      focusAreas: prev.focusAreas.includes(id)
        ? prev.focusAreas.filter((a) => a !== id)
        : [...prev.focusAreas, id],
    }));
  }, []);

  /* Everything the wizard promised, actually applied. Ordered so the local
     writes — the ones that change what the dashboard looks like — happen
     first and cannot be lost to a failed network call. */
  const commit = useCallback(
    async (final: OnboardingAnswers) => {
      updateAndSave(settingsPatchFor(final));

      const lifePatch = lifeContextPatchFor(final);
      if (Object.keys(lifePatch).length > 0) updateLifeContext(lifePatch);

      saveDashboardLayout(dashboardLayoutFor(final, loadDashboardLayout()));

      if (user) markOnboardedLocally(user.id);

      const trimmedSubject = subjectName.trim();
      if (trimmedSubject) {
        try {
          await addFolder.mutateAsync({ name: trimmedSubject });
          setCreatedSubject(trimmedSubject);
        } catch {
          showToast(
            "Couldn't create that subject — you can add it from Library.",
          );
        }
      }

      /* Best-effort, like the folder and exam writes above: these four columns
         only shape the planner's prompt, so failing to save them must not cost
         the student the rest of a completed setup. Silent rather than a toast —
         unlike a subject they typed and can see is missing, there is nothing
         here for them to act on. */
      try {
        await profileApi.updateStudyProfile(
          studyProfilePatchFor(final, subjectName),
        );
      } catch {
        /* Recoverable from Settings ▸ Preferences ▸ Study Focus. */
      }

      const trimmedExam = examName.trim();
      if (trimmedExam && examDate) {
        try {
          await saveExam.mutateAsync({
            payload: { exam_name: trimmedExam, exam_date: examDate },
          });
        } catch {
          showToast("Couldn't save that exam — you can add it from Exams.");
        }
      }

      try {
        await updateProfile.mutateAsync({
          [ONBOARDING_METADATA_KEY]: final,
        });
      } catch {
        /* Non-fatal, and deliberately silent: the local mirror above already
           stops the guard bouncing them back here, and the preferences the
           answers produced are saved. All that is lost is the answers
           following them to a second device. */
      }
    },
    [
      addFolder,
      examDate,
      examName,
      saveExam,
      showToast,
      subjectName,
      updateAndSave,
      updateLifeContext,
      updateProfile,
      user,
    ],
  );

  const finish = useCallback(async () => {
    if (committing) return;
    setCommitting(true);
    const final: OnboardingAnswers = {
      ...answers,
      version: ONBOARDING_VERSION,
      completedAt: new Date().toISOString(),
      skipped: false,
    };
    setAnswers(final);
    await commit(final);
    setCommitting(false);
    setStep("done");
  }, [answers, commit, committing]);

  const skip = useCallback(async () => {
    if (committing) return;
    setCommitting(true);
    if (user) markOnboardedLocally(user.id);
    try {
      await updateProfile.mutateAsync({
        [ONBOARDING_METADATA_KEY]: {
          ...EMPTY_ANSWERS,
          skipped: true,
          completedAt: new Date().toISOString(),
        } satisfies OnboardingAnswers,
      });
    } catch {
      /* Same reasoning as commit(): the local mirror is enough to let them
         through, and there is nothing here worth blocking an exit on. */
    }
    navigate("/", { replace: true });
  }, [committing, navigate, updateProfile, user]);

  const goNext = useCallback(() => {
    const next = STEPS[index + 1];
    if (next === "done") {
      void finish();
      return;
    }
    if (next) setStep(next);
  }, [finish, index]);

  const goBack = useCallback(() => {
    const prev = STEPS[index - 1];
    if (prev) setStep(prev);
  }, [index]);

  const canContinue =
    step === "goal"
      ? answers.goal !== null
      : step === "focus"
        ? answers.focusAreas.length > 0
        : true;

  /* Enter advances, the way it would in a form. Held back on the subject step
     so it submits the text field's own value rather than racing it, and on
     the summary where there is nothing left to advance to. */
  useEffect(() => {
    if (step === "done" || step === "subject") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "BUTTON" || target?.tagName === "INPUT") return;
      if (!canContinue) return;
      event.preventDefault();
      goNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canContinue, goNext, step]);

  async function handleNotifyToggle(on: boolean) {
    setNotifyOptIn(on);
    if (!on || typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    try {
      const result = await Notification.requestPermission();
      if (result !== "granted") setNotifyOptIn(false);
    } catch {
      setNotifyOptIn(false);
    }
  }

  const nextSteps = nextStepsFor(answers);

  return (
    <main className={styles.view}>
      <div className={styles.shell}>
        <header className={styles.topBar}>
          <span className={styles.brand}>
            <Icon name="sparkles" size={16} />
            Learnora
          </span>
          {step !== "done" && (
            <button type="button" className={styles.skipBtn} onClick={skip}>
              Skip setup
            </button>
          )}
        </header>

        {questionIndex >= 0 && (
          <div className={styles.progress}>
            <ol className={styles.dots}>
              {QUESTION_STEPS.map((id, i) => (
                <li
                  key={id}
                  className={`${styles.dot} ${i <= questionIndex ? styles.dotDone : ""}`}
                />
              ))}
            </ol>
            <p className={styles.progressLabel}>
              Step {questionIndex + 1} of {QUESTION_STEPS.length}
            </p>
          </div>
        )}

        {/* Keyed so each step animates in rather than swapping in place. */}
        <div key={step} className={styles.step}>
          {step === "hello" && (
            <section className={styles.hello}>
              <span className={styles.helloMark} aria-hidden="true">
                <Icon name="sparkles" size={26} />
              </span>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                {firstName ? `Welcome, ${firstName}.` : "Welcome to Learnora."}
              </h1>
              <p className={styles.lede}>
                There's a lot in here — a planner, a tutor, flashcards, mock
                exams, study rooms. You don't need all of it.
              </p>
              <p className={styles.lede}>
                Five quick questions and we'll set the app up around what you
                actually came for. Everything you pick can be changed later in
                Settings.
              </p>
              <div className={styles.helloActions}>
                <Button variant="primary" onClick={goNext}>
                  Let's set it up
                  <Icon
                    name="chevron-down"
                    size={16}
                    className={styles.arrow}
                  />
                </Button>
              </div>
              <p className={styles.helloMeta}>Takes about a minute.</p>
            </section>
          )}

          {step === "goal" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                What are you studying for?
              </h1>
              <p className={styles.sub}>
                This sets the tone of everything Learnora writes for you.
              </p>
              <div className={styles.optionGrid}>
                {STUDY_GOALS.map((goal) => (
                  <OptionCard
                    key={goal.id}
                    icon={goal.icon}
                    label={goal.label}
                    hint={goal.hint}
                    selected={answers.goal === goal.id}
                    onClick={() =>
                      patch({
                        goal: goal.id,
                        /* Switching to a goal with no boards clears a board
                           picked under the previous answer, so the summary and
                           the planner can't claim they're sitting an exam they
                           just told us they aren't. */
                        ...(GOALS_WITH_BOARDS.includes(goal.id)
                          ? {}
                          : { examType: null }),
                      })
                    }
                  />
                ))}
              </div>

              {answers.goal && GOALS_WITH_BOARDS.includes(answers.goal) && (
                <fieldset className={styles.inlineChoice}>
                  <legend className={styles.inlineLegend}>
                    Which one? <span className={styles.optional}>optional</span>
                  </legend>
                  <div className={styles.chipRow}>
                    {EXAM_BOARDS.map((board) => (
                      <button
                        key={board.id}
                        type="button"
                        className={`${styles.chip} ${answers.examType === board.id ? styles.chipOn : ""}`}
                        aria-pressed={answers.examType === board.id}
                        onClick={() =>
                          patch({
                            examType:
                              answers.examType === board.id ? null : board.id,
                          })
                        }
                      >
                        {board.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
            </section>
          )}

          {step === "focus" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                What should Learnora help with?
              </h1>
              <p className={styles.sub}>
                Pick everything that applies. Your dashboard is built from this
                — the parts you don't choose stay out of your way until you want
                them.
              </p>
              <div className={styles.optionGrid}>
                {FOCUS_AREAS.map((area) => (
                  <OptionCard
                    key={area.id}
                    icon={area.icon}
                    label={area.label}
                    hint={area.hint}
                    selected={answers.focusAreas.includes(area.id)}
                    multi
                    onClick={() => toggleFocus(area.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {step === "coach" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                How should your AI talk to you?
              </h1>
              <p className={styles.sub}>
                Learnora's tutor sits behind every explanation, quiz and note.
                Pick a voice you'd actually want to hear from at 11pm.
              </p>
              <div className={styles.optionGrid}>
                {COACH_STYLES.map((style) => (
                  <OptionCard
                    key={style.id}
                    icon={style.icon}
                    label={style.label}
                    hint={style.hint}
                    sample={style.sample}
                    selected={answers.coachStyle === style.id}
                    onClick={() => patch({ coachStyle: style.id })}
                  />
                ))}
              </div>
              <fieldset className={styles.inlineChoice}>
                <legend className={styles.inlineLegend}>
                  And how much detail?
                </legend>
                <div className={styles.chipRow}>
                  {AI_LENGTH_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.chip} ${answers.detail === option.value ? styles.chipOn : ""}`}
                      aria-pressed={answers.detail === option.value}
                      onClick={() => patch({ detail: option.value })}
                    >
                      {DETAIL_LABELS[option.value]}
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>
          )}

          {step === "rhythm" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                When do you actually study?
              </h1>
              <p className={styles.sub}>
                Learnora schedules your work into the hours your brain is awake,
                not the hours a template says it should be.
              </p>
              <div className={styles.optionRow}>
                {STUDY_TIMES.map((time) => (
                  <OptionCard
                    key={time.id}
                    icon={time.icon}
                    label={time.label}
                    hint={time.hint}
                    selected={answers.studyTime === time.id}
                    onClick={() => patch({ studyTime: time.id })}
                  />
                ))}
              </div>
              <fieldset className={styles.inlineChoice}>
                <legend className={styles.inlineLegend}>
                  On a normal weekday, how much study is realistic?
                </legend>
                <div className={styles.chipRow}>
                  {CAPACITY_CHOICES.map((choice) => (
                    <button
                      key={choice.mins}
                      type="button"
                      className={`${styles.chip} ${styles.chipWide} ${answers.weekdayCapacityMins === choice.mins ? styles.chipOn : ""}`}
                      aria-pressed={answers.weekdayCapacityMins === choice.mins}
                      onClick={() =>
                        patch({ weekdayCapacityMins: choice.mins })
                      }
                    >
                      <span className={styles.chipLabel}>{choice.label}</span>
                      <span className={styles.chipHint}>{choice.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <p className={styles.footnote}>
                Rough is fine. My week lets you refine this against your real
                lectures and shifts whenever you like.
              </p>
            </section>
          )}

          {step === "subject" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                What's the first thing you're working on?
              </h1>
              <p className={styles.sub}>
                One subject is enough to get started — it gives your notes,
                flashcards and quizzes somewhere to live. You can skip this and
                add it later.
              </p>
              <Card
                variant="elevated"
                radius="lg"
                padding="lg"
                className={styles.formCard}
              >
                <div className={styles.fieldPair}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Subject</span>
                    <input
                      className={styles.input}
                      value={subjectName}
                      onChange={(e) => setSubjectName(e.target.value)}
                      placeholder="Organic Chemistry"
                      autoComplete="off"
                    />
                  </label>
                  {/* Free text rather than a picker: IB marks out of 7, GCSE
                      9-1, most US schools use letters. A dropdown here would
                      have to guess which, and be wrong for most people. */}
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      Target grade{" "}
                      <span className={styles.optional}>optional</span>
                    </span>
                    <input
                      className={styles.input}
                      value={answers.targetGrade ?? ""}
                      onChange={(e) =>
                        patch({ targetGrade: e.target.value || null })
                      }
                      placeholder="7"
                      maxLength={20}
                      autoComplete="off"
                    />
                  </label>
                </div>
                <div className={styles.fieldPair}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      Next exam{" "}
                      <span className={styles.optional}>optional</span>
                    </span>
                    <input
                      className={styles.input}
                      value={examName}
                      onChange={(e) => setExamName(e.target.value)}
                      placeholder="Paper 2"
                      autoComplete="off"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Date</span>
                    <input
                      className={styles.input}
                      type="date"
                      value={examDate}
                      onChange={(e) => setExamDate(e.target.value)}
                    />
                  </label>
                </div>
                {examName.trim() && !examDate && (
                  <p className={styles.fieldNote}>
                    Add a date and this exam gets a countdown on your dashboard.
                  </p>
                )}
              </Card>
            </section>
          )}

          {step === "done" && (
            <section className={styles.done}>
              <span className={styles.doneMark} aria-hidden="true">
                <Icon name="check" size={26} />
              </span>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                You're set up.
              </h1>
              <p className={styles.lede}>
                Here's what changed — all of it editable later, none of it
                permanent.
              </p>

              <Card
                as="section"
                variant="elevated"
                radius="lg"
                padding="lg"
                className={styles.recap}
              >
                <h2 className={styles.recapTitle}>What we set up for you</h2>
                <ul className={styles.recapList}>
                  {goalSummary(answers) && (
                    <RecapRow
                      icon="compass"
                      text={`Tuned for ${goalSummary(answers)!.toLowerCase()}`}
                      where="Settings ▸ Preferences"
                    />
                  )}
                  <RecapRow
                    icon="bot"
                    text={`Your AI answers as a ${COACH_STYLES.find((c) => c.id === answers.coachStyle)?.label.toLowerCase()}, ${DETAIL_RECAP[answers.detail]}`}
                    where="Settings ▸ Preferences"
                  />
                  {answers.focusAreas.length > 0 && (
                    <RecapRow
                      icon="layout"
                      text={`Dashboard trimmed to the ${answers.focusAreas.length} area${answers.focusAreas.length === 1 ? "" : "s"} you picked`}
                      where="Dashboard ▸ Customize"
                    />
                  )}
                  {(answers.studyTime || answers.weekdayCapacityMins) && (
                    <RecapRow
                      icon="calendar-week"
                      text={
                        answers.weekdayCapacityMins
                          ? `Scheduling around a ${formatMins(answers.weekdayCapacityMins)} weekday`
                          : "Scheduling around when you're sharpest"
                      }
                      where="My week"
                    />
                  )}
                  {createdSubject && (
                    <RecapRow
                      icon="folder"
                      text={`Created your first subject, ${createdSubject}`}
                      where="Library"
                    />
                  )}
                </ul>
              </Card>

              {nextSteps.length > 0 && (
                <section
                  className={styles.nextSteps}
                  aria-label="Where to start"
                >
                  <h2 className={styles.recapTitle}>Where to start</h2>
                  <div className={styles.nextGrid}>
                    {nextSteps.map((next) => (
                      <Card
                        key={next.id}
                        variant="panel"
                        radius="lg"
                        padding="lg"
                        className={styles.nextCard}
                      >
                        <span className={styles.nextIcon} aria-hidden="true">
                          <Icon name={next.icon} size={18} />
                        </span>
                        <h3 className={styles.nextTitle}>{next.label}</h3>
                        <p className={styles.nextBlurb}>{next.blurb}</p>
                        <button
                          type="button"
                          className={styles.nextCta}
                          onClick={() => navigate(next.to)}
                        >
                          {next.cta}
                          <Icon
                            name="chevron-down"
                            size={14}
                            className={styles.arrow}
                          />
                        </button>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {typeof Notification !== "undefined" &&
                Notification.permission === "default" && (
                  <Card
                    variant="subtle"
                    radius="lg"
                    padding="lg"
                    className={styles.notifyCard}
                  >
                    <span className={styles.nextIcon} aria-hidden="true">
                      <Icon name="bell" size={18} />
                    </span>
                    <div className={styles.notifyText}>
                      <h3
                        className={styles.nextTitle}
                        id="welcome-notify-label"
                      >
                        Nudge me when something's due
                      </h3>
                      <p className={styles.nextBlurb}>
                        Browser reminders for exams, study blocks and flashcards
                        that are ready. Off by default, and switchable in
                        Settings ▸ Notifications.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={notifyOptIn}
                      onChange={(on) => void handleNotifyToggle(on)}
                      labelledBy="welcome-notify-label"
                    />
                  </Card>
                )}

              <div className={styles.doneActions}>
                <Button
                  variant="primary"
                  onClick={() => navigate("/", { replace: true })}
                >
                  Take me to my dashboard
                  <Icon
                    name="chevron-down"
                    size={16}
                    className={styles.arrow}
                  />
                </Button>
              </div>
            </section>
          )}
        </div>

        {step !== "hello" && step !== "done" && (
          <footer className={styles.footer}>
            <Button variant="ghost" onClick={goBack}>
              <Icon
                name="chevron-down"
                size={16}
                className={styles.arrowBack}
              />
              Back
            </Button>
            <Button
              variant="primary"
              onClick={goNext}
              disabled={!canContinue || committing}
            >
              {step === "subject"
                ? committing
                  ? "Setting things up…"
                  : subjectName.trim()
                    ? "Create it and finish"
                    : "Finish without one"
                : "Continue"}
              {!committing && (
                <Icon name="chevron-down" size={16} className={styles.arrow} />
              )}
            </Button>
          </footer>
        )}
      </div>
    </main>
  );
}

/* The chip labels on the question. Phrased as the answer to "how much
   detail?", so they read as choices rather than as settings values. */
const DETAIL_LABELS: Record<OnboardingAnswers["detail"], string> = {
  short: "Straight to the point",
  medium: "Balanced",
  detailed: "Explain it fully",
};

/* The same three answers on the summary, where they have to finish the
   sentence "Your AI answers as a patient tutor, …". */
const DETAIL_RECAP: Record<OnboardingAnswers["detail"], string> = {
  short: "keeping it brief",
  medium: "at a balanced length",
  detailed: "explaining in full",
};

function formatMins(mins: number): string {
  if (mins < 60) return `${mins} minute`;
  const hours = mins / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour`;
}

interface OptionCardProps {
  icon: IconName;
  label: string;
  hint: string;
  sample?: string;
  selected: boolean;
  multi?: boolean;
  onClick: () => void;
}

/* One tappable answer. `multi` swaps the a11y contract rather than just the
   tick: a multi-select answer is a toggle (aria-pressed), a single-select one
   is a radio-ish choice within its group. */
function OptionCard({
  icon,
  label,
  hint,
  sample,
  selected,
  multi,
  onClick,
}: OptionCardProps) {
  return (
    <button
      type="button"
      className={`${styles.option} ${selected ? styles.optionOn : ""}`}
      aria-pressed={multi ? selected : undefined}
      aria-current={!multi && selected ? "true" : undefined}
      onClick={onClick}
    >
      <span className={styles.optionIcon} aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className={styles.optionBody}>
        <span className={styles.optionLabel}>{label}</span>
        <span className={styles.optionHint}>{hint}</span>
        {sample && <span className={styles.optionSample}>“{sample}”</span>}
      </span>
      <span
        className={`${styles.tick} ${selected ? styles.tickOn : ""}`}
        aria-hidden="true"
      >
        {selected && <Icon name="check" size={13} />}
      </span>
    </button>
  );
}

function RecapRow({
  icon,
  text,
  where,
}: {
  icon: IconName;
  text: string;
  where: string;
}) {
  return (
    <li className={styles.recapRow}>
      <span className={styles.recapIcon} aria-hidden="true">
        <Icon name={icon} size={15} />
      </span>
      <span className={styles.recapText}>{text}</span>
      <span className={styles.recapWhere}>{where}</span>
    </li>
  );
}
