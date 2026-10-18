import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type Quill from "quill";
import { createClozeCards } from "../../api/aiInlineActions";
import { callEdge } from "../../api/ai";
import { buildDiagramTaskPrompt } from "../../lib/diagramPrompt";
import { extractSvgSource } from "../../lib/diagramSvg";
import { useSettings } from "../../context/settings";
import { useToast } from "../../context/toast";
import { useFolders } from "../../hooks/useFolders";
import { flashcardsKeys } from "../../hooks/useFlashcards";
import { decksKeys } from "../../hooks/useDecks";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import { mistakeTitle } from "../../lib/mistakeLoop";
import { headingsOf, markedPhrases, recalledIdeas, type MarkedPhrase } from "../../lib/noteReading";
import styles from "./notesPage.module.css";

/* The margin (DESIGN.md 0.8): pencilled notes beside the page, each one a
 * sentence that leads to something to do.
 *
 * - Your open mistakes in this lesson's subject, from the ledger, each
 *   linking to the lesson's Mistakes tab where it can be retested.
 * - Words marked "Learn this", turned into fill-in-the-blank cards.
 * - Blank-page recall: the page is covered, you write what you remember,
 *   and it is checked against the ideas you marked.
 *
 * Every figure here is counted from the page or the ledger; nothing is
 * estimated. */

const MAX_MISTAKES = 3;

interface Props {
  quill: Quill | null;
  materialId: string;
  materialTitle: string;
  folderId: string | null;
  recalling: boolean;
  onRecall: (on: boolean) => void;
}

export function NotesMargin({
  quill,
  materialId,
  materialTitle,
  folderId,
  recalling,
  onRecall,
}: Props) {
  const { data: folders = [] } = useFolders();
  const { ranked } = useMisconceptions();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  const [phrases, setPhrases] = useState<MarkedPhrase[]>([]);
  const [headingTexts, setHeadingTexts] = useState<string[]>([]);

  const subject = folders.find((f) => f.id === folderId) ?? null;
  const mistakes = useMemo(
    () =>
      subject
        ? ranked.filter(
            (m) =>
              m.status !== "resolved" &&
              m.subject.trim().toLowerCase() === subject.name.trim().toLowerCase(),
          )
        : [],
    [ranked, subject],
  );

  useEffect(() => {
    if (!quill) return;
    let timer: number | undefined;
    const read = () => {
      const ops = quill.getContents().ops;
      setPhrases(markedPhrases(ops));
      setHeadingTexts(headingsOf(ops).map((h) => h.text));
    };
    const onText = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, 300);
    };
    read();
    quill.on("text-change", onText);
    return () => {
      window.clearTimeout(timer);
      quill.off("text-change", onText);
    };
  }, [quill]);

  /* A drawing for the section the caret is in, or for the selected words.
     The drawing is sanitised when it is inserted (lib/noteFormats). */
  const draw = useMutation({
    mutationFn: async () => {
      if (!quill) throw new Error("The page is still loading.");
      const range = quill.getSelection(true) ?? { index: Math.max(0, quill.getLength() - 1), length: 0 };
      const selected = range.length > 0 ? quill.getText(range.index, range.length).trim() : "";
      const heading = headingsOf(quill.getContents().ops)
        .filter((h) => h.index <= range.index)
        .at(-1)?.text;
      const topic = selected || heading || materialTitle;
      const response = await callEdge({
        history: [{ role: "user", content: buildDiagramTaskPrompt(topic) }],
        tool: "notebookStudio",
        settings,
      });
      const svg = extractSvgSource(response.text);
      if (!svg) throw new Error("No drawing came back this time. Try again.");
      return { svg, at: range.index + range.length };
    },
    onSuccess: ({ svg, at }) => {
      if (!quill) return;
      quill.insertText(at, "\n", "user");
      quill.insertEmbed(at + 1, "diagram", svg, "user");
      quill.insertText(at + 2, "\n", "user");
      quill.setSelection(at + 3, 0, "user");
      showToast("Drawing added to the page.");
    },
    onError: (error) => showToast((error as Error).message, { error: true }),
  });

  const learn = phrases.filter((p) => p.kind === "learn");
  const keyIdeas = phrases.filter((p) => p.kind === "key");
  const wrong = phrases.filter((p) => p.kind === "wrong");

  /* A highlight is a place to go back to: the margin lists each one and
     puts the caret on it, so marking is a way of finding things again. */
  const jumpTo = (phrase: MarkedPhrase) => {
    if (!quill) return;
    quill.setSelection(phrase.index, phrase.text.length, "user");
    quill.focus();
  };

  const cloze = useMutation({
    mutationFn: () =>
      createClozeCards({
        items: [...learn, ...keyIdeas].map((p) => ({ sentence: p.sentence, answer: p.text })),
        materialId,
        materialTitle,
        folderId,
      }),
    onSuccess: ({ deck, created, skipped }) => {
      const deckName = deck.title || `${materialTitle} Flashcards`;
      void queryClient.invalidateQueries({ queryKey: flashcardsKeys.all });
      void queryClient.invalidateQueries({ queryKey: decksKeys.all });
      showToast(
        created === 0
          ? `Those cards are already in “${deckName}”.`
          : `Made ${created} ${created === 1 ? "card" : "cards"} in “${deckName}”${skipped ? `, skipped ${skipped} you already had` : ""}.`,
      );
    },
    onError: (error) => showToast((error as Error).message, { error: true }),
  });

  /* Recall checks against what the student marked; with nothing marked it
     falls back to the headings, and says which it used. */
  const ideas = phrases.length > 0 ? [...new Set(phrases.map((p) => p.text))] : headingTexts;
  const ideaSource = phrases.length > 0 ? "the ideas you marked" : "your headings";

  if (recalling) {
    return <RecallSheet ideas={ideas} source={ideaSource} onDone={() => onRecall(false)} />;
  }

  return (
    <div className={styles.margin} aria-label="Margin notes">
      {mistakes.length > 0 ? (
        <section className={styles.note}>
          <p className={styles.noteLead}>
            {mistakes.length === 1
              ? `One open mistake in ${subject?.name}.`
              : `${mistakes.length} open mistakes in ${subject?.name}.`}
          </p>
          <ul className={styles.mistakeList}>
            {mistakes.slice(0, MAX_MISTAKES).map((m) => (
              <li key={m.id} className={styles.mistake}>
                {mistakeTitle(m)}
                {m.timesObserved > 1 ? (
                  <span className={styles.noteFaint}> · seen {m.timesObserved} times</span>
                ) : null}
              </li>
            ))}
          </ul>
          <Link className={styles.noteGo} to={`/lessons/${encodeURIComponent(materialId)}?tab=mistakes`}>
            Try them again →
          </Link>
        </section>
      ) : null}

      {keyIdeas.length + wrong.length + learn.length > 0 ? (
        <section className={styles.note} aria-label="Marked on this page">
          <p className={styles.noteLead}>Marked on this page</p>
          {keyIdeas.length > 0 ? (
            <div className={styles.markGroup}>
              <span className={styles.markTag} data-kind="key">Key ideas</span>
              {keyIdeas.map((p) => (
                <button key={`k${p.index}`} type="button" className={styles.markJump} onClick={() => jumpTo(p)}>
                  {p.text}
                </button>
              ))}
            </div>
          ) : null}
          {wrong.length > 0 ? (
            <div className={styles.markGroup}>
              <span className={styles.markTag} data-kind="wrong">I get this wrong</span>
              {wrong.map((p) => (
                <button key={`w${p.index}`} type="button" className={styles.markJump} onClick={() => jumpTo(p)}>
                  {p.text}
                </button>
              ))}
            </div>
          ) : null}
          {learn.length > 0 ? (
            <div className={styles.markGroup}>
              <span className={styles.markTag} data-kind="learn">Learn this</span>
              {learn.map((p) => (
                <button key={`l${p.index}`} type="button" className={styles.markJump} onClick={() => jumpTo(p)}>
                  {p.text}
                </button>
              ))}
            </div>
          ) : null}
          {learn.length + keyIdeas.length > 0 ? (
            <button
              type="button"
              className={styles.noteGo}
              disabled={cloze.isPending}
              onClick={() => cloze.mutate()}
            >
              {cloze.isPending ? "Making cards…" : `Turn ${learn.length + keyIdeas.length} into cards →`}
            </button>
          ) : null}
        </section>
      ) : (
        <section className={styles.note}>
          <p className={styles.noteLead}>
            Select a phrase and pick a highlighter. Key ideas, things you get wrong and things to
            learn are listed here, and can become cards.
          </p>
        </section>
      )}

      <section className={styles.note}>
        <p className={styles.noteLead}>Show it as a picture</p>
        <button
          type="button"
          className={styles.noteGo}
          disabled={draw.isPending || !quill}
          onClick={() => draw.mutate()}
        >
          {draw.isPending ? "Drawing…" : "Draw this section →"}
        </button>
        <p className={styles.noteFaint}>
          Select a phrase first to draw that instead.
        </p>
      </section>

      <section className={styles.note}>
        <p className={styles.noteLead}>Cover the page and write what you remember.</p>
        {ideas.length > 0 ? (
          <button type="button" className={styles.noteGo} disabled={!quill} onClick={() => onRecall(true)}>
            Start →
          </button>
        ) : (
          <p className={styles.noteFaint}>Add a heading or mark a key idea first, so there is something to check against.</p>
        )}
      </section>
    </div>
  );
}

