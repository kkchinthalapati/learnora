/* Import Oak National Academy KS4 quiz questions (Open Government Licence
   v3.0) into public.question_bank. See docs/QUESTION_SOURCES.md.

     OAK_API_KEY=… node scripts/question-bank/import-oak.mjs --out oak.json
     OAK_API_KEY=… node scripts/question-bank/import-oak.mjs --sql oak.sql
     OAK_API_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
       node scripts/question-bank/import-oak.mjs --apply

   Without --apply nothing is written to the database: review the JSON or
   SQL first. Re-running is safe; rows already present are skipped. */
import { writeFileSync } from "node:fs";
import { withModules } from "./_load.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? "");
};
const apiKey = process.env.OAK_API_KEY;
if (!apiKey) {
  console.error("Set OAK_API_KEY (request one from Oak National Academy: https://open-api.thenational.academy).");
  process.exit(1);
}

await withModules(
  ["/src/lib/questionBank/oakClient.ts", "/src/lib/questionBank/build.ts"],
  async (oak, build) => {
    const result = await oak.runOakImport({ apiKey, log: (l) => console.error(l) });
    console.error(`\n${result.rows.length} questions to import. Skipped:`, result.skipped);

    const out = flag("--out");
    if (out) writeFileSync(out, JSON.stringify(result.rows, null, 2));
    const sql = flag("--sql");
    if (sql) writeFileSync(sql, build.toSqlInsert(result.rows) + "\n");

    if (args.includes("--apply")) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        console.error("--apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
        process.exit(1);
      }
      const n = await oak.upsertRows(result.rows, url, key);
      console.error(`Sent ${n} rows (duplicates ignored).`);
    } else if (!out && !sql) {
      console.error("Dry run. Pass --out file.json, --sql file.sql or --apply.");
    }
  },
);
