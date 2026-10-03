import { useId, useState, type FormEvent } from "react";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { useToast } from "../../context/toast";
import { useAddPastPaper, usePastPapers, useRemovePastPaper } from "../../hooks/usePastPapers";
import { localDateStr } from "../../lib/date";
import { plural } from "../../lib/plural";
import { percent, summarisePastPapers } from "../../lib/pastPapers";
import type { SyllabusSpec, SyllabusTier } from "../../lib/syllabus";
import styles from "./examDetail.module.css";

/* Past papers: where to get them, and what the student scored.
 *
 * The papers stay on the exam board's site — every board reserves them
 * (docs/QUESTION_SOURCES.md) — so this links out, and records the result
 * when the student comes back with a paper marked against the board's own
 * mark scheme. That score is the strongest readiness evidence there is, so
 * it sits beside the quiz forecast rather than being folded into it. */

const OTHER = "__other";

export function PastPapersCard({
  examId,
  spec,
  tier,
}: {
  examId: number;
  spec: SyllabusSpec;
  tier: SyllabusTier | null;
}) {
  const { data: attempts = [], isPending } = usePastPapers(examId);
  const add = useAddPastPaper(examId);
  const remove = useRemovePastPaper(examId);
  const { showToast } = useToast();
  const ids = { paper: useId(), other: useId(), series: useId(), marks: useId(), max: useId(), date: useId() };

  const papers = spec.papers.filter((p) => !p.tier || !tier || p.tier === tier);
  const [adding, setAdding] = useState(false);
  const [paper, setPaper] = useState(papers[0]?.name ?? OTHER);
  const [otherName, setOtherName] = useState("");
  const [series, setSeries] = useState("");
  const [marks, setMarks] = useState("");
  const [maxMarks, setMaxMarks] = useState(papers[0]?.marks ? String(papers[0].marks) : "");
  const [satOn, setSatOn] = useState(localDateStr());

  const summary = summarisePastPapers(attempts);
  const isIb = spec.qualification === "IB";

  function choosePaper(name: string) {
    setPaper(name);
    const known = papers.find((p) => p.name === name);
    if (known?.marks) setMaxMarks(String(known.marks));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = paper === OTHER ? otherName.trim() : paper;
    const got = Number(marks);
    const outOf = Number(maxMarks);
    if (!name) return showToast("Name the paper you sat.", { error: true });
    if (!Number.isFinite(got) || !Number.isFinite(outOf) || outOf <= 0 || got < 0) {
      return showToast("Enter your marks and the total for the paper.", { error: true });
    }
    if (got > outOf) return showToast("Your marks can't be more than the total.", { error: true });
    if (satOn > localDateStr()) return showToast("That date is in the future.", { error: true });
    try {
      await add.mutateAsync({
        paper: name.slice(0, 80),
        series: series.trim() ? series.trim().slice(0, 40) : null,
        marks: got,
        max_marks: outOf,
        sat_on: satOn,
        notes: null,
      });
      setAdding(false);
      setMarks("");
      setSeries("");
    } catch (err) {
      showToast(`Couldn't save that paper. ${(err as Error).message}`, { error: true });
    }
  }

  return (
    <Card padding="lg" as="section" aria-labelledby="past-papers-heading">
      <h2 id="past-papers-heading" className={styles.sectionTitle}>
        Past papers
      </h2>
      <p className={styles.muted}>
        A full paper under timed conditions is the best test of where you are.{" "}
        {isIb
          ? "IB papers are sold by the IB's official store, and your IB coordinator may already have them."
          : `They're free on ${spec.board}'s website, with mark schemes.`}{" "}
        Sit one there, mark it against the mark scheme, then log your score here. Learnora doesn't copy
        exam board papers.
      </p>
      <p className={styles.footnote} data-print-hide>
        <a href={spec.pastPapersUrl} target="_blank" rel="noreferrer">
          {isIb ? "IB past papers (official store)" : `${spec.board} past papers and mark schemes`}
        </a>
      </p>

      {summary.count > 0 && (
        <p className={styles.verdict}>
          {summary.count === 1
            ? `One paper so far: ${summary.latest}%.`
            : `Average ${summary.average}% over ${plural(summary.count, "paper")}; latest ${summary.latest}%.`}
          {summary.trendPerPaper !== null &&
            ` ${summary.trendPerPaper > 0 ? "Up" : summary.trendPerPaper < 0 ? "Down" : "Level"}${
              summary.trendPerPaper !== 0 ? ` about ${Math.abs(summary.trendPerPaper)} points a paper` : ""
            }.`}
        </p>
      )}

      {!isPending && attempts.length > 0 && (
        <ul className={styles.calibration}>
          {attempts.map((a) => (
            <li key={a.id}>
              <span>
                {a.sat_on} · {a.paper}
                {a.series ? ` (${a.series})` : ""}
              </span>
              <span>
                {a.marks}/{a.max_marks} · {percent(a)}%{" "}
                <button
                  type="button"
                  className={styles.inlineAction}
                  data-print-hide
                  aria-label={`Remove ${a.paper} from ${a.sat_on}`}
                  onClick={() => remove.mutate(a.id)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form className={styles.paperForm} onSubmit={(e) => void onSubmit(e)} noValidate data-print-hide>
          <label htmlFor={ids.paper}>Paper</label>
          <select id={ids.paper} value={paper} onChange={(e) => choosePaper(e.target.value)}>
            {papers.map((p) => (
              <option key={`${p.name}-${p.tier ?? ""}`} value={p.name}>
                {p.name}
              </option>
            ))}
            <option value={OTHER}>Another paper or a mock</option>
          </select>
          {paper === OTHER && (
            <>
              <label htmlFor={ids.other}>Which paper?</label>
              <input id={ids.other} value={otherName} maxLength={80} onChange={(e) => setOtherName(e.target.value)} />
            </>
          )}
          <label htmlFor={ids.series}>Series (optional)</label>
          <input
            id={ids.series}
            value={series}
            maxLength={40}
            placeholder="e.g. June 2023"
            onChange={(e) => setSeries(e.target.value)}
          />
          <label htmlFor={ids.marks}>Your marks</label>
          <input id={ids.marks} inputMode="decimal" value={marks} onChange={(e) => setMarks(e.target.value)} />
          <label htmlFor={ids.max}>Out of</label>
          <input id={ids.max} inputMode="decimal" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} />
          <label htmlFor={ids.date}>Date sat</label>
          <input id={ids.date} type="date" value={satOn} max={localDateStr()} onChange={(e) => setSatOn(e.target.value)} />
          <div className={styles.headerActions}>
            <Button type="submit" variant="primary" busy={add.isPending}>
              Save score
            </Button>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div data-print-hide>
          <Button onClick={() => setAdding(true)}>Log a past paper</Button>
        </div>
      )}
    </Card>
  );
}
