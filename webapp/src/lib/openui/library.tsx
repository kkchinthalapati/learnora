/* The components the Ask drawer's model may compose with OpenUI Lang.
 *
 * Flat on purpose: the OpenUI docs are plain that fewer, simpler components
 * with positional string/number/array props generate better and cost fewer
 * tokens than deep trees, so list-shaped content (terms, events, cards) is an
 * array of [a, b] string pairs rather than child components.
 *
 * Nothing here writes to the misconception ledger, the quiz bank or any saved
 * record. A card the model made is a model's claim, not evidence about the
 * student; practice answers say so on screen. Follow-ups only *ask the tutor*
 * through AskContext — they are the student's own next message, sent for
 * them. */

import { useState, type ReactNode } from "react";
import { createLibrary, defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { renderMathText } from "../markdownToReact";
import { useAsk } from "./askContext";
import styles from "./openui.module.css";

/* Card text is maths-aware, and ==phrase== is the key-idea highlight the
   notes and lessons use everywhere else. */
const text = (s: string): ReactNode =>
  s.split(/(==[^=\n]+?==)/).map((part, i) =>
    /^==[^=\n]+==$/.test(part) ? (
      <mark key={i} className={styles.highlight}>
        {renderMathText(part.slice(2, -2))}
      </mark>
    ) : (
      <span key={i}>{renderMathText(part)}</span>
    ),
  );

/** Rows the model got wrong (a missing cell, a one-item pair) are dropped
 *  rather than drawn half-empty. */
const pairs = (rows: string[][]): [string, string][] =>
  rows.filter((r) => r.length >= 2).map((r) => [r[0], r[1]]);

/* ── Callout ─────────────────────────────────────────────────────────── */

const CALLOUT = {
  definition: { label: "Definition", mark: "D" },
  key: { label: "Key idea", mark: "★" },
  mistake: { label: "Common mistake", mark: "!" },
  formula: { label: "Formula", mark: "ƒ" },
} as const;

const Callout = defineComponent({
  name: "Callout",
  description:
    "A highlighted box for ONE definition, key idea, common mistake or formula. Text may use TeX in $…$.",
  props: z.object({
    kind: z.enum(["definition", "key", "mistake", "formula"]),
    text: z.string(),
  }),
  component: ({ props }) => (
    <div className={`${styles.callout} ${styles[`callout_${props.kind}`]}`}>
      <span className={styles.mark} aria-hidden="true">
        {CALLOUT[props.kind].mark}
      </span>
      <div>
        <strong className={styles.label}>{CALLOUT[props.kind].label}</strong>
        <p>{text(props.text)}</p>
      </div>
    </div>
  ),
});

/* ── Steps / WorkedExample ───────────────────────────────────────────── */

const Steps = defineComponent({
  name: "Steps",
  description: "A numbered list of short steps, in order (a method or process).",
  props: z.object({
    title: z.string(),
    items: z.array(z.string()),
  }),
  component: ({ props }) => (
    <section className={styles.panel}>
      <h4 className={styles.heading}>{text(props.title)}</h4>
      <ol className={styles.steps}>
        {props.items.map((item, i) => (
          <li key={i}>{text(item)}</li>
        ))}
      </ol>
    </section>
  ),
});

const WorkedExample = defineComponent({
  name: "WorkedExample",
  description:
    "A solved problem: the problem statement, each step of the working with its reason, then the final answer. Prefer this for maths, physics, chemistry and any calculation.",
  props: z.object({
    problem: z.string(),
    steps: z.array(z.string()),
    answer: z.string(),
  }),
  component: ({ props }) => (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Worked example</p>
      <p className={styles.problem}>{text(props.problem)}</p>
      <ol className={styles.steps}>
        {props.steps.map((step, i) => (
          <li key={i}>{text(step)}</li>
        ))}
      </ol>
      <p className={styles.answer}>
        <strong>Answer</strong> {text(props.answer)}
      </p>
    </section>
  ),
});

/* ── KeyTerms / Timeline / Accordion (pair lists) ────────────────────── */

const KeyTerms = defineComponent({
  name: "KeyTerms",
  description:
    "A glossary: pairs of [term, plain-English meaning]. Use for 3–8 terms the student needs.",
  props: z.object({
    title: z.string(),
    terms: z.array(z.array(z.string())),
  }),
  component: ({ props }) => (
    <section className={styles.panel}>
      <h4 className={styles.heading}>{text(props.title)}</h4>
      <dl className={styles.terms}>
        {pairs(props.terms).map(([term, meaning], i) => (
          <div key={i}>
            <dt>{text(term)}</dt>
            <dd>{text(meaning)}</dd>
          </div>
        ))}
      </dl>
    </section>
  ),
});

const Timeline = defineComponent({
  name: "Timeline",
  description:
    "Events in order: pairs of [when, what happened]. Use for history, processes over time, or stages.",
  props: z.object({
    title: z.string(),
    events: z.array(z.array(z.string())),
  }),
  component: ({ props }) => (
    <section className={styles.panel}>
      <h4 className={styles.heading}>{text(props.title)}</h4>
      <ol className={styles.timeline}>
        {pairs(props.events).map(([when, what], i) => (
          <li key={i}>
            <span className={styles.when}>{text(when)}</span>
            <span>{text(what)}</span>
          </li>
        ))}
      </ol>
    </section>
  ),
});

const Accordion = defineComponent({
  name: "Accordion",
  description:
    "Collapsible sections: pairs of [heading, text]. Use for optional depth — 'go deeper', extra detail, edge cases.",
  props: z.object({
    items: z.array(z.array(z.string())),
  }),
  component: ({ props }) => (
    <div className={styles.accordion}>
      {pairs(props.items).map(([title, body], i) => (
        <details key={i}>
          <summary>{text(title)}</summary>
          <p>{text(body)}</p>
        </details>
      ))}
    </div>
  ),
});

/* ── CompareTable / BarChart ─────────────────────────────────────────── */

const CompareTable = defineComponent({
  name: "CompareTable",
  description:
    "A small table comparing two or more things. Each row has one cell per header.",
  props: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  component: ({ props }) => (
    <div className={`${styles.panel} ${styles.scroll}`}>
      <table className={styles.table}>
        <thead>
          <tr>
            {props.headers.map((h, i) => (
              <th key={i}>{text(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, r) => (
            <tr key={r}>
              {props.headers.map((_, c) => (
                <td key={c}>{text(row[c] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
});

const BarChart = defineComponent({
  name: "BarChart",
  description:
    "Horizontal bars comparing a few numbers. labels and values have the same length; unit is shown after each value (use \"\" for none). Only chart numbers you actually know — never invent data.",
  props: z.object({
    title: z.string(),
    labels: z.array(z.string()),
    values: z.array(z.number()),
    unit: z.string(),
  }),
  component: ({ props }) => {
    const n = Math.min(props.labels.length, props.values.length);
    const values = props.values.slice(0, n).map((v) => (Number.isFinite(v) ? v : 0));
    const max = Math.max(...values.map(Math.abs), 0);
    if (n === 0 || max === 0) return null;
    return (
      <section className={styles.panel}>
        <h4 className={styles.heading}>{text(props.title)}</h4>
        <ul className={styles.bars}>
          {values.map((v, i) => (
            <li key={i}>
              <span className={styles.barLabel}>{text(props.labels[i])}</span>
              <span className={styles.barTrack} aria-hidden="true">
                <span
                  className={`${styles.barFill} ${v < 0 ? styles.barNegative : ""}`}
                  style={{ width: `${Math.max((Math.abs(v) / max) * 100, 2)}%` }}
                />
              </span>
              <span className={styles.barValue}>
                {v}
                {props.unit ? ` ${props.unit}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  },
});

/* ── Flashcards ──────────────────────────────────────────────────────── */

function FlashcardsBody({ cards }: { cards: [string, string][] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[index];
  const go = (next: number) => {
    setIndex(next);
    setFlipped(false);
  };
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>
        Flashcard {index + 1} of {cards.length}
      </p>
      <button
        type="button"
        className={`${styles.flash} ${flipped ? styles.flashBack : ""}`}
        aria-label={flipped ? "Showing the answer. Flip to the question." : "Showing the question. Flip to the answer."}
        onClick={() => setFlipped((f) => !f)}
      >
        <span className={styles.flashSide}>{flipped ? "Answer" : "Question"}</span>
        <span className={styles.flashText}>{text(flipped ? card[1] : card[0])}</span>
        <span className={styles.flashHint}>Tap to flip</span>
      </button>
      {cards.length > 1 ? (
        <div className={styles.row}>
          <button
            type="button"
            className={styles.ghost}
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className={styles.ghost}
            disabled={index === cards.length - 1}
            onClick={() => go(index + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

const Flashcards = defineComponent({
  name: "Flashcards",
  description:
    "A few flip cards to revise from: pairs of [front question, back answer]. 2–6 cards. For a full deck the student can save, use a FollowUps chip instead.",
  props: z.object({
    cards: z.array(z.array(z.string())),
  }),
  component: ({ props }) => {
    const cards = pairs(props.cards);
    return cards.length ? <FlashcardsBody cards={cards} /> : null;
  },
});

/* ── MiniQuiz ────────────────────────────────────────────────────────── */

function MiniQuizBody({
  question,
  options,
  answerIndex,
  why,
}: {
  question: string;
  options: string[];
  answerIndex: number;
  why: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Check yourself</p>
      <p className={styles.problem}>{text(question)}</p>
      <div className={styles.options} role="group" aria-label="Answer choices">
        {options.map((option, i) => {
          const state = !answered
            ? ""
            : i === answerIndex
              ? styles.right
              : i === picked
                ? styles.wrong
                : "";
          return (
            <button
              key={i}
              type="button"
              className={`${styles.option} ${state}`}
              disabled={answered}
              onClick={() => setPicked(i)}
            >
              <span className={styles.letter} aria-hidden="true">
                {String.fromCharCode(65 + i)}
              </span>
              {text(option)}
            </button>
          );
        })}
      </div>
      {answered ? (
        <p className={styles.why} role="status">
          <strong>{picked === answerIndex ? "Right. " : "Not quite. "}</strong>
          {text(why)}
        </p>
      ) : null}
      <p className={styles.note}>
        Practice only: this answer is not saved to your progress.
      </p>
    </section>
  );
}

const MiniQuiz = defineComponent({
  name: "MiniQuiz",
  description:
    "One multiple-choice check question. answerIndex is the zero-based position of the correct option in options; why explains it in one or two sentences.",
  props: z.object({
    question: z.string(),
    options: z.array(z.string()),
    answerIndex: z.number(),
    why: z.string(),
  }),
  component: ({ props }) =>
    props.options.length >= 2 &&
    Number.isInteger(props.answerIndex) &&
    props.answerIndex >= 0 &&
    props.answerIndex < props.options.length ? (
      <MiniQuizBody {...props} />
    ) : null,
});

/* ── FollowUps ───────────────────────────────────────────────────────── */

function FollowUpsBody({ prompts }: { prompts: string[] }) {
  const ask = useAsk();
  if (!ask) return null;
  return (
    <div className={styles.chips}>
      {prompts.slice(0, 4).map((prompt, i) => (
        <button
          key={i}
          type="button"
          className={styles.chip}
          onClick={() => ask(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

const FollowUps = defineComponent({
  name: "FollowUps",
  description:
    "2–3 short next questions or requests the student might tap, written as the student would say them (\"Quiz me on this\", \"Show a harder example\"). Put it last.",
  props: z.object({
    prompts: z.array(z.string()),
  }),
  component: ({ props }) => <FollowUpsBody prompts={props.prompts} />,
});

/* ── Root ────────────────────────────────────────────────────────────── */

const Stack = defineComponent({
  name: "Stack",
  description:
    "Vertical container for the cards. Every response starts with root = Stack([...]).",
  props: z.object({
    children: z.array(
      z.union([
        Callout.ref,
        Steps.ref,
        WorkedExample.ref,
        KeyTerms.ref,
        Timeline.ref,
        Accordion.ref,
        CompareTable.ref,
        BarChart.ref,
        Flashcards.ref,
        MiniQuiz.ref,
        FollowUps.ref,
      ]),
    ),
  }),
  component: ({ props, renderNode }) => (
    <div className={styles.stack}>{renderNode(props.children)}</div>
  ),
});

export const askLibrary = createLibrary({
  root: "Stack",
  components: [
    Stack,
    Callout,
    Steps,
    WorkedExample,
    KeyTerms,
    Timeline,
    Accordion,
    CompareTable,
    BarChart,
    Flashcards,
    MiniQuiz,
    FollowUps,
  ],
  componentGroups: [
    {
      name: "Layout",
      components: ["Stack"],
      notes: ["- Define each card as its own named line, then list them in Stack."],
    },
    {
      name: "Explain",
      components: ["Callout", "Steps", "WorkedExample", "KeyTerms", "Timeline", "Accordion"],
      notes: [
        "- Callout holds ONE idea; use several Callouts rather than one long one.",
        "- Prefer WorkedExample over Steps for any calculation.",
      ],
    },
    {
      name: "Compare",
      components: ["CompareTable", "BarChart"],
      notes: ["- Chart only numbers you know. Never invent figures to fill a chart."],
    },
    {
      name: "Practise",
      components: ["Flashcards", "MiniQuiz", "FollowUps"],
      notes: [
        "- MiniQuiz and Flashcards are practice only; do not claim they record progress.",
        "- End with FollowUps when a natural next step exists.",
      ],
    },
  ],
});

/** The library for a note's study guide. Quizzes, flashcards and follow-up
 *  chips belong to their own tools and to the chat, not to the notes process,
 *  so they are removed here rather than merely discouraged: a guide that
 *  asked for one would report it as an unknown component instead of drawing
 *  a quiz nobody asked this page to make. */
export const guideLibrary = askLibrary.extend({
  components: { remove: ["MiniQuiz", "Flashcards", "FollowUps"] },
});
