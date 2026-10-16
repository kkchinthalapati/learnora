import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router";
import { useCreateStudyPackage } from "../../hooks/useStudyPackage";
import {
  useLectureRecorder,
  type FinishedRecording,
} from "../../hooks/useLectureRecorder";
import { useSettings } from "../../context/settings";
import { useToast } from "../../context/toast";
import {
  MAX_UPLOAD_BYTES,
  studyPackageDestination,
  summarizeStudyPackage,
  type StudySource,
} from "../../api/studyPackage";
import { lessonPath } from "../../lib/lessons";
import { guessCapture } from "../../lib/captureInput";
import {
  isImageFile,
  prepareStudyImage,
  STUDY_IMAGE_ACCEPT,
  StudyImageError,
} from "../../lib/studyImage";
import { AI_PERSONA_QUIZ_HOST } from "../../lib/settings";
import { Button } from "../Button";
import { Icon } from "../Icon";
import styles from "./CaptureBar.module.css";

/* One way in. A file, a photo, a link, pasted notes, a topic or a lecture
 * recorded right here all go down the same path: notes plus flashcards, then
 * straight to the result. The full Create panel is still one click away
 * ("More options") for a quiz, a subject or card counts. */

const FILE_ACCEPT = `.pdf,.doc,.docx,.txt,.mp3,.mp4,.wav,.m4a,.aac,.ogg,.webm,${STUDY_IMAGE_ACCEPT}`;

export interface CaptureBarProps {
  /** Pre-filled from a share or an opener that knows the source. */
  initialText?: string;
  initialFile?: File | null;
  folderId?: string | null;
  outputs?: { flashcards?: boolean; quiz?: boolean; notes?: boolean };
  autoFocus?: boolean;
  /** "lg" is Home's version: a taller field and a bigger type size. */
  size?: "md" | "lg";
  /** Overrides the field's placeholder, e.g. Home's tip. */
  placeholder?: string;
  onMoreOptions?: () => void;
  onDone?: () => void;
}

