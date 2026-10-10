/* Write the CBSE seed JSON from cbse-source.mjs.

     node scripts/question-bank/build-cbse-seed.mjs

   Each question is authored answer-first; here its options are rotated so the
   key lands in every position equally often across the set (an AI-written
   quiz once had all ten answers at A; students learn positions). Distractor
   mappings move with their options. Deterministic, so re-running is a no-op. */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CBSE_10_MATHS,
  CBSE_10_MATHS_NUMERIC,
  CBSE_10_SCIENCE,
  CBSE_10_SCIENCE_NUMERIC,
} from "./cbse-source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = join(here, "../../src/lib/questionBank/seed");

function toSeed(list) {
  return list.map((item, i) => {
    const n = item.choices.length;
    const mis = Array.from({ length: n }, (_, k) => item.mis[k] ?? null);
    const at = i % n;
    const order = Array.from({ length: n }, (_, j) => (j - at + n) % n);
    const entry = {
      ref: item.ref,
      q: item.question,
      c: order.map((k) => item.choices[k]),
      a: at,
      why: item.why,
      kind: item.kind,
    };
    if (mis.some(Boolean)) entry.mis = order.map((k) => mis[k]);
    return entry;
  });
}

/* Numeric questions have no options to rotate: one shown key, index 0. */
const toNumericSeed = (list) =>
  list.map((item) => ({ ref: item.ref, q: item.question, c: [item.shown], a: 0, why: item.why, kind: item.kind, num: item.num }));

for (const [name, list, numeric] of [
  ["cbse-10-science.json", CBSE_10_SCIENCE, CBSE_10_SCIENCE_NUMERIC],
  ["cbse-10-maths.json", CBSE_10_MATHS, CBSE_10_MATHS_NUMERIC],
]) {
  const seed = [...toSeed(list), ...toNumericSeed(numeric)];
  writeFileSync(join(seedDir, name), JSON.stringify(seed, null, 1) + "\n");
  process.stderr.write(`${name}: ${seed.length} questions\n`);
}
