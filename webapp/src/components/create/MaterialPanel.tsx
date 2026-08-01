import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router";
import { useFolders, useAddFolder } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { useCreateStudyPackage } from "../../hooks/useStudyPackage";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import {
  CREATE_DEFAULTS,
  MAX_UPLOAD_BYTES,
  summarizeStudyPackage,
  studyPackageDestination,
  type StudySource,
} from "../../api/studyPackage";
import type { Folder } from "../../api/types";
import shared from "./formShared.module.css";
import styles from "./MaterialPanel.module.css";
import { Button } from "../Button";

interface MaterialPanelProps {
  folderId?: string | null;
  onClose: () => void;
  onDone?: () => void;
}

type SourceKind = StudySource["kind"];
type Difficulty = typeof CREATE_DEFAULTS.difficulty;

const FOLDER_COLORS = ["#4A90E2", "#E24A4A", "#4AE283", "#E2A84A", "#9B4AE2"];
const PERSONALITY_DESC: Record<string, string> = {
  "Friendly Tutor": "Patient, supportive, explains things step by step.",
  "Strict Coach": "Tough love, no-nonsense, pushes you to improve.",
  "Sarcastic Buddy": "Casual, funny, roasts your wrong answers.",
  "Academic Professor": "Formal, precise, textbook-style explanations.",
};

/* Full port of the vanilla #create-modal's Material flow (index.html:2060-
 * 2250, js/main.js:111-422, js/ui.js:508-681) — source picker, dropzone,
 * outputs, folder filing, the collapsed Options tuning block, and (as of
 * Step 24) the submit itself, which runs `api/studyPackage.ts`'s pipeline.
 *
 * One deliberate difference from the vanilla submit: it closed the dialog
 * *immediately* and moved the student to a blocking full-app overlay for the
 * duration. That overlay isn't part of this app (REACT_MIGRATION.md, "Found,
 * deliberately not ported"), so the dialog stays up with a live caption of the
 * stage in flight, and closes when there is somewhere to go. A run that
 * produces nothing therefore reports why in the form the student is still
 * looking at, rather than in a popup over a page they've been thrown back to. */
