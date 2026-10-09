/* Write the CBSE seed JSON from cbse-source.mjs.

     node scripts/question-bank/build-cbse-seed.mjs

   Each question is authored answer-first; here its options are rotated so the
   key lands in every position equally often across the set (an AI-written
   quiz once had all ten answers at A; students learn positions). Distractor
   mappings move with their options. Deterministic, so re-running is a no-op. */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CBSE_10_MATHS, CBSE_10_SCIENCE } from "./cbse-source.mjs";

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

for (const [name, list] of [
  ["cbse-10-science.json", CBSE_10_SCIENCE],
  ["cbse-10-maths.json", CBSE_10_MATHS],
]) {
  const seed = toSeed(list);
  writeFileSync(join(seedDir, name), JSON.stringify(seed, null, 1) + "\n");
  process.stderr.write(`${name}: ${seed.length} questions\n`);
}
