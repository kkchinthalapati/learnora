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
import { useCreateStudyPackage } from "../../hooks/useAI";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import type { CreateStudyPackageSource } from "../../api/ai";
import type { Folder } from "../../api/types";
import shared from "./formShared.module.css";
import styles from "./MaterialPanel.module.css";
import { Button } from "../Button";

interface MaterialPanelProps {
  folderId?: string | null;
  onClose: () => void;
  onDone?: () => void;
}

type SourceKind = "file" | "text" | "link" | "material" | "topic";
type Difficulty = "Easy" | "Medium" | "Hard";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
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
 * Step 14) the actual submit: `createStudyPackage()` (api/ai.ts).
 *
 * One deliberate deviation from the vanilla's submit flow. The vanilla
 * closes the dialog immediately on submit and shows a separate full-page
 * loading overlay (`UI.setAILoading`) for the run — a shared "AI is
 * thinking" chrome piece that doesn't exist in this app and isn't this
 * step's job to invent (Step 14 is the service layer, not new UI surface).
 * This panel stays open instead: Cancel and Create disable, Create's label
 * tracks `onProgress`, and the result — success or failure — reports inline
 * in the form's existing error/toast surfaces rather than a popup. The
 * modal's own Escape/✕ aren't blocked during a run, unlike Cancel; that's a
 * known, narrow gap (see the ledger's Step 14 loose ends), not an oversight. */
export function MaterialPanel({ folderId: initialFolderId, onClose, onDone }: MaterialPanelProps) {
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
  const [cardCount, setCardCount] = useState(12);
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [personality, setPersonality] = useState("Friendly Tutor");
  const [error, setError] = useState<string | null>(null);
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
  const createPackage = useCreateStudyPackage();
  const { promptText } = useDialog();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<string | null>(null);

  const fetchedFolders = foldersQuery.data ?? [];
  const folders =
    extraFolder && !fetchedFolders.some((f) => f.id === extraFolder.id)
      ? [...fetchedFolders, extraFolder]
      : fetchedFolders;
  const savedMaterials = materialsQuery.data ?? [];
  const hasSavedMaterials = savedMaterials.length > 0;

  const isNewMaterial = source === "file" || source === "text" || source === "link";

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
    const name = await promptText("Give it a name so it's easy to find later.", {
      title: "New folder",
      placeholder: "e.g. CS101, Biology",
      confirmText: "Create folder",
    });
    if (!name) return;
    const color = FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
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
          message: "That's a bit short to study from — paste at least a paragraph.",
          focus: () => textareaRef.current?.focus(),
        };
      }
      return null;
    }

    if (source === "link") {
      const raw = link.trim();
      if (!raw) {
        return { message: "Add a link to create from.", focus: () => linkRef.current?.focus() };
      }
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        return {
          message: "That doesn't look like a link. Include the https:// prefix.",
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
        return { message: "Enter a topic to create from.", focus: () => topicRef.current?.focus() };
      }
      return null;
    }

    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (createPackage.isPending) return;

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

    let requestSource: CreateStudyPackageSource;
    if (source === "file") requestSource = { kind: "file", file: file ?? undefined };
    else if (source === "text") requestSource = { kind: "text", text };
    else if (source === "link") requestSource = { kind: "link", url: link };
    else if (source === "material") requestSource = { kind: "material", materialId };
    else requestSource = { kind: "topic", topic };

    setProgress("Getting started…");
    try {
      const result = await createPackage.mutateAsync({
        source: requestSource,
        folderId: source === "topic" ? null : folderId || null,
        title: titleOverride,
        outputs: { flashcards: wantFlashcards, quiz: wantQuiz },
        options: { cardCount, questionCount, difficulty, personality },
        onProgress: setProgress,
      });
      setProgress(null);

      const made: string[] = [];
      if (result.notes) made.push("notes");
      if (result.deck) made.push("flashcards");
      if (result.quiz) made.push("a quiz");

      if (made.length === 0) {
        setError("Nothing could be generated this time. Please try again in a moment.");
        return;
      }

      // Partial success is reported honestly rather than as a plain success.
      const failed = result.errors.filter((x) => x !== "notes");
      showToast(
        failed.length
          ? `Created ${made.join(", ")} — ${failed.join(" and ")} didn't generate.`
          : `Created ${made.join(", ")}.`,
      );

      onDone?.();
      onClose();

      // Land the student on whatever was just made: a quiz is the most
      // specific outcome, then freshly written notes (result.notes is only
      // set when they were generated in this run, so building a deck from an
      // existing material doesn't dump you back into notes you already had),
      // then the new deck.
      if (result.quiz) void navigate(`/quiz/${result.quiz.id}`);
      else if (result.notes && result.material) void navigate(`/notes/${result.material.id}`);
      else if (result.deck) void navigate("/library/flashcards");
      else if (result.material) void navigate(`/notes/${result.material.id}`);
    } catch (err) {
      setProgress(null);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    // novalidate: source panels are shown one at a time, so a leftover value
    // in a hidden field (a URL typed into Link, then switching to Topic)
    // could block native submit on a control the student can't even see —
    // matches the vanilla #create-form's own `novalidate` (index.html:2074)
    // for exactly this reason. Every field is validated in JS instead.
    <form onSubmit={handleSubmit} noValidate>
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
            <p className={styles.dropzoneTitle}>{file ? file.name : "Drag & drop a file"}</p>
            <p className={shared.fieldDesc}>PDF, Word, text, or audio — up to 10MB</p>
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
            YouTube links are summarised from the video's topic, not its transcript.
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
              {materialsQuery.isLoading ? "Loading your materials…" : "Choose a material…"}
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
          <p className={shared.fieldDesc}>No material needed — generated from general knowledge.</p>
        </div>
      ) : null}

      <div className={shared.inputGroup}>
        <label id="material-outputs-label">Create</label>
        <div className={styles.outputs} role="group" aria-labelledby="material-outputs-label">
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
              <span className={styles.outputDesc}>A deck for spaced review</span>
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
              <span className={styles.outputDesc}>Auto-graded multiple choice</span>
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
                {folders.length ? "Select a folder…" : "No folders yet — create one →"}
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
              <label htmlFor="material-card-count">Flashcards: {cardCount} cards</label>
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
                <label htmlFor="material-question-count">Quiz: {questionCount} questions</label>
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
                <p className={shared.fieldDesc}>{PERSONALITY_DESC[personality]}</p>
              </div>
            </>
          ) : null}
        </div>
      </details>

      {progress ? (
        <p className={shared.fieldDesc} role="status">
          {progress}
        </p>
      ) : null}

      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={`${shared.actions} ${styles.stickyActions}`}>
        <Button type="button" onClick={onClose} disabled={createPackage.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={createPackage.isPending}>
          {createPackage.isPending ? "Creating…" : "Create"}
        </Button>
      </div>
    </form>
  );
}
