// @ts-nocheck -- test helper: rows are untyped query results.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/* Shared harness for the Boardroom SQL tests: an in-process Postgres (PGlite)
 * with a stand-in for the parts of Supabase the migration relies on (the auth
 * schema, the anon / authenticated / service_role roles and Supabase's habit of
 * granting ALL on every new table and function to them), then the real
 * migration. It is not Supabase itself: the Realtime publication, the hosted
 * auth service and a second concurrent connection are not exercised.
 *
 * BOARDROOM_MIGRATION points the harness at a different migration file. That
 * is how the regression tests are shown failing against the unfixed migration
 * before they are shown passing against the fixed one. */

export const MIGRATION = process.env.BOARDROOM_MIGRATION
  ? resolve(process.env.BOARDROOM_MIGRATION)
  : resolve(__dirname, "../../../../supabase/migrations/20261108020000_boardroom.sql");

export const U = {
  karthik: "00000000-0000-0000-0000-00000000000a",
  nirav: "00000000-0000-0000-0000-00000000000b",
  eve: "00000000-0000-0000-0000-00000000000c",
  mia: "00000000-0000-0000-0000-00000000000d",
  ivy: "00000000-0000-0000-0000-00000000000e",
  sol: "00000000-0000-0000-0000-00000000000f",
  tom: "00000000-0000-0000-0000-000000000010",
  zed: "00000000-0000-0000-0000-000000000011",
};

/** Users the activation step adds to the allowlist. zed never is. */
export const ALLOWED = ["karthik", "nirav", "eve", "mia", "ivy", "sol", "tom"];

export async function bootBoardroomDb() {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    ${Object.entries(U)
      .map(([name, id]) => `insert into auth.users values ('${id}', '${name}@example.test');`)
      .join("\n")}
  `);
  try {
    await db.exec("create publication supabase_realtime;");
  } catch {
    // PGlite has no Realtime publication; the migration then skips that step.
  }
  await db.exec(readFileSync(MIGRATION, "utf8"));

  const hasAllowlist =
    (await db.query("select to_regclass('public.boardroom_allowed_users') is not null as present")).rows[0].present;
  if (hasAllowlist) {
    // The activation step the project owner runs by hand (see the migration header).
    for (const name of ALLOWED) {
      await db.query("insert into public.boardroom_allowed_users (user_id, note) values ($1, 'test')", [U[name]]);
    }
  }

  /** Run one statement as an authenticated user (or, with null, as a signed-out one). */
  async function as(user, sql, params = []) {
    await db.exec(
      `reset role; select set_config('request.jwt.claim.sub', '${user ? U[user] : ""}', false); set role authenticated;`,
    );
    try {
      return await db.query(sql, params);
    } finally {
      await db.exec("reset role");
    }
  }
  /** Same, but as the signed-out `anon` role. */
  async function asAnon(sql, params = []) {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;");
    try {
      return await db.query(sql, params);
    } finally {
      await db.exec("reset role");
    }
  }
  const rows = async (user, sql, params) => (await as(user, sql, params)).rows;
  /** Run as the database owner, bypassing RLS and grants (seeding and inspection only). */
  const sup = async (sql, params = []) => {
    await db.exec("reset role");
    return (await db.query(sql, params)).rows;
  };

  return { db, as, asAnon, rows, sup, hasAllowlist };
}

/** Make `candidate` a founder the only way the database allows: one founder asks, every current
 *  founder approves. `founders` are the people who are founders now (the first one asks). */
export async function promote(h, ws, founders, candidate) {
  const rid = (await h.rows(founders[0], "select boardroom_request_founder($1, $2) id", [ws, U[candidate]]))[0].id;
  for (const f of founders.slice(1)) await h.as(f, "select boardroom_approve_founder($1)", [rid]);
  return rid;
}

/** A workspace with `creator` as founder, `others` joined, `founders` promoted (each by unanimous
 *  approval), and one discussion thread. People are named after their key ("karthik"). */
export async function team(h, creator, others = [], founders = []) {
  // The 3-workspaces-per-creator cap is not under test here: detach earlier ones so scenarios can reuse a person.
  await h.sup("update boardroom_workspaces set created_by = null where created_by = $1", [U[creator]]);
  const ws = (await h.rows(creator, "select boardroom_create_workspace('Room', $1) id", [creator]))[0].id;
  const code = (await h.rows(creator, "select boardroom_invite_code($1) c", [ws]))[0].c;
  for (const o of others) await h.as(o, "select boardroom_join_workspace($1, $2)", [code, o]);
  const current = [creator];
  for (const f of founders) {
    await promote(h, ws, current, f);
    current.push(f);
  }
  const thread = (await h.rows(creator, "insert into boardroom_threads (workspace_id, title) values ($1, 'T') returning id", [ws]))[0].id;
  return { ws, code, thread };
}
export const propose = async (h, user, t, title = "Ship it", outcome = "approved") =>
  (await h.rows(user, "select boardroom_propose_decision($1, null, $2, $3, 'why', '', '', '', null, null) id", [t.thread, title, outcome]))[0].id;
export const statusOf = async (h, id) => (await h.sup("select status, outcome from boardroom_decisions where id = $1", [id]))[0];
export const vote = (h, user, id, v = "approved") => h.as(user, "select boardroom_vote_decision($1, $2)", [id, v]);