function formatClock(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

function describeFile(file: File): string {
  if (file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(file.name)) {
    return "recording";
  }
  if (file.type.startsWith("image/")) return "photo";
  return "file";
}

export function CaptureBar({
  initialText = "",
  initialFile = null,
  folderId = null,
  outputs,
  autoFocus = false,
  size = "md",
  placeholder = "Write a topic, paste your notes or a link, or drop in a file",
  onMoreOptions,
  onDone,
}: CaptureBarProps) {
  const { settings } = useSettings();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const create = useCreateStudyPackage();

  const [text, setText] = useState(initialText);
  const [file, setFile] = useState<File | null>(initialFile);
  const [fileTitle, setFileTitle] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const pickSeq = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const wanted = {
    notes: outputs?.notes ?? true,
    flashcards: outputs?.flashcards ?? true,
    quiz: outputs?.quiz ?? false,
  };
  const busy = create.isPending;

  const run = async (source: StudySource, title?: string) => {
    if (busy) return;
    setError(null);
    setProgress("Getting started…");
    try {
      const result = await create.mutateAsync({
        source,
        folderId: source.kind === "topic" ? null : folderId,
        title,
        /* A topic only files notes when they're asked for explicitly. */
        outputs: wanted,
        options: { personality: AI_PERSONA_QUIZ_HOST[settings.aiPersona] },
        onProgress: setProgress,
      });
      const summary = summarizeStudyPackage(result);
      if (!summary) {
        setError(
          result.failures[0]?.message ??
            "Nothing could be made this time. Please try again in a moment.",
        );
        return;
      }
      showToast(summary);
      const refusal = result.failures.find((failure) => failure.refused);
      if (refusal) showToast(refusal.message, { error: true });
      setText("");
      setFile(null);
      setFileTitle(null);
      onDone?.();
      /* What was made lives on its lesson page (DESIGN.md rule 0.1). */
      const destination = result.material
        ? lessonPath(result.material.id)
        : studyPackageDestination(result);
      if (destination) void navigate(destination);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setProgress(null);
    }
  };

  const recorder = useLectureRecorder((done: FinishedRecording) => {
    setFile(done.file);
    setFileTitle(done.title);
    if (done.hitLimit) {
      showToast("Recording stopped at the 10 MB limit. Making notes from it now.");
    }
    void run({ kind: "file", file: done.file }, done.title);
  });

  /* After the dialog's own open-focus, which runs after this component's
     effects and would otherwise take focus back to its first control. */
  useEffect(() => {
    if (!autoFocus) return;
    const id = window.setTimeout(() => textRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [autoFocus]);

  const takeFile = (picked: File | null) => {
    const seq = ++pickSeq.current;
    setError(null);
    setFileTitle(null);
    if (!picked) return;
    if (!isImageFile(picked)) {
      if (picked.size > MAX_UPLOAD_BYTES) {
        const mb = (picked.size / (1024 * 1024)).toFixed(1);
        setError(`That file is ${mb} MB. The limit is 10 MB.`);
        return;
      }
      setFile(picked);
      return;
    }
    setPreparing(true);
    prepareStudyImage(picked, MAX_UPLOAD_BYTES)
      .then((prepared) => {
        if (seq === pickSeq.current) setFile(prepared.file);
      })
      .catch((caught: unknown) => {
        if (seq !== pickSeq.current) return;
        setError(
          caught instanceof StudyImageError
            ? caught.message
            : "That photo couldn't be prepared. Try another one.",
        );
      })
      .finally(() => {
        if (seq === pickSeq.current) setPreparing(false);
      });
  };

  const handleDrop = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) {
      takeFile(dropped);
      return;
    }
    const droppedText = event.dataTransfer.getData("text/plain");
    if (droppedText) setText(droppedText);
  };

  /* A screenshot pasted straight in is a photo, not text. */
  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.files[0];
    if (pasted) {
      event.preventDefault();
      takeFile(pasted);
    }
  };

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    takeFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const guess = guessCapture(text);
  const kind = file ? describeFile(file) : guess.kind;
  const goLabel =
    kind === "topic"
      ? "Teach me this"
      : kind === "empty"
        ? "Start"
        : "Make my study set";
  const hint =
    kind === "link"
      ? "Learnora will read this page or video and make notes and cards."
      : kind === "text"
        ? "Learnora will turn your notes into a study guide and cards."
        : kind === "topic"
          ? "Learnora will teach this topic and make cards to practise it."
          : kind === "recording"
            ? "Learnora will listen to the recording and make notes and cards."
            : kind === "photo"
              ? "Learnora will read the photo and make notes and cards."
              : kind === "file"
                ? "Learnora will read this and make notes and cards."
                : "Learnora makes notes and cards from it, then keeps track of what you get wrong.";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (preparing) {
      setError("Your photo is still being prepared. One moment.");
      return;
    }
    if (file) {
      void run({ kind: "file", file }, fileTitle ?? undefined);
      return;
    }
    if (guess.kind === "empty") {
      setError("Add something to study first: a file, a link, your notes or a topic.");
      textRef.current?.focus();
      return;
    }
    if (guess.kind === "link") void run({ kind: "link", url: guess.url });
    else if (guess.kind === "text") void run({ kind: "text", text: guess.text });
    else void run({ kind: "topic", topic: guess.topic });
  };

  if (recorder.recording) {
    const mb = (recorder.bytes / (1024 * 1024)).toFixed(1);
    return (
      <div className={styles.recordingPanel} role="group" aria-label="Recording a lecture">
        <div className={styles.recordingStatus}>
          <span className={styles.recDot} aria-hidden="true" />
          <span className={styles.recClock} aria-live="off">
            {formatClock(recorder.elapsedSecs)}
          </span>
          <span className={styles.recMeta}>
            Recording · {mb} MB of 10 MB · keep this tab open
          </span>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={recorder.discard}>
            Discard
          </Button>
          <Button variant="primary" onClick={recorder.stop}>
            Stop and make notes
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className={`${styles.bar} ${size === "lg" ? styles.lg : ""}`}
      data-dragging={dragging || undefined}
      onSubmit={handleSubmit}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      aria-busy={busy || undefined}
    >
      <div className={styles.field}>
        {file ? (
          <div className={styles.fileChip}>
            <Icon
              name={kind === "recording" ? "mic" : kind === "photo" ? "image" : "file-text"}
              size={18}
            />
            <span className={styles.fileName}>{fileTitle ?? file.name}</span>
            {!busy ? (
              <button
                type="button"
                className={styles.clearFile}
                onClick={() => {
                  setFile(null);
                  setFileTitle(null);
                }}
                aria-label={`Remove ${fileTitle ?? file.name}`}
              >
                <Icon name="x" size={16} />
              </button>
            ) : null}
          </div>
        ) : (
          <textarea
            ref={textRef}
            className={styles.input}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onPaste={handlePaste}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && guessCapture(text).kind !== "text") {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={guess.kind === "text" ? 5 : 2}
            placeholder={placeholder}
            aria-label="What do you want to learn?"
            disabled={busy}
          />
        )}
      </div>

      <div className={styles.actions}>
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_ACCEPT}
          onChange={handlePick}
          className={styles.hiddenInput}
          tabIndex={-1}
          aria-hidden="true"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          <Icon name="paperclip" size={16} /> Add a file
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void recorder.start()}
          disabled={busy}
        >
          <Icon name="mic" size={16} /> Record a class
        </Button>
        <span className={styles.spacer} />
        <Button type="submit" variant="primary" busy={busy || preparing}>
          {busy ? "Working" : goLabel}
        </Button>
      </div>

      <p className={styles.hint} aria-live="polite">
        {progress ?? hint}
      </p>
      {error || recorder.error ? (
        <p className={styles.error} role="alert">
          {error ?? recorder.error}
        </p>
      ) : null}
      {onMoreOptions && !busy ? (
        <button type="button" className={styles.moreOptions} onClick={onMoreOptions}>
          More options: a quiz, a subject, card counts
        </button>
      ) : null}
    </form>
  );
}
