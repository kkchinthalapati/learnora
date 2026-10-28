import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/PageHeader";
import { SectionHeader } from "../../components/SectionHeader";
import { Skeleton } from "../../components/Skeleton";
import { AiError } from "../../api/ai";
import { markAnswerPhoto } from "../../api/aiMarkAnswer";
import { useSettings } from "../../context/settings";
import { useFolders } from "../../hooks/useFolders";
import { useRecordMisconceptions } from "../../hooks/useMisconceptions";
import {
  candidatesFromMarking,
  parseMarkScheme,
  schemeTotal,
  type Marking,
} from "../../lib/photoMarking";
import { useDocumentTitle } from "../../lib/routeTitle";
import { prepareStudyImage, STUDY_IMAGE_ACCEPT, StudyImageError } from "../../lib/studyImage";
import styles from "./mark.module.css";

/* /mark — "Mark my answer" (lib/photoMarking.ts). A photo of a handwritten
 * answer, marked against the mark scheme the student pastes in from the
 * paper they're practising. The score is counted by the app from the
 * scheme's points; a point counts only with the student's own words quoted.
 * Wrong beliefs the answer states go to the ledger; missed points don't. */

/** Largest photo sent after scaling; the edge function's own ceiling is
 *  higher, and a phone photo scaled to 2048px is well under this. */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

type Phase =
  | { kind: "idle" }
  | { kind: "marking" }
  | { kind: "error"; message: string }
  | { kind: "done"; marking: Marking; filed: number };

export function MarkAnswerView() {
  useDocumentTitle("Mark my answer");
  const [params] = useSearchParams();
  const { settings } = useSettings();
  const folders = useFolders();
  const record = useRecordMisconceptions();
  const [subject, setSubject] = useState(params.get("subject") ?? "");
  const [question, setQuestion] = useState("");
  const [schemeText, setSchemeText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [nudge, setNudge] = useState("");
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const scheme = useMemo(() => parseMarkScheme(schemeText), [schemeText]);
  const total = schemeTotal(scheme);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => () => abort.current?.abort(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (phase.kind === "marking") return;
    if (!photo) return setNudge("Add a photo of your answer.");
    if (scheme.length === 0) return setNudge("Paste the mark scheme, one point per line.");
    if (!subject.trim()) return setNudge("Say which subject this is.");
    setNudge("");
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPhase({ kind: "marking" });
    try {
      const prepared = await prepareStudyImage(photo, MAX_PHOTO_BYTES);
      const marking = await markAnswerPhoto(prepared.file, scheme, question, subject, settings, controller.signal);
      if (controller.signal.aborted) return;
      const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const candidates = candidatesFromMarking(marking, subject, runId);
      record(candidates);
      setPhase({ kind: "done", marking, filed: candidates.length });
    } catch (err) {
      if (controller.signal.aborted) return;
      setPhase({
        kind: "error",
        message:
          err instanceof StudyImageError || (err instanceof AiError && !err.retryable)
            ? err.message
            : "The marker didn’t answer. That’s on our side, not yours.",
      });
    }
  }

  function another() {
    setPhoto(null);
    setPhase({ kind: "idle" });
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className={styles.page}>
      <PageHeader
        as="h1"
        title="Mark my answer"
        sub="Photograph a written answer and paste the mark scheme. Each point is checked against what you actually wrote."
      />

      {phase.kind === "done" ? (
        <Result marking={phase.marking} filed={phase.filed} onAnother={another} />
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.field}>
            <label htmlFor="mark-photo" className={styles.label}>
              Photo of your answer
            </label>
            <input
              ref={fileInput}
              id="mark-photo"
              type="file"
              accept={STUDY_IMAGE_ACCEPT}
              capture="environment"
              className={styles.file}
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
            {preview ? <img src={preview} alt="Your answer" className={styles.preview} /> : null}
          </div>

          <div className={styles.field}>
            <label htmlFor="mark-scheme" className={styles.label}>
              Mark scheme
            </label>
            <textarea
              id="mark-scheme"
              className={styles.text}
              rows={6}
              value={schemeText}
              placeholder={"One point per line, e.g.\nWater moves by osmosis (1)\nFrom dilute to concentrated solution (1)"}
              onChange={(e) => setSchemeText(e.target.value)}
            />
            <p className={styles.hint} aria-live="polite">
              {scheme.length === 0
                ? "Add (2) at the end of a line for a two-mark point."
                : `${scheme.length} ${scheme.length === 1 ? "point" : "points"}, ${total} ${total === 1 ? "mark" : "marks"}`}
            </p>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="mark-subject" className={styles.label}>
                Subject
              </label>
              <input
                id="mark-subject"
                className={styles.input}
                list="mark-subjects"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <datalist id="mark-subjects">
                {(folders.data ?? []).map((f) => (
                  <option key={f.id} value={f.name} />
                ))}
              </datalist>
            </div>
            <div className={styles.field}>
              <label htmlFor="mark-question" className={styles.label}>
                Question <span className={styles.optional}>(optional)</span>
              </label>
              <input
                id="mark-question"
                className={styles.input}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
          </div>

          {phase.kind === "error" ? (
            <p className={styles.error} role="alert">
              {phase.message}
            </p>
          ) : null}
          <p className={styles.hint} role="status">
            {nudge}
          </p>

          {phase.kind === "marking" ? (
            <div aria-busy="true" className={styles.stack}>
              <Skeleton label="Marking your answer" height={20} width="60%" />
              <Skeleton height={20} width="80%" />
            </div>
          ) : null}

          <Button type="submit" variant="primary" size="lg" busy={phase.kind === "marking"}>
            {phase.kind === "error" ? "Try again" : "Mark it"}
          </Button>
        </form>
      )}
    </div>
  );
}

