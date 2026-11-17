import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { CardImportError } from "../../api/decks";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../context/toast";
import { useImportCards } from "../../hooks/useDecks";
import { useFlashcardsByDeck } from "../../hooks/useFlashcards";
import { useFolders } from "../../hooks/useFolders";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_CARDS,
  isAnkiPackageName,
  looksLikeZip,
  parseCardImport,
  titleFromFileName,
  withoutExisting,
  type ImportSource,
} from "../../lib/cardImport";
import { friendlyErrorMessage } from "../../lib/friendlyError";
import { LESSON_TITLE_MAX } from "../../lib/fieldLimits";
import { plural } from "../../lib/plural";
import styles from "./importCards.module.css";

/* Bringing a Quizlet or Anki deck in as a card set.
 *
 * Everything is parsed in the browser and shown before anything is saved:
 * the student sees the first few cards and the counts, so a wrong separator
 * is obvious in the preview rather than in a set of 400 broken cards. */

const PREVIEW_COUNT = 5;

export const APKG_MESSAGE =
  "Anki packages (.apkg) can't be read here. In Anki, choose File › Export, pick “Notes in Plain Text (.txt)”, then choose that file instead.";

type SourceChoice = ImportSource | "auto";
type SepChoice = "auto" | "\t" | "," | ";" | "custom";

const SOURCE_LABELS: Record<ImportSource, string> = {
  quizlet: "Quizlet",
  anki: "Anki",
  csv: "CSV/TSV",
};

function sepName(sep: string): string {
  if (sep === "\t") return "tab";
  if (sep === "\n") return "new line";
  if (sep === ",") return "comma";
  if (sep === ";") return "semicolon";
  return `“${sep}”`;
}

function chosen(choice: SepChoice, custom: string): string | undefined {
  if (choice === "auto") return undefined;
  if (choice === "custom") return custom || undefined;
  return choice;
}

export interface ImportCardsModalProps {
  open: boolean;
  onClose: () => void;
  /** Import into this set instead of making a new one. */
  deck?: { id: string; title: string };
}

export function ImportCardsModal(props: ImportCardsModalProps) {
  /* Mounted only while open, so every opening starts from a clean form. */
  if (!props.open) return null;
  return <ImportCardsForm {...props} />;
}