function RecallSheet({
  ideas,
  source,
  onDone,
}: {
  ideas: string[];
  source: string;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ recalled: string[]; missed: string[] } | null>(null);

  const check = () => {
    if (!text.trim()) {
      setError("Write something first.");
      return;
    }
    setResult(recalledIdeas(ideas, text));
  };

  return (
    <div className={styles.margin} aria-label="Blank-page recall">
      <section className={styles.note}>
        {result ? (
          <>
            <p className={styles.noteLead}>
              You covered {result.recalled.length} of {ideas.length} from {source}.
            </p>
            {result.missed.length > 0 ? (
              <>
                <p className={styles.noteFaint}>Missed:</p>
                <ul className={styles.mistakeList}>
                  {result.missed.map((idea) => (
                    <li key={idea} className={styles.mistake}>
                      {idea}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className={styles.noteFaint}>Nothing missed.</p>
            )}
            <p className={styles.noteFaint}>
              A rough check: it looks for the words of each idea in what you wrote.
            </p>
            <button type="button" className={styles.noteGo} onClick={onDone}>
              Uncover the page →
            </button>
          </>
        ) : (
          <>
            <label className={styles.noteLead} htmlFor="recall-text">
              The page is covered. Write everything you remember.
            </label>
            <textarea
              id="recall-text"
              className={styles.recallBox}
              rows={8}
              value={text}
              autoFocus
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError("");
              }}
            />
            {error ? (
              <p className={styles.recallError} role="alert">
                {error}
              </p>
            ) : null}
            <div className={styles.recallActions}>
              <button type="button" className={styles.noteGo} onClick={check}>
                Check it →
              </button>
              <button type="button" className={styles.noteQuiet} onClick={onDone}>
                Cancel
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