function Result({ marking, filed, onAnother }: { marking: Marking; filed: number; onAnother: () => void }) {
  if (marking.kind === "unreadable") {
    return (
      <section className={styles.stack} aria-labelledby="mark-result">
        <h2 id="mark-result" className={styles.score}>
          We couldn’t read enough of that to mark it
        </h2>
        {marking.reason ? <p className={styles.textMuted}>{marking.reason}</p> : null}
        <p className={styles.textMuted}>
          No mark is better than a wrong one. Try a sharper photo, flat and in good light.
        </p>
        <Button variant="primary" onClick={onAnother}>
          Try another photo
        </Button>
      </section>
    );
  }
  return (
    <section className={styles.stack} aria-labelledby="mark-result">
      <h2 id="mark-result" className={styles.score}>
        {marking.unchecked > 0 ? "At least " : ""}
        {marking.awarded} of {marking.total} {marking.total === 1 ? "mark" : "marks"}
      </h2>
      {marking.unchecked > 0 ? (
        <p className={styles.textMuted}>
          {marking.unchecked === 1 ? "One point wasn’t checked" : `${marking.unchecked} points weren’t checked`}, so
          this is the lowest it could be.
        </p>
      ) : null}

      <ol className={styles.points} aria-label="Mark scheme points">
        {marking.points.map((p, i) => (
          <li key={i} className={styles.point} data-verdict={p.verdict}>
            <span className={styles.tick} aria-hidden="true">
              {p.verdict === "awarded" ? "✓" : p.verdict === "missed" ? "✗" : "?"}
            </span>
            <div className={styles.pointText}>
              <p className={styles.pointName}>
                {p.point.text}{" "}
                <span className={styles.marks}>
                  ({p.point.marks} {p.point.marks === 1 ? "mark" : "marks"})
                </span>
                <span className={styles.srOnly}>
                  {p.verdict === "awarded" ? ": earned" : p.verdict === "missed" ? ": missed" : ": not checked"}
                </span>
              </p>
              {p.verdict === "awarded" ? (
                <p className={styles.evidence}>You wrote: “{p.evidence}”</p>
              ) : p.verdict === "missed" && p.note ? (
                <p className={styles.textMuted}>{p.note}</p>
              ) : p.verdict === "unchecked" ? (
                <p className={styles.textMuted}>Not checked.</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {marking.beliefs.length > 0 ? (
        <section className={styles.stack} aria-labelledby="mark-beliefs">
          <SectionHeader id="mark-beliefs" title="A mix-up in your answer" />
          <ul className={styles.beliefs}>
            {marking.beliefs.map((b, i) => (
              <li key={i} className={styles.belief}>
                <p className={styles.pointName}>{b.belief}</p>
                <p className={styles.evidence}>You wrote: “{b.quote}”</p>
              </li>
            ))}
          </ul>
          {filed > 0 ? (
            <p className={styles.textMuted}>
              {filed === 1 ? "It’s" : "They’re"} in your mistakes now, so the app can help you fix{" "}
              {filed === 1 ? "it" : "them"}.
            </p>
          ) : null}
        </section>
      ) : null}

      <p className={styles.caption}>
        Marked by AI against the scheme you pasted. It can misread handwriting, and your teacher’s marking is the one
        that counts.
      </p>
      <Button variant="primary" onClick={onAnother}>
        Mark another answer
      </Button>
    </section>
  );
}
