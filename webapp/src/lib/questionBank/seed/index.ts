/* The Learnora-written seed, by the question-bank key of the spec it was
 * written for. Kept out of the app bundle: the app reads the bank from the
 * database; only tests and scripts/question-bank/load-seed.mjs read these. */
import type { SeedEntry } from "..";
import biology from "./biology.json";
import chemistry from "./chemistry.json";
import physics from "./physics.json";
import maths from "./maths.json";
import cbse10Science from "./cbse-10-science.json";
import cbse10Maths from "./cbse-10-maths.json";

export const LEARNORA_SEED: Readonly<Record<string, SeedEntry[]>> = {
  "aqa-gcse-biology-8461": biology,
  "aqa-gcse-chemistry-8462": chemistry,
  "aqa-gcse-physics-8463": physics,
  "gcse-maths": maths,
  /* Built from scripts/question-bank/cbse-source.mjs by build-cbse-seed.mjs. */
  "cbse-10-science-086": cbse10Science as SeedEntry[],
  "cbse-10-maths-041": cbse10Maths as SeedEntry[],
};