function ImportCardsForm({ onClose, deck }: ImportCardsModalProps) {
  const ids = useId();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const importCards = useImportCards();
  const folders = useFolders({ enabled: !deck });
  const existing = useFlashcardsByDeck(deck?.id ?? "");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const [source, setSource] = useState<SourceChoice>("auto");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldChoice, setFieldChoice] = useState<SepChoice>("auto");
  const [customField, setCustomField] = useState("");
  const [rowChoice, setRowChoice] = useState<SepChoice>("auto");
  const [customRow, setCustomRow] = useState("");
  const [title, setTitle] = useState<string | null>(null);
  const [folderId, setFolderId] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /* Parsing a few thousand rows takes a moment; deferring it keeps typing in
     the paste box responsive while the preview catches up. */
  const deferredText = useDeferredValue(text);
  const parsed = useMemo(
    () =>
      deferredText.trim()
        ? parseCardImport(deferredText, {
            source,
            fieldSeparator: chosen(fieldChoice, customField),
            rowSeparator: chosen(rowChoice, customRow),
            fileName: fileName ?? undefined,
          })
        : null,
    [deferredText, source, fieldChoice, customField, rowChoice, customRow, fileName],
  );

  const alreadyInSet = deck ? (existing.data ?? []) : [];
  const fresh = parsed ? withoutExisting(parsed.cards, alreadyInSet) : [];
  const alreadyCount = parsed ? parsed.cards.length - fresh.length : 0;
  const toImport = fresh.slice(0, MAX_IMPORT_CARDS);
  const overCap = fresh.length - toImport.length;

  const suggestedTitle =
    parsed?.deckName ?? (fileName ? titleFromFileName(fileName) : "");
  const effectiveTitle = (title ?? suggestedTitle).trim();
  const busy = importCards.isPending;
  const stale = deferredText !== text;
  const canImport =
    !busy && !stale && toImport.length > 0 && (deck ? !existing.isPending : !!effectiveTitle);

  const readFile = async (file: File) => {
    setError(null);
    setNotice(null);
    if (isAnkiPackageName(file.name)) {
      setNotice(APKG_MESSAGE);
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setNotice("That file is too big to be a card export. Try a file under 5 MB.");
      return;
    }
    const content = await file.text();
    if (looksLikeZip(content)) {
      setNotice(APKG_MESSAGE);
      return;
    }
    setFileName(file.name);
    setText(content);
  };

  const submit = async () => {
    if (!canImport) return;
    setError(null);
    setProgress(0);
    try {
      const result = await importCards.mutateAsync({
        target: deck
          ? { deckId: deck.id }
          : { folderId: folderId || null, title: effectiveTitle.slice(0, LESSON_TITLE_MAX) },
        cards: toImport,
        onProgress: setProgress,
      });
      showToast(
        `Imported ${plural(result.added, "card")} into “${deck?.title ?? result.deck?.title ?? effectiveTitle}”.`,
      );
      onClose();
      if (result.deck) void navigate(`/decks/${result.deck.id}`);
    } catch (cause) {
      const added = cause instanceof CardImportError ? cause.added : 0;
      const reason = friendlyErrorMessage((cause as Error).message ?? "");
      setError(
        deck && added > 0
          ? `Stopped after ${plural(added, "card")}. ${reason} Import the same text again to add the rest — cards already in the set are skipped.`
          : `Nothing was imported. ${reason}`,
      );
    }
  };

  const effectiveSource = parsed?.source ?? (source === "auto" ? null : source);
  const showRowSep = effectiveSource === "quizlet" || (!parsed && source === "auto");

  const summary: string[] = [];
  if (parsed) {
    if (parsed.skippedBlank > 0) {
      summary.push(`${plural(parsed.skippedBlank, "row")} skipped (blank front or back${parsed.skippedMediaOnly > 0 ? ", or only an image or sound" : ""}).`);
    }
    if (parsed.skippedTooLong > 0) {
      summary.push(`${plural(parsed.skippedTooLong, "row")} skipped as too long — check the separators.`);
    }
    if (parsed.duplicates > 0) {
      summary.push(`${plural(parsed.duplicates, "duplicate")} left out.`);
    }
    if (alreadyCount > 0) {
      summary.push(`${plural(alreadyCount, "card")} already in this set left out.`);
    }
    if (parsed.mediaStripped > 0) {
      summary.push(`${plural(parsed.mediaStripped, "card")} had images or sounds removed — they can't be imported.`);
    }
    if (parsed.clozeNotes > 0) {
      summary.push(`${plural(parsed.clozeNotes, "cloze note")} turned into fill-in-the-blank cards.`);
    }
    if (overCap > 0) {
      summary.push(`Only the first ${MAX_IMPORT_CARDS.toLocaleString()} cards can be imported at once; ${overCap.toLocaleString()} more were left out.`);
    }
  }

  const buttonLabel = busy
    ? `Importing ${progress.toLocaleString()} of ${toImport.length.toLocaleString()}…`
    : toImport.length > 0
      ? `Import ${toImport.length.toLocaleString()} ${toImport.length === 1 ? "card" : "cards"}`
      : "Import cards";

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={deck ? "Import into this set" : "Import cards"}
      subtitle="From a Quizlet export, an Anki text export, or a two-column CSV."
      initialFocusRef={textRef}
      contentClassName={styles.content}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!canImport} busy={busy}>
            {buttonLabel}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${ids}-source`}>
            Made in
          </label>
          <select
            id={`${ids}-source`}
            className={styles.select}
            value={source}
            disabled={busy}
            onChange={(e) => setSource(e.target.value as SourceChoice)}
          >
            <option value="auto">Work it out</option>
            <option value="quizlet">Quizlet</option>
            <option value="anki">Anki</option>
            <option value="csv">CSV or TSV</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${ids}-text`}>
            Paste your cards
          </label>
          <textarea
            ref={textRef}
            id={`${ids}-text`}
            className={styles.textarea}
            rows={6}
            value={text}
            disabled={busy}
            spellCheck={false}
            placeholder={"term<tab>definition\nterm<tab>definition"}
            onChange={(e) => {
              setText(e.target.value);
              setNotice(null);
            }}
          />
          <p className={styles.hint}>
            Quizlet: open the set, choose ⋯ › Export, then Copy text. Anki: File › Export › Notes in Plain Text.
          </p>
        </div>

        <div className={styles.fileRow}>
          <label className={styles.filePicker}>
            <span>{fileName ? `File: ${fileName}` : "Or choose a file (.txt, .csv, .tsv)"}</span>
            <input
              type="file"
              className={styles.fileInput}
              accept=".txt,.csv,.tsv,.apkg,.colpkg,text/plain,text/csv,text/tab-separated-values"
              disabled={busy}
              aria-label="Choose a file to import"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void readFile(file);
              }}
            />
          </label>
        </div>

        {notice ? (
          <p role="alert" className={styles.notice}>
            {notice}
          </p>
        ) : null}

        <details className={styles.details}>
          <summary>
            Separators
            {parsed
              ? `: ${sepName(parsed.fieldSeparator)} between front and back${parsed.source === "quizlet" ? `, ${sepName(parsed.rowSeparator)} between cards` : ""}`
              : ""}
          </summary>
          <div className={styles.sepGrid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${ids}-field`}>
                Between front and back
              </label>
              <select
                id={`${ids}-field`}
                className={styles.select}
                value={fieldChoice}
                disabled={busy}
                onChange={(e) => setFieldChoice(e.target.value as SepChoice)}
              >
                <option value="auto">Work it out</option>
                <option value={"\t"}>Tab</option>
                <option value=",">Comma</option>
                <option value=";">Semicolon</option>
                <option value="custom">Custom</option>
              </select>
              {fieldChoice === "custom" ? (
                <input
                  className={styles.input}
                  aria-label="Custom separator between front and back"
                  value={customField}
                  onChange={(e) => setCustomField(e.target.value)}
                />
              ) : null}
            </div>
            {showRowSep ? (
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${ids}-row`}>
                  Between cards
                </label>
                <select
                  id={`${ids}-row`}
                  className={styles.select}
                  value={rowChoice}
                  disabled={busy}
                  onChange={(e) => setRowChoice(e.target.value as SepChoice)}
                >
                  <option value="auto">Work it out</option>
                  <option value={"\n"}>New line</option>
                  <option value=";">Semicolon</option>
                  <option value="custom">Custom</option>
                </select>
                {rowChoice === "custom" ? (
                  <input
                    className={styles.input}
                    aria-label="Custom separator between cards"
                    value={customRow}
                    onChange={(e) => setCustomRow(e.target.value)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </details>

        {!deck ? (
          <div className={styles.sepGrid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${ids}-title`}>
                Set title
              </label>
              <input
                id={`${ids}-title`}
                className={styles.input}
                value={title ?? suggestedTitle}
                maxLength={LESSON_TITLE_MAX}
                disabled={busy}
                placeholder="e.g. Spanish verbs"
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${ids}-folder`}>
                Subject
              </label>
              <select
                id={`${ids}-folder`}
                className={styles.select}
                value={folderId}
                disabled={busy}
                onChange={(e) => setFolderId(e.target.value)}
              >
                <option value="">No subject</option>
                {(folders.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {parsed ? (
          <section className={styles.preview} aria-label="Preview">
            <p className={styles.previewHead} aria-live="polite">
              {toImport.length > 0
                ? `${plural(toImport.length, "card")} ready from ${SOURCE_LABELS[parsed.source]}.`
                : "No cards found. Check the separators."}
            </p>
            {summary.length > 0 ? (
              <ul className={styles.summary}>
                {summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {toImport.length > 0 ? (
              <ol className={styles.cards}>
                {toImport.slice(0, PREVIEW_COUNT).map((card, i) => (
                  <li key={i} className={styles.card}>
                    <p className={styles.front}>{card.front}</p>
                    <p className={styles.back}>{card.back}</p>
                  </li>
                ))}
              </ol>
            ) : null}
            {toImport.length > PREVIEW_COUNT ? (
              <p className={styles.hint}>
                and {plural(toImport.length - PREVIEW_COUNT, "more card")}.
              </p>
            ) : null}
          </section>
        ) : null}

        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
