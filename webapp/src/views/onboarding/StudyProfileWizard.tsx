import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { BrandLogo } from "../../components/BrandLogo";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useLifeContext } from "../../hooks/useLifeContext";
import { useSaveExam } from "../../hooks/useExams";
import { draftOutline, studyProfileApi } from "../../api/studyProfile";
import { localDateStr } from "../../lib/date";
import {
  CHRONOTYPES,
  WEEK_ORDER,
  WEEKDAY_SHORT,
  formatClock,
  formatDuration,
  type Weekday,
} from "../../lib/lifeContext";
import { normaliseTopicKey } from "../../lib/topicKey";
import {
  COUNTRY_CODES,
  EMPTY_PROFILE,
  OTHER_SYSTEM,
  PROFILE_STEPS as STEPS,
  resumeStep,
  type ProfileStep as StepId,
  buildFirstPlan,
  canBuildPlan,
  countryFromLocale,
  countryName,
  examCountdown,
  equalWeights,
  examSystemsFor,
  isUnderAge,
  specFor,
  supportedBoards,
  toLifeContext,
  type AgeBand,
  type Confidence,
  type OutlineTopic,
  type SessionLength,
  type StudyProfile,
} from "../../lib/studyProfile";
import styles from "./welcome.module.css";

/* /setup/profile: the study profile, for any country, board and subject.
 *
 * Reached from the first run's last screen, after the student has already
 * had a lesson, so it never stands between a new account and its first
 * win. Every answer saves as it is given and the wizard resumes at the first
 * unanswered step. Five answers build the plan; "go deeper" is optional. */


const STEP_NAMES: Record<StepId, string> = {
  age: "age",
  country: "country",
  system: "exams",
  subjects: "subjects",
  week: "time",
  habits: "best times",
  goals: "confidence and goals",
  deeper: "go deeper",
  plan: "your plan",
};

const AGE_BANDS: { id: AgeBand; label: string }[] = [
  { id: "under13", label: "Under 13" },
  { id: "13-15", label: "13–15" },
  { id: "16-17", label: "16–17" },
  { id: "18+", label: "18 or over" },
];
const MINUTES = [30, 60, 90, 120, 180];
const SESSIONS: { id: SessionLength; label: string; hint: string }[] = [
  { id: "short", label: "10–15 min", hint: "Short bursts" },
  { id: "medium", label: "20–30 min", hint: "A focused block" },
  { id: "long", label: "30–90 min", hint: "Long, deep sessions" },
];
const CONFIDENCE: { id: Confidence; label: string }[] = [
  { id: 1, label: "Not confident" },
  { id: 2, label: "Getting there" },
  { id: 3, label: "Confident" },
];
const DEVICES = ["Phone", "Laptop", "Tablet", "Shared computer"];
const METHODS = ["Re-reading notes", "Flashcards", "Past papers", "Practice questions", "Videos", "Making notes"];
const STYLES = ["Worked examples", "Diagrams", "Talking it through", "Practice first"];

