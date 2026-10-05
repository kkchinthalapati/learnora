import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* Static checks on the SQL migrations. Nothing here runs SQL: migrations are
 * applied by hand (see docs/ROLLBACK.md), so the only review they get before
 * production is this file plus a human. The rules are the ones a re-run or a
 * partial apply needs to be safe — every statement can run twice, every new
 * table is behind RLS, and nothing silently destroys data.
 *
 * Files before REVIEWED_FROM predate the rules and are already live; several
 * create policies without a matching drop. They are left alone rather than
 * edited, since an applied migration is history. */
const REVIEWED_FROM = "20261001000000";

const DIR = resolve(__dirname, "../../supabase/migrations");
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const reviewed = files.filter((f) => f.slice(0, 14) >= REVIEWED_FROM);

/** SQL with `--` comments removed and whitespace collapsed, lower case. */
function code(file: string): string {
  return readFileSync(resolve(DIR, file), "utf8")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function header(file: string): string {
  return readFileSync(resolve(DIR, file), "utf8");
}

describe("supabase migrations", () => {
  it("have unique version prefixes", () => {
    const versions = files.map((f) => f.split("_")[0]);
    const dupes = versions.filter((v, i) => versions.indexOf(v) !== i);
    expect(dupes).toEqual([]);
  });

  describe.each(reviewed)("%s", (file) => {
    const sql = code(file);

    it("says how to revert it", () => {
      expect(header(file)).toMatch(/Revert:/);
    });

    it("creates tables and indexes only if they don't exist", () => {
      expect(sql).not.toMatch(/create table (?!if not exists)/);
      expect(sql).not.toMatch(/create (unique )?index (?!if not exists)/);
      expect(sql).not.toMatch(/add column (?!if not exists)/);
    });

    it("drops or guards each policy before creating it", () => {
      const created = [...sql.matchAll(/create policy "([^"]+)" on ([\w.]+)/g)];
      for (const [, name, table] of created) {
        const dropped = sql.includes(`drop policy if exists "${name}" on ${table}`);
        // The other safe form: `if not exists (select … from pg_policies …
        // policyname = '<name>') then create policy …`.
        const guarded = sql.includes(`policyname = '${name}'`);
        expect(dropped || guarded, name).toBe(true);
      }
    });

    it("drops each named constraint before adding it", () => {
      const added = [...sql.matchAll(/add constraint (\w+)/g)];
      for (const [, name] of added) {
        expect(sql).toContain(`drop constraint if exists ${name}`);
      }
    });

    it("enables RLS on every table it creates", () => {
      const tables = [
        ...sql.matchAll(/create table if not exists (public\.\w+)/g),
      ].map((m) => m[1]);
      for (const table of tables) {
        expect(sql).toContain(`alter table ${table} enable row level security`);
      }
    });

    it("never destroys data unguarded", () => {
      // A statement that truncates, not `revoke … truncate on`.
      expect(sql).not.toMatch(/(^|;)\s*truncate\b/);
      expect(sql).not.toMatch(/drop (table|column|index|function|trigger|view) (?!if exists)/);
      expect(sql).not.toMatch(/\bdelete from\b(?![^;]*\bwhere\b)/);
    });
  });
});
