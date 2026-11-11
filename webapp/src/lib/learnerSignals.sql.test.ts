import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/* Runs the real learner_signals migration in an in-process Postgres (PGlite)
 * with a stand-in for Supabase's auth schema and roles, then uses it as two
 * students. Proves the row-level security and the checks; not Supabase
 * itself. */
const MIGRATION = resolve(__dirname, "../../../supabase/migrations/20261109000000_learner_signals.sql");
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

let db: PGlite;

async function as<T>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    grant usage on schema public, auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    alter default privileges in schema public grant all on tables to authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  await db.exec(readFileSync(MIGRATION, "utf8"));
  /* Re-runnable. */
  await db.exec(readFileSync(MIGRATION, "utf8"));
}, 60_000);

const insert = "insert into public.learner_signals (kind, surface, value, score, client_id) values ($1, $2, $3, $4, $5)";

describe("learner_signals migration", () => {
  it("stamps the row with the student and shows it only to them", async () => {
    await as(A, insert, ["rating", "learn", "too_long", -1, "a-1"]);
    const mine = await as<{ user_id: string }>(A, "select user_id from public.learner_signals");
    expect(mine).toEqual([{ user_id: A }]);
    expect(await as(B, "select * from public.learner_signals")).toEqual([]);
  });

  it("refuses a row written for someone else", async () => {
    await expect(
      as(B, "insert into public.learner_signals (user_id, kind, surface) values ($1, 'rating', 'learn')", [A]),
    ).rejects.toThrow(/row-level security/);
  });

  it("refuses unknown kinds, surfaces and out-of-range scores", async () => {
    await expect(as(A, insert, ["note", "learn", null, null, null])).rejects.toThrow(/check/);
    await expect(as(A, insert, ["rating", "email", null, null, null])).rejects.toThrow(/check/);
    await expect(as(A, insert, ["rating", "learn", "x", 5, null])).rejects.toThrow(/check/);
    await expect(as(A, insert, ["rating", "learn", "x".repeat(49), -1, null])).rejects.toThrow(/check/);
  });

  it("keeps one row per client id per student", async () => {
    await expect(as(A, insert, ["rating", "learn", "too_long", 1, "a-1"])).rejects.toThrow(/duplicate/);
    await as(B, insert, ["rating", "learn", "too_long", -1, "a-1"]);
  });

  it("lets a student delete only their own rows", async () => {
    await as(B, "delete from public.learner_signals");
    expect(await as(A, "select count(*)::int as n from public.learner_signals")).toEqual([{ n: 1 }]);
  });
});