function Chip({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${hint ? styles.chipWide : ""} ${on ? styles.chipOn : ""}`}
      aria-pressed={on}
      onClick={onClick}
    >
      <span className={styles.chipLabel}>{label}</span>
      {hint ? <span className={styles.chipHint}>{hint}</span> : null}
    </button>
  );
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function StudyProfileWizard() {
  const navigate = useNavigate();
  const { context, save: saveLife } = useLifeContext();
  const saveExam = useSaveExam();
  const [profile, setProfile] = useState<StudyProfile | null>(null);
  const [step, setStep] = useState<StepId>("age");
  const [newSubject, setNewSubject] = useState("");
  const [outlines, setOutlines] = useState<Record<string, OutlineTopic[]>>({});
  /* What is in each topic box as typed. Rebuilt from the cleaned list on
     every keystroke, a trailing new line vanished and Enter did nothing. */
  const [outlineText, setOutlineText] = useState<Record<string, string>>({});
  const [drafting, setDrafting] = useState<Record<string, "loading" | "error">>({});
  const [saving, setSaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = localDateStr();

  useEffect(() => {
    let live = true;
    void Promise.all([
      studyProfileApi.load().catch(() => EMPTY_PROFILE),
      studyProfileApi.fetchOutlines().catch(() => ({})),
    ]).then(([p, o]) => {
      if (!live) return;
      /* A starting guess for the country step, from the browser. Not saved
         until they answer something, and changeable like any answer. */
      const guess = p.country ? null : countryFromLocale(navigator.language);
      setProfile(guess ? { ...p, country: guess } : p);
      setOutlines(o);
      setStep(resumeStep(p));
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  /* Saved as answered. An under-13 answer is not saved anywhere: Learnora
     isn't for them, and the least data is none. */
  const patch = useCallback((change: Partial<StudyProfile>) => {
    setProfile((prev) => {
      const next = { ...(prev ?? EMPTY_PROFILE), ...change };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (!isUnderAge(next)) {
        saveTimer.current = setTimeout(() => void studyProfileApi.save(next), 400);
      }
      return next;
    });
  }, []);

  const p = profile ?? EMPTY_PROFILE;
  const index = STEPS.indexOf(step);
  const reachable = Math.max(index, STEPS.indexOf(resumeStep(p)));
  const systems = useMemo(() => examSystemsFor(p.country), [p.country]);
  const boards = useMemo(() => supportedBoards(p.system), [p.system]);
  const seededSubjects = boards.find((b) => b.board === p.board)?.subjects ?? [];
  const countries = useMemo(
    () => COUNTRY_CODES.map((c) => ({ code: c, name: countryName(c) })).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const unseeded = p.subjects.filter((s) => !s.specId);
  const plan = useMemo(
    () => (step === "plan" && canBuildPlan(p) ? buildFirstPlan(p, outlines, today) : null),
    [outlines, p, step, today],
  );

  const draft = useCallback(
    async (subject: string) => {
      const key = normaliseTopicKey(subject);
      setDrafting((d) => ({ ...d, [key]: "loading" }));
      try {
        const topics = await draftOutline(p, subject);
        setOutlines((o) => ({ ...o, [key]: topics }));
        void studyProfileApi.saveOutline(subject, topics, "ai_draft", { level: p.level, board: p.board });
        setDrafting(({ [key]: _done, ...rest }) => rest);
      } catch {
        setDrafting((d) => ({ ...d, [key]: "error" }));
      }
    },
    [p],
  );

  /* Draft outlines once, on reaching the plan, for subjects without one. */
  const drafted = useRef(false);
  useEffect(() => {
    if (step !== "plan" || drafted.current) return;
    drafted.current = true;
    for (const s of unseeded) {
      if (!outlines[normaliseTopicKey(s.name)]) void draft(s.name);
    }
  }, [draft, outlines, step, unseeded]);

  const canContinue = (() => {
    switch (step) {
      case "age":
        return !!p.ageBand && !isUnderAge(p);
      case "country":
        return !!p.country;
      case "system":
        return !!p.system && (p.system !== OTHER_SYSTEM || !!p.board?.trim());
      case "subjects":
        return p.subjects.length > 0;
      case "week":
        return p.weekdayMins !== null && p.weekendMins !== null;
      case "habits":
        return !!p.bestTime && !!p.sessionLength;
      case "goals":
        return p.subjects.every((s) => s.confidence !== null) && !!p.target?.trim();
      default:
        return true;
    }
  })();

  const addSubject = (name: string) => {
    const clean = name.trim().slice(0, 80);
    if (!clean || p.subjects.some((s) => s.name.toLowerCase() === clean.toLowerCase())) return;
    const spec = specFor(p.system, p.board, clean);
    patch({ subjects: [...p.subjects, { name: clean, specId: spec?.id ?? null, examDate: null, confidence: null }] });
    setNewSubject("");
  };

  const finish = async () => {
    if (!plan || saving) return;
    setSaving(true);
    saveLife(toLifeContext(p, context));
    await Promise.allSettled(
      p.subjects
        .filter((s) => s.examDate && s.examDate >= today)
        .map((s) =>
          saveExam.mutateAsync({
            payload: {
              exam_name: s.name,
              exam_date: s.examDate!,
              difficulty: s.confidence === 1 ? "Hard" : s.confidence === 3 ? "Easy" : "Medium",
              status: "Scheduled",
              ...(s.specId ? { syllabus_id: s.specId } : {}),
            },
          }),
        ),
    );
    await studyProfileApi.save(p);
    navigate("/plan");
  };

  if (!profile) {
    return (
      <main className={styles.view}>
        <div className={styles.shell}>
          <p className={styles.sub}>Loading your answers…</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.view}>
      <div className={styles.shell}>
        <header className={styles.topBar}>
          <span className={styles.brand}>
            <BrandLogo size="small" />
          </span>
          <button type="button" className={styles.skipBtn} onClick={() => navigate("/")}>
            Finish later
          </button>
        </header>

        <div className={styles.progress}>
          <ol className={styles.dots}>
            {/* Any step up to the furthest one answered can be jumped to, so
                someone back from Settings to change one answer doesn't page
                back through all of them. */}
            {STEPS.map((id, i) => (
              <li key={id} className={`${styles.dot} ${i <= index ? styles.dotDone : ""}`}>
                {i <= reachable && i !== index ? (
                  <button
                    type="button"
                    className={styles.dotJump}
                    aria-label={`Go to step ${i + 1}: ${STEP_NAMES[id]}`}
                    onClick={() => setStep(id)}
                  />
                ) : null}
              </li>
            ))}
          </ol>
          <p className={styles.progressLabel}>
            Step {index + 1} of {STEPS.length} · saved as you go
          </p>
        </div>

        <div key={step} className={styles.step}>
          {step === "age" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                How old are you?
              </h1>
              <p className={styles.sub}>
                Only an age range, to keep things suitable. We never ask for your birthday, and it is
                never sent to an AI.
              </p>
              <div className={styles.chipRow}>
                {AGE_BANDS.map((a) => (
                  <Chip key={a.id} on={p.ageBand === a.id} label={a.label} onClick={() => patch({ ageBand: a.id })} />
                ))}
              </div>
              {isUnderAge(p) ? (
                <p className={styles.footnote} role="status">
                  Learnora is for students aged 13 and over, so we can't set up a plan for you. A parent,
                  carer or teacher can help you find a tool made for your age. Nothing you entered here was
                  saved.
                </p>
              ) : null}
            </section>
          )}

          {step === "country" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                Where do you study?
              </h1>
              <p className={styles.sub}>So we can show the exams students sit there.</p>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Country</span>
                <select
                  className={styles.input}
                  value={p.country ?? ""}
                  onChange={(e) => patch({ country: e.target.value || null, system: null, board: null })}
                >
                  <option value="">Choose your country</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}

          {step === "system" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                Which exams are you working towards?
              </h1>
              <div className={styles.chipRow}>
                {systems.map((s) => (
                  <Chip
                    key={s.id}
                    on={p.system === s.id}
                    label={s.label}
                    hint={supportedBoards(s.id).length ? "Syllabus built in" : undefined}
                    onClick={() => patch({ system: s.id, board: null })}
                  />
                ))}
                <Chip
                  on={p.system === OTHER_SYSTEM}
                  label="My board isn't listed"
                  onClick={() => patch({ system: OTHER_SYSTEM, board: null })}
                />
              </div>
              {boards.length > 0 ? (
                <fieldset className={styles.inlineChoice}>
                  <legend className={styles.inlineLegend}>Exam board</legend>
                  <div className={styles.chipRow}>
                    {boards.map((b) => (
                      <Chip
                        key={b.board}
                        on={p.board === b.board}
                        label={b.board}
                        hint={`Supported: ${b.subjects.join(", ")}`}
                        onClick={() => patch({ board: b.board })}
                      />
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {p.system && (p.system === OTHER_SYSTEM || boards.length === 0 || (p.board && !boards.some((b) => b.board === p.board)) || p.board === null) ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {p.system === OTHER_SYSTEM ? "Your exam or board" : "Your board, if it isn't above"}
                    {p.system !== OTHER_SYSTEM ? <span className={styles.optional}> optional</span> : null}
                  </span>
                  <input
                    className={styles.input}
                    maxLength={80}
                    placeholder="e.g. WAEC, Abitur, HKDSE, Leaving Cert"
                    value={boards.some((b) => b.board === p.board) ? "" : (p.board ?? "")}
                    onChange={(e) => patch({ board: e.target.value || null })}
                  />
                  <span className={styles.fieldNote}>
                    Learnora doesn't have this syllabus built in yet. It will still plan for you, using a draft
                    topic list you can edit, marked as unverified.
                  </span>
                </label>
              ) : null}
            </section>
          )}

          {step === "subjects" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                Your subjects and exam dates
              </h1>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Year, grade or level</span>
                <input
                  className={styles.input}
                  maxLength={60}
                  placeholder="e.g. Year 11, Grade 12, SS3"
                  value={p.level ?? ""}
                  onChange={(e) => patch({ level: e.target.value || null })}
                />
              </label>
              {seededSubjects.length > 0 ? (
                <div className={styles.chipRow}>
                  {seededSubjects.map((s) => (
                    <Chip
                      key={s}
                      on={p.subjects.some((x) => x.name === s)}
                      label={s}
                      hint="Supported"
                      onClick={() =>
                        p.subjects.some((x) => x.name === s)
                          ? patch({ subjects: p.subjects.filter((x) => x.name !== s) })
                          : addSubject(s)
                      }
                    />
                  ))}
                </div>
              ) : null}
              <form
                className={styles.fieldPair}
                onSubmit={(e) => {
                  e.preventDefault();
                  addSubject(newSubject);
                }}
              >
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Add a subject</span>
                  <input
                    className={styles.input}
                    maxLength={80}
                    placeholder="Any subject, in your words"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                  />
                </label>
                <Button type="submit" variant="secondary" disabled={!newSubject.trim()}>
                  Add
                </Button>
              </form>
              {p.subjects.length > 0 ? (
                <Card variant="elevated" radius="lg" padding="lg" className={styles.formCard}>
                  {p.subjects.map((s, i) => (
                    <div key={s.name} className={styles.fieldPair}>
                      <span className={styles.fieldLabel}>
                        {s.name} {s.specId ? "· supported" : "· generic mode (unverified)"}
                      </span>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Exam date <span className={styles.optional}>optional</span></span>
                        <input
                          type="date"
                          className={styles.input}
                          min={today}
                          value={s.examDate ?? ""}
                          onChange={(e) =>
                            patch({
                              subjects: p.subjects.map((x, j) => (j === i ? { ...x, examDate: e.target.value || null } : x)),
                            })
                          }
                        />
                        {s.examDate ? <span className={styles.fieldNote}>{examCountdown(s.examDate, today)}</span> : null}
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => patch({ subjects: p.subjects.filter((_, j) => j !== i) })}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </Card>
              ) : null}
            </section>
          )}

          {step === "week" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                How much time do you have?
              </h1>
              <fieldset className={styles.inlineChoice}>
                <legend className={styles.inlineLegend}>On a school or work day</legend>
                <div className={styles.chipRow}>
                  {MINUTES.map((m) => (
                    <Chip key={m} on={p.weekdayMins === m} label={`${m} min`} onClick={() => patch({ weekdayMins: m })} />
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.inlineChoice}>
                <legend className={styles.inlineLegend}>On a day off</legend>
                <div className={styles.chipRow}>
                  {MINUTES.map((m) => (
                    <Chip key={m} on={p.weekendMins === m} label={`${m} min`} onClick={() => patch({ weekendMins: m })} />
                  ))}
                </div>
              </fieldset>
              <div className={styles.fieldPair}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>School or work from <span className={styles.optional}>optional</span></span>
                  <input type="time" className={styles.input} value={p.busyFrom ?? ""} onChange={(e) => patch({ busyFrom: e.target.value || null })} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>until</span>
                  <input type="time" className={styles.input} value={p.busyUntil ?? ""} onChange={(e) => patch({ busyUntil: e.target.value || null })} />
                </label>
              </div>
              <fieldset className={styles.inlineChoice}>
                <legend className={styles.inlineLegend}>Days to keep free <span className={styles.optional}>optional</span></legend>
                <div className={styles.chipRow}>
                  {WEEK_ORDER.map((d: Weekday) => (
                    <Chip
                      key={d}
                      on={p.protectedDays.includes(d)}
                      label={WEEKDAY_SHORT[d]}
                      onClick={() => patch({ protectedDays: toggle(p.protectedDays, d) })}
                    />
                  ))}
                </div>
              </fieldset>
            </section>
          )}

          {step === "habits" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                When and how long do you work best?
              </h1>
              <div className={styles.chipRow}>
                {CHRONOTYPES.map((c) => (
                  <Chip key={c.value} on={p.bestTime === c.value} label={c.label} hint={c.hint} onClick={() => patch({ bestTime: c.value })} />
                ))}
              </div>
              <fieldset className={styles.inlineChoice}>
                <legend className={styles.inlineLegend}>A good study session is</legend>
                <div className={styles.chipRow}>
                  {SESSIONS.map((s) => (
                    <Chip key={s.id} on={p.sessionLength === s.id} label={s.label} hint={s.hint} onClick={() => patch({ sessionLength: s.id })} />
                  ))}
                </div>
              </fieldset>
            </section>
          )}

          {step === "goals" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                How do you feel about each subject?
              </h1>
              {p.subjects.map((s, i) => (
                <fieldset key={s.name} className={styles.inlineChoice}>
                  <legend className={styles.inlineLegend}>{s.name}</legend>
                  <div className={styles.chipRow}>
                    {CONFIDENCE.map((c) => (
                      <Chip
                        key={c.id}
                        on={s.confidence === c.id}
                        label={c.label}
                        onClick={() =>
                          patch({ subjects: p.subjects.map((x, j) => (j === i ? { ...x, confidence: c.id } : x)) })
                        }
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
              <label className={styles.field}>
                <span className={styles.fieldLabel}>What are you aiming for?</span>
                <input
                  className={styles.input}
                  maxLength={120}
                  placeholder="e.g. A 7 in Maths, pass all my finals"
                  value={p.target ?? ""}
                  onChange={(e) => patch({ target: e.target.value || null })}
                />
              </label>
            </section>
          )}

          {step === "deeper" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                Go deeper <span className={styles.optional}>optional</span>
              </h1>
              <p className={styles.sub}>Helps us tune your plan. Skip any of it.</p>
              <fieldset className={styles.inlineChoice}>
                <legend className={styles.inlineLegend}>What you study on</legend>
                <div className={styles.chipRow}>
                  {DEVICES.map((d) => (
                    <Chip key={d} on={p.devices.includes(d)} label={d} onClick={() => patch({ devices: toggle(p.devices, d) })} />
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.inlineChoice}>
                <legend className={styles.inlineLegend}>How you study now</legend>
                <div className={styles.chipRow}>
                  {METHODS.map((m) => (
                    <Chip key={m} on={p.methods.includes(m)} label={m} onClick={() => patch({ methods: toggle(p.methods, m) })} />
                  ))}
                </div>
              </fieldset>
              <fieldset className={styles.inlineChoice}>
                <legend className={styles.inlineLegend}>What helps you learn</legend>
                <div className={styles.chipRow}>
                  {STYLES.map((s) => (
                    <Chip key={s} on={p.learningStyle === s} label={s} onClick={() => patch({ learningStyle: p.learningStyle === s ? null : s })} />
                  ))}
                </div>
              </fieldset>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>What has gone wrong before?</span>
                <textarea
                  className={styles.input}
                  maxLength={400}
                  rows={3}
                  placeholder="e.g. I leave revision too late"
                  value={p.pastProblems ?? ""}
                  onChange={(e) => patch({ pastProblems: e.target.value || null })}
                />
                <span className={styles.fieldNote}>Please don't include names or personal details. This stays on your account and isn't sent to an AI.</span>
              </label>
            </section>
          )}

          {step === "plan" && (
            <section className={styles.question}>
              <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
                Your first week
              </h1>
              {unseeded.map((s) => {
                const key = normaliseTopicKey(s.name);
                const topics = outlines[key];
                return (
                  <Card key={key} variant="elevated" radius="lg" padding="lg" className={styles.formCard}>
                    <p className={styles.fieldLabel}>
                      {s.name} topics · draft, unverified · equal weights
                    </p>
                    {drafting[key] === "loading" ? <p className={styles.fieldNote}>Drafting a topic list…</p> : null}
                    {drafting[key] === "error" ? (
                      <p className={styles.fieldNote} role="status">
                        Couldn't draft topics right now. <Button size="sm" variant="secondary" onClick={() => void draft(s.name)}>Try again</Button> or type your own below.
                      </p>
                    ) : null}
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>One topic per line</span>
                      <textarea
                        className={styles.input}
                        rows={5}
                        value={outlineText[key] ?? (topics ?? []).map((t) => t.title).join("\n")}
                        onChange={(e) => {
                          const text = e.target.value;
                          setOutlineText((t) => ({ ...t, [key]: text }));
                          const topics = equalWeights(text.split("\n"));
                          setOutlines((o) => ({ ...o, [key]: topics }));
                          /* Saved as typed, like every other answer. */
                          if (outlineTimer.current) clearTimeout(outlineTimer.current);
                          outlineTimer.current = setTimeout(
                            () =>
                              void studyProfileApi.saveOutline(s.name, topics, "student", {
                                level: p.level,
                                board: p.board,
                              }),
                            500,
                          );
                        }}
                      />
                    </label>
                  </Card>
                );
              })}
              {plan ? (
                <>
                  {plan.blocks.length > 0 ? (
                    <p className={styles.sub}>
                      {plan.blocks.length} session{plan.blocks.length === 1 ? "" : "s"},{" "}
                      {formatDuration(plan.blocks.reduce((n, b) => n + b.endMin - b.startMin, 0))} over the next
                      seven days. Each one says why it is there.
                    </p>
                  ) : null}
                  {plan.blocks.length === 0 ? (
                    <p className={styles.sub}>No free time fits a session this week. Try more minutes or fewer fixed hours.</p>
                  ) : (
                    <ol className={styles.recapList} aria-label="Plan for the next seven days">
                      {plan.blocks.slice(0, 14).map((b) => (
                        <li key={b.id} className={styles.recapRow}>
                          <span className={styles.recapText}>
                            <strong>
                              {new Date(`${b.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}{" "}
                              {formatClock(b.startMin)}–{formatClock(b.endMin)} · {b.label}
                            </strong>
                            <br />
                            {b.reason}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {plan.unplacedMins > 0 ? (
                    <p className={styles.footnote}>About {plan.unplacedMins} minutes didn't fit in the time you gave. You can change your hours on the Plan page.</p>
                  ) : null}
                </>
              ) : (
                <p className={styles.sub}>A few answers are still missing before we can build your plan.</p>
              )}
            </section>
          )}
        </div>

        <footer className={styles.footer}>
          <Button variant="ghost" onClick={() => setStep(STEPS[Math.max(0, index - 1)])} disabled={index === 0}>
            Back
          </Button>
          {step === "deeper" ? (
            <Button
              variant="secondary"
              onClick={() => {
                patch({ deeperSkipped: true });
                setStep("plan");
              }}
            >
              Skip for now
            </Button>
          ) : null}
          {step === "plan" ? (
            <Button variant="primary" onClick={() => void finish()} disabled={!plan || saving}>
              {saving ? "Saving…" : "Save and open my plan"}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setStep(STEPS[index + 1])} disabled={!canContinue}>
              Continue
            </Button>
          )}
        </footer>
      </div>
    </main>
  );
}