export function MaterialPanel({
  folderId: initialFolderId,
  onClose,
  onDone,
}: MaterialPanelProps) {
  const [source, setSource] = useState<SourceKind>("file");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [topic, setTopic] = useState("");
  const [wantFlashcards, setWantFlashcards] = useState(true);
  const [wantQuiz, setWantQuiz] = useState(false);
  const [folderId, setFolderId] = useState(initialFolderId ?? "");
  const [titleOverride, setTitleOverride] = useState("");
  const [cardCount, setCardCount] = useState(CREATE_DEFAULTS.cardCount);
  const [questionCount, setQuestionCount] = useState(
    CREATE_DEFAULTS.questionCount,
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(
    CREATE_DEFAULTS.difficulty,
  );
  const [personality, setPersonality] = useState(CREATE_DEFAULTS.personality);
  const [error, setError] = useState<string | null>(null);
  // The stage the pipeline reports it is on, or null when nothing is running.
  const [progress, setProgress] = useState<string | null>(null);
  // A folder created via the "+ New" dialog needs to be selectable
  // immediately, without waiting on the list query's background refetch —
  // mirrors the vanilla's `select.appendChild(opt)` (js/main.js:204-211).
  const [extraFolder, setExtraFolder] = useState<Folder | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const materialSelectRef = useRef<HTMLSelectElement>(null);
  const topicRef = useRef<HTMLInputElement>(null);
  const folderSelectRef = useRef<HTMLSelectElement>(null);
  const flashcardsRef = useRef<HTMLInputElement>(null);
  const browseButtonRef = useRef<HTMLButtonElement>(null);

  const foldersQuery = useFolders();
  const materialsQuery = useMaterials();
  const addFolder = useAddFolder();
  const create = useCreateStudyPackage();
  const { promptText } = useDialog();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const fetchedFolders = foldersQuery.data ?? [];
  const folders =
    extraFolder && !fetchedFolders.some((f) => f.id === extraFolder.id)
      ? [...fetchedFolders, extraFolder]
      : fetchedFolders;
  const savedMaterials = materialsQuery.data ?? [];
  const hasSavedMaterials = savedMaterials.length > 0;

  const isNewMaterial =
    source === "file" || source === "text" || source === "link";

  // Mirrors showCreateModal()'s "pre-select a folder, or default to the
  // first one" — but only once, so picking a different folder afterward
  // isn't stomped by the folders query settling later.
  const didDefaultFolder = useRef(false);
  useEffect(() => {
    const loaded = foldersQuery.data;
    if (didDefaultFolder.current || !loaded || loaded.length === 0) return;
    didDefaultFolder.current = true;
    if (!initialFolderId) setFolderId(loaded[0].id);
  }, [foldersQuery.data, initialFolderId]);

  const showChosenFile = (f: File | null) => setFile(f);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) showChosenFile(e.dataTransfer.files[0]);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    showChosenFile(e.target.files?.[0] ?? null);
  };

  const handleNewFolder = async () => {
    const name = await promptText(
      "Give it a name so it's easy to find later.",
      {
        title: "New folder",
        placeholder: "e.g. CS101, Biology",
        confirmText: "Create folder",
      },
    );
    if (!name) return;
    const color =
      FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
    const created = await addFolder.mutateAsync({ name, color });
    setExtraFolder(created);
    setFolderId(created.id);
  };

  /* Exact port of validateSource() (js/main.js:244-297) — same messages, same
   * per-source rules, so a student switching from the vanilla app never sees
   * different wording for the same mistake. */
  const validateSource = (): { message: string; focus: () => void } | null => {
    if (source === "file") {
      if (!file) {
        return {
          message: "Choose a file to create from.",
          focus: () => browseButtonRef.current?.focus(),
        };
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        return {
          message: `"${file.name}" is ${mb}MB — the limit is 10MB. Try a smaller file.`,
          focus: () => browseButtonRef.current?.focus(),
        };
      }
      return null;
    }

    if (source === "text") {
      const trimmed = text.trim();
      if (!trimmed) {
        return {
          message: "Paste the text you want to study from.",
          focus: () => textareaRef.current?.focus(),
        };
      }
      if (trimmed.length < 40) {
        return {
          message:
            "That's a bit short to study from — paste at least a paragraph.",
          focus: () => textareaRef.current?.focus(),
        };
      }
      return null;
    }

    if (source === "link") {
      const raw = link.trim();
      if (!raw) {
        return {
          message: "Add a link to create from.",
          focus: () => linkRef.current?.focus(),
        };
      }
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        return {
          message:
            "That doesn't look like a link. Include the https:// prefix.",
          focus: () => linkRef.current?.focus(),
        };
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return {
          message: "Links have to start with http:// or https://.",
          focus: () => linkRef.current?.focus(),
        };
      }
      return null;
    }

    if (source === "material") {
      if (!materialId) {
        return {
          message: "Choose which saved material to build from.",
          focus: () => materialSelectRef.current?.focus(),
        };
      }
      return null;
    }

    if (source === "topic") {
      if (!topic.trim()) {
        return {
          message: "Enter a topic to create from.",
          focus: () => topicRef.current?.focus(),
        };
      }
      return null;
    }

    return null;
  };

  /* The form's five source panels collapse into the one discriminated union
   * the pipeline takes. Validation above has already guaranteed the field this
   * reads is filled in. */
  const buildSource = (): StudySource => {
    if (source === "file") return { kind: "file", file };
    if (source === "text") return { kind: "text", text };
    if (source === "link") return { kind: "link", url: link };
    if (source === "material") return { kind: "material", materialId };
    return { kind: "topic", topic };
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Guards a second submit landing while the first is in flight. Two
    // overlapping generations used to produce an error from the run that
    // failed to parse plus a working quiz from the one that succeeded — both
    // from a single click (js/main.js:299-307).
    if (create.isPending) return;

    if (!wantFlashcards && !wantQuiz && !isNewMaterial) {
      setError("Pick at least one thing to create.");
      flashcardsRef.current?.focus();
      return;
    }

    const problem = validateSource();
    if (problem) {
      setError(problem.message);
      problem.focus();
      return;
    }

    if (isNewMaterial && !folderId) {
      setError("Choose a folder to save this into, or create one.");
      folderSelectRef.current?.focus();
      return;
    }

    setError(null);
    setProgress("Getting started…");

    try {
      const result = await create.mutateAsync({
        source: buildSource(),
        /* A topic-only run files nothing, and its folder picker is hidden — so
           don't quietly attach the quiz to whichever folder happened to be
           selected in a dropdown the student never saw. */
        folderId: source === "topic" ? null : folderId || null,
        title: titleOverride,
        outputs: { flashcards: wantFlashcards, quiz: wantQuiz },
        options: { cardCount, questionCount, difficulty, personality },
        onProgress: setProgress,
      });

      const summary = summarizeStudyPackage(result);
      if (!summary) {
        // Nothing was produced. The first failure carries the only specific
        // explanation there is — a refusal especially, which says *why*.
        setError(
          result.failures[0]?.message ??
            "Nothing could be generated this time. Please try again in a moment.",
        );
        return;
      }

      showToast(summary);
      // A refusal alongside a partial success is its own message: the summary
      // says a stage didn't generate, only this says the topic was declined.
      const refusal = result.failures.find((f) => f.refused);
      if (refusal) showToast(refusal.message, { error: true });

      onDone?.();
      onClose();

      const destination = studyPackageDestination(result);
      if (destination) void navigate(destination);
    } catch (err) {
      // Only source-resolution problems reach here (see createStudyPackage) —
      // nothing was created, so the dialog stays open on the field to fix.
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setProgress(null);
    }
  };

  return (
    // novalidate: source panels are shown one at a time, so a leftover value
    // in a hidden field (a URL typed into Link, then switching to Topic)
    // could block native submit on a control the student can't even see —
    // matches the vanilla #create-form's own `novalidate` (index.html:2074)
    // for exactly this reason. Every field is validated in JS instead.
    <form onSubmit={(e) => void handleSubmit(e)} noValidate>
      <div className={shared.inputGroup}>
        <label id="material-source-label">Start from</label>
        <div
          className={`${shared.segmented} ${styles.sourcePicker}`}
          role="radiogroup"
          aria-labelledby="material-source-label"
        >
          {(
            [
              ["file", "File"],
              ["text", "Text"],
              ["link", "Link"],
              ...(hasSavedMaterials ? [["material", "Saved"] as const] : []),
              ["topic", "Topic"],
            ] as [SourceKind, string][]
          ).map(([kind, label]) => (
            <label key={kind} className={shared.segmentedOption}>
              <input
                type="radio"
                name="material-source"
                value={kind}
                checked={source === kind}
                onChange={() => setSource(kind)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {source === "file" ? (
        <div className={styles.sourcePanel}>
          <div
            className={`${styles.dropzone} ${isDragging ? styles.dragging : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <p className={styles.dropzoneTitle}>
              {file ? file.name : "Drag & drop a file"}
            </p>
            <p className={shared.fieldDesc}>
              PDF, Word, text, or audio — up to 10MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".pdf,.doc,.docx,.txt,.mp3,.mp4,.wav,.m4a,.aac,.ogg"
              onChange={handleFileInputChange}
            />
            <Button
              ref={browseButtonRef}
              type="button"
              onClick={(e) => {
                // Without this the click bubbles to the dropzone and opens
                // the picker twice.
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Browse files
            </Button>
          </div>
        </div>
      ) : null}

      {source === "text" ? (
        <div className={`${styles.sourcePanel} ${shared.inputGroup}`}>
          <label htmlFor="material-text">Paste your notes or text</label>
          <textarea
            ref={textareaRef}
            id="material-text"
            className={shared.field}
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste lecture notes, an article, a transcript…"
          />
        </div>
      ) : null}

      {source === "link" ? (
        <div className={`${styles.sourcePanel} ${shared.inputGroup}`}>
          <label htmlFor="material-link">Link</label>
          <input
            ref={linkRef}
            id="material-link"
            className={shared.field}
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://youtube.com/watch?v=…"
          />
          <p className={shared.fieldDesc}>
            YouTube links are summarised from the video's topic, not its
            transcript.
          </p>
        </div>
      ) : null}

      {source === "material" ? (
        <div className={`${styles.sourcePanel} ${shared.inputGroup}`}>
          <label htmlFor="material-select">Saved material</label>
          <select
            ref={materialSelectRef}
            id="material-select"
            className={`${shared.field} ${styles.select}`}
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
          >
            <option value="" disabled>
              {materialsQuery.isLoading
                ? "Loading your materials…"
                : "Choose a material…"}
            </option>
            {savedMaterials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <p className={shared.fieldDesc}>
            Reuses the notes already made for it — nothing is re-uploaded.
          </p>
        </div>
      ) : null}

      {source === "topic" ? (
        <div className={`${styles.sourcePanel} ${shared.inputGroup}`}>
          <label htmlFor="material-topic">Topic</label>
          <input
            ref={topicRef}
            id="material-topic"
            className={shared.field}
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Ionic bonding"
          />
          <p className={shared.fieldDesc}>
            No material needed — generated from general knowledge.
          </p>
        </div>
      ) : null}

      <div className={shared.inputGroup}>
        <label id="material-outputs-label">Create</label>
        <div
          className={styles.outputs}
          role="group"
          aria-labelledby="material-outputs-label"
        >
          {isNewMaterial ? (
            <label className={styles.outputRow}>
              <input type="checkbox" checked disabled />
              <span className={styles.outputText}>
                <span className={styles.outputName}>Notes</span>
                <span className={styles.outputDesc}>
                  Always created — flashcards and quizzes are built from them
                </span>
              </span>
            </label>
          ) : null}
          <label className={styles.outputRow}>
            <input
              ref={flashcardsRef}
              type="checkbox"
              checked={wantFlashcards}
              onChange={(e) => setWantFlashcards(e.target.checked)}
            />
            <span className={styles.outputText}>
              <span className={styles.outputName}>Flashcards</span>
              <span className={styles.outputDesc}>
                A deck for spaced review
              </span>
            </span>
          </label>
          <label className={styles.outputRow}>
            <input
              type="checkbox"
              checked={wantQuiz}
              onChange={(e) => setWantQuiz(e.target.checked)}
            />
            <span className={styles.outputText}>
              <span className={styles.outputName}>Quiz</span>
              <span className={styles.outputDesc}>
                Auto-graded multiple choice
              </span>
            </span>
          </label>
        </div>
      </div>

      {source !== "topic" ? (
        <div className={shared.inputGroup}>
          <label htmlFor="material-folder">Folder</label>
          <div className={styles.folderRow}>
            <select
              ref={folderSelectRef}
              id="material-folder"
              className={`${shared.field} ${styles.select}`}
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
            >
              <option value="" disabled>
                {folders.length
                  ? "Select a folder…"
                  : "No folders yet — create one →"}
              </option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <Button type="button" onClick={handleNewFolder}>
              + New
            </Button>
          </div>
        </div>
      ) : null}

      <details className={styles.options}>
        <summary>Options</summary>
        <div className={styles.optionsBody}>
          <div className={shared.inputGroup}>
            <label htmlFor="material-title">
              Title <span className={shared.fieldDesc}>(optional)</span>
            </label>
            <input
              id="material-title"
              className={shared.field}
              type="text"
              value={titleOverride}
              onChange={(e) => setTitleOverride(e.target.value)}
              placeholder="Defaults to the file or topic name"
            />
          </div>

          {wantFlashcards ? (
            <div className={shared.inputGroup}>
              <label htmlFor="material-card-count">
                Flashcards: {cardCount} cards
              </label>
              <input
                id="material-card-count"
                type="range"
                min={5}
                max={30}
                step={1}
                value={cardCount}
                onChange={(e) => setCardCount(Number(e.target.value))}
              />
            </div>
          ) : null}

          {wantQuiz ? (
            <>
              <div className={shared.inputGroup}>
                <label htmlFor="material-question-count">
                  Quiz: {questionCount} questions
                </label>
                <input
                  id="material-question-count"
                  type="range"
                  min={5}
                  max={20}
                  step={1}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                />
              </div>

              <div className={shared.inputGroup}>
                <label id="material-difficulty-label">Quiz difficulty</label>
                <div
                  className={shared.segmented}
                  role="radiogroup"
                  aria-labelledby="material-difficulty-label"
                >
                  {(["Easy", "Medium", "Hard"] as const).map((d) => (
                    <label key={d} className={shared.segmentedOption}>
                      <input
                        type="radio"
                        name="material-difficulty"
                        value={d}
                        checked={difficulty === d}
                        onChange={() => setDifficulty(d)}
                      />
                      <span>{d}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className={shared.inputGroup}>
                <label htmlFor="material-personality">Quiz host</label>
                <select
                  id="material-personality"
                  className={`${shared.field} ${styles.select}`}
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                >
                  {Object.keys(PERSONALITY_DESC).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <p className={shared.fieldDesc}>
                  {PERSONALITY_DESC[personality]}
                </p>
              </div>
            </>
          ) : null}
        </div>
      </details>

      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}

      {/* aria-live, not role="alert": these captions arrive every few seconds
          and would otherwise interrupt whatever a screen reader is saying. */}
      {progress ? (
        <p className={styles.progress} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          {progress}
        </p>
      ) : null}

      <div className={`${shared.actions} ${styles.stickyActions}`}>
        <Button type="button" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </div>
    </form>
  );
}
