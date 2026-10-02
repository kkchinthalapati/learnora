/* Print the Learnora-written seed as one idempotent INSERT for
   public.question_bank. Paste into the SQL editor, or pipe to psql.

     node scripts/question-bank/seed-sql.mjs > seed.sql
*/
import { withModules } from "./_load.mjs";

await withModules(
  ["/src/lib/questionBank/build.ts", "/src/lib/questionBank/seed/index.ts"],
  async (build, seed) => {
    const rows = await build.seedRows(seed.LEARNORA_SEED);
    process.stdout.write(build.toSqlInsert(rows) + "\n");
    process.stderr.write(`${rows.length} seed questions\n`);
  },
);
