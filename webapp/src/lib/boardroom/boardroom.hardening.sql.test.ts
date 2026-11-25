// @ts-nocheck -- SQL scenario tests: rows are untyped query results.
import { beforeAll, describe, expect, it } from "vitest";
import { U, bootBoardroomDb, promote, propose, statusOf, team, vote } from "./sqlHarness";

/* Regression tests for the four high-severity findings of the 2026-11-08
 * validation audit (H1 invite-code confidentiality, H2 founder governance,
 * H3 server-side access and limits, H4 table privileges). Each test asserts
 * that the original exploit now fails and that the legitimate path beside it
 * still works. They were first run against the unfixed migration (see
 * BOARDROOM_MIGRATION in sqlHarness.ts) and failed there. */

const SLOW = 120_000;

/** What a direct read of the invite code obtains for this user, or null. */
async function directCodeRead(h, user) {
  try {
    const r = await h.rows(user, "select join_code from boardroom_workspaces");
    return r.length ? r[0].join_code : null;
  } catch {
    return null;
  }
}


/* ===================================================================== H1 */
describe("H1: the invite code is founder-only, even by direct SQL", () => {
  let h, WS, CODE;
  beforeAll(async () => {
    h = await bootBoardroomDb();
    const t = await team(h, "karthik", ["nirav"]); // nirav: ordinary member
    WS = t.ws;
    CODE = t.code;
  }, SLOW);

  it("an ordinary member cannot read join_code from the table", async () => {
    expect(await directCodeRead(h, "nirav")).toBeNull();
    await expect(h.as("nirav", "select join_code from boardroom_workspaces")).rejects.toThrow(/permission denied/);
  });

  it("a member cannot probe the code through a WHERE clause or select *", async () => {
    await expect(h.as("nirav", "select id from boardroom_workspaces where join_code = $1", [CODE])).rejects.toThrow(/permission denied/);
    await expect(h.as("nirav", "select * from boardroom_workspaces")).rejects.toThrow(/permission denied/);
    await expect(h.as("nirav", "select id from boardroom_workspaces order by join_code")).rejects.toThrow(/permission denied/);
  });

  it("a founder reads the code only through the founder-only function, not the table", async () => {
    expect(await directCodeRead(h, "karthik")).toBeNull();
    const got = (await h.rows("karthik", "select boardroom_invite_code($1) c", [WS]))[0].c;
    expect(got).toBe(CODE);
  });

  it("an outsider obtains nothing by any route", async () => {
    expect(await directCodeRead(h, "eve")).toBeNull();
    expect(await h.rows("eve", "select id, name from boardroom_workspaces")).toHaveLength(0);
    await expect(h.as("eve", "select boardroom_invite_code($1)", [WS])).rejects.toThrow(/only a founder/);
    await expect(h.asAnon("select join_code from boardroom_workspaces")).rejects.toThrow(/permission denied/);
    await expect(h.asAnon("select boardroom_invite_code($1)", [WS])).rejects.toThrow(/permission denied/);
  });

  it("the function stays closed to members", async () => {
    await expect(h.as("nirav", "select boardroom_invite_code($1)", [WS])).rejects.toThrow(/only a founder/);
    await expect(h.as("nirav", "select boardroom_rotate_code($1)", [WS])).rejects.toThrow(/only a founder/);
  });

  it("legitimate workspace information stays readable to members, and only to members", async () => {
    const own = await h.rows("nirav", "select id, name, created_by, created_at from boardroom_workspaces");
    expect(own).toHaveLength(1);
    expect(own[0].name).toBe("Room");
    expect(await h.rows("eve", "select id, name, created_at from boardroom_workspaces")).toHaveLength(0);
  });

  it("the column privilege itself is absent for anon and authenticated", async () => {
    const q = (role, col) =>
      h.sup("select has_column_privilege($1, 'public.boardroom_workspaces', $2, 'SELECT') as ok", [role, col]);
    for (const role of ["anon", "authenticated"]) {
      expect((await q(role, "join_code"))[0].ok).toBe(false);
    }
    for (const col of ["id", "name", "created_by", "created_at", "governance_restricted"]) {
      expect((await q("authenticated", col))[0].ok).toBe(true);
      expect((await q("anon", col))[0].ok).toBe(false);
    }
  });

  it("joining with the code still works, and rotation invalidates the old code", async () => {
    await h.as("mia", "select boardroom_join_workspace($1, 'Mia')", [CODE]);
    expect(await h.rows("mia", "select role from boardroom_members where user_id = $1", [U.mia])).toEqual([{ role: "member" }]);
    const fresh = (await h.rows("karthik", "select boardroom_rotate_code($1) c", [WS]))[0].c;
    expect(fresh).not.toBe(CODE);
    await expect(h.as("ivy", "select boardroom_join_workspace($1, 'Ivy')", [CODE])).rejects.toThrow(/invite code/);
    await h.as("ivy", "select boardroom_join_workspace($1, 'Ivy')", [fresh]);
    expect(await h.rows("ivy", "select count(*)::int c from boardroom_members where workspace_id = $1", [WS])).toEqual([{ c: 4 }]);
  });

  it("the code does not leak through the audit log or notifications", async () => {
    const code = (await h.sup("select join_code from boardroom_workspaces where id = $1", [WS]))[0].join_code;
    const leaks = await h.sup(
      `select (select count(*)::int from boardroom_audit_log where detail::text ilike '%' || $1 || '%' or action ilike '%' || $1 || '%')
            + (select count(*)::int from boardroom_notifications where title ilike '%' || $1 || '%' or body ilike '%' || $1 || '%') as n`,
      [code],
    );
    expect(leaks[0].n).toBe(0);
  });
});

/* ===================================================================== H2 */
describe("H2: founder governance cannot be bypassed", () => {
  let h;
  beforeAll(async () => {
    h = await bootBoardroomDb();
  }, SLOW);

  it("one founder cannot demote another, so cannot finalise a decision alone", async () => {
    const t = await team(h, "karthik", ["nirav"], ["nirav"]);
    const d = await propose(h, "karthik", t);
    expect((await statusOf(h, d)).status).toBe("pending");
    await expect(h.as("karthik", "select boardroom_set_role($1, $2, 'member')", [t.ws, U.nirav])).rejects.toThrow(/step down/);
    expect((await h.sup("select role from boardroom_members where user_id = $1 and workspace_id = $2", [U.nirav, t.ws]))[0].role).toBe("founder");
    await vote(h, "karthik", d); // re-voting alone changes nothing
    expect((await statusOf(h, d)).status).toBe("pending");
  }, SLOW);

  it("with two founders, unanimity still finalises, and a split vote is contested", async () => {
    const t = await team(h, "karthik", ["nirav"], ["nirav"]);
    const d = await propose(h, "karthik", t);
    await vote(h, "nirav", d, "rejected");
    expect((await statusOf(h, d)).status).toBe("contested");
    await vote(h, "nirav", d, "approved");
    expect(await statusOf(h, d)).toEqual({ status: "final", outcome: "approved" });
  }, SLOW);

  it("a founder may step down themselves, and that alone cannot finalise anything", async () => {
    const t = await team(h, "karthik", ["nirav"], ["nirav"]);
    const d = await propose(h, "karthik", t);
    await h.as("nirav", "select boardroom_set_role($1, $2, 'member')", [t.ws, U.nirav]);
    expect((await h.sup("select role from boardroom_members where user_id = $1 and workspace_id = $2", [U.nirav, t.ws]))[0].role).toBe("member");
    expect((await statusOf(h, d)).status).toBe("pending");
    await vote(h, "karthik", d); // now the only founder
    expect((await statusOf(h, d)).status).toBe("pending");
  }, SLOW);

  it("a single-founder workspace never satisfies unanimous approval, and says why", async () => {
    const t = await team(h, "sol", ["tom"]);
    const d = await propose(h, "sol", t, "Solo call");
    expect((await statusOf(h, d)).status).toBe("pending");
    await vote(h, "sol", d);
    expect((await statusOf(h, d)).status).toBe("pending");
    const sys = await h.sup("select content from boardroom_messages where thread_id = $1 and system_kind = 'decision_needs_founders'", [t.thread]);
    expect(sys.length).toBeGreaterThan(0);
    expect(sys[0].content).toMatch(/at least two founders/);
    await expect(h.as("sol", "select boardroom_set_role($1, $2, 'member')", [t.ws, U.sol])).rejects.toThrow(/at least one founder/);
    // Adding a second founder does not finalise it; that founder must vote too.
    await promote(h, t.ws, ["sol"], "tom");
    expect((await statusOf(h, d)).status).toBe("pending");
    await vote(h, "tom", d);
    expect((await statusOf(h, d)).status).toBe("final");
  }, SLOW);

  it("a role change re-evaluates pending decisions", async () => {
    const t = await team(h, "eve", ["mia", "ivy"], ["mia", "ivy"]);
    const d = await propose(h, "eve", t);
    await vote(h, "mia", d);
    expect((await statusOf(h, d)).status).toBe("pending"); // ivy has not voted
    await h.as("ivy", "select boardroom_set_role($1, $2, 'member')", [t.ws, U.ivy]);
    expect(await statusOf(h, d)).toEqual({ status: "final", outcome: "approved" });
  }, SLOW);

  it("a demoted founder's earlier vote no longer counts", async () => {
    const t = await team(h, "mia", ["nirav", "ivy"], ["nirav", "ivy"]);
    const d = await propose(h, "mia", t);
    await vote(h, "ivy", d);
    await h.as("ivy", "select boardroom_set_role($1, $2, 'member')", [t.ws, U.ivy]);
    expect((await statusOf(h, d)).status).toBe("pending"); // mia + ivy(stale) is not mia + nirav
    await vote(h, "nirav", d);
    expect((await statusOf(h, d)).status).toBe("final");
  }, SLOW);

  it("promoting a member raises the bar: the new founder must vote too", async () => {
    const t = await team(h, "nirav", ["mia"]);
    await promote(h, t.ws, ["nirav"], "mia");
    const d = await propose(h, "nirav", t);
    expect((await statusOf(h, d)).status).toBe("pending");
    await vote(h, "mia", d);
    expect((await statusOf(h, d)).status).toBe("final");
  }, SLOW);

  it("role changes validate their target and do not log no-ops", async () => {
    const t = await team(h, "sol", ["tom"]);
    await expect(h.as("sol", "select boardroom_set_role($1, $2, 'founder')", [t.ws, U.zed])).rejects.toThrow(/not in this workspace/);
    await expect(h.as("sol", "select boardroom_set_role($1, $2, 'owner')", [t.ws, U.tom])).rejects.toThrow(/unknown role/);
    await expect(h.as("tom", "select boardroom_set_role($1, $2, 'founder')", [t.ws, U.tom])).rejects.toThrow(/only a founder/);
    const before = (await h.sup("select count(*)::int c from boardroom_audit_log where workspace_id = $1 and action = 'role_changed'", [t.ws]))[0].c;
    await h.as("sol", "select boardroom_set_role($1, $2, 'member')", [t.ws, U.tom]); // already a member
    expect((await h.sup("select count(*)::int c from boardroom_audit_log where workspace_id = $1 and action = 'role_changed'", [t.ws]))[0].c).toBe(before);
  }, SLOW);

  it("role changes and votes are serialised by a per-workspace lock", async () => {
    // A second concurrent connection is not available in this harness, so the
    // interleaving itself is not exercised; this guards that every governance
    // path takes the lock first, in the same order, so they cannot deadlock.
    const defs = await h.sup(
      `select p.proname, pg_get_functiondef(p.oid) as def from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('boardroom_set_role', 'boardroom_vote_decision', 'boardroom_propose_decision',
                            'boardroom_evaluate_decision', 'boardroom_reevaluate_workspace')`,
    );
    expect(defs.map((d) => d.proname).sort()).toEqual([
      "boardroom_evaluate_decision", "boardroom_propose_decision", "boardroom_reevaluate_workspace",
      "boardroom_set_role", "boardroom_vote_decision",
    ]);
    for (const d of defs) expect(d.def, d.proname).toMatch(/boardroom_lock_workspace/);
  });

  it("a founder deleting their account re-evaluates, and workspace deletion still cascades", async () => {
    const t = await team(h, "tom", ["mia", "ivy"], ["mia", "ivy"]);
    const d = await propose(h, "tom", t);
    await vote(h, "mia", d);
    expect((await statusOf(h, d)).status).toBe("pending"); // ivy has not voted
    await h.sup("delete from auth.users where id = $1", [U.ivy]);
    expect((await statusOf(h, d)).status).toBe("final");
    const d2 = await propose(h, "tom", t, "Another");
    expect((await statusOf(h, d2)).status).toBe("pending");
    await h.sup("delete from boardroom_workspaces where id = $1", [t.ws]);
    expect((await h.sup("select count(*)::int c from boardroom_decisions where workspace_id = $1", [t.ws]))[0].c).toBe(0);
  }, SLOW);
});

/* ===================================================================== H3 */
describe("H3: the Boardroom is allowlisted and bounded on the server", () => {
  let h;
  beforeAll(async () => {
    h = await bootBoardroomDb();
  }, SLOW);

  const limit = async (name) => (await h.sup("select boardroom_limit($1) as n", [name]))[0].n;

  it("a signed-in user who is not allowlisted cannot create a workspace", async () => {
    await expect(h.as("zed", "select boardroom_create_workspace('Mine', 'Zed')")).rejects.toThrow(/invite-only/);
    expect((await h.sup("select count(*)::int c from boardroom_workspaces"))[0].c).toBe(0);
  });

  it("nor join one, and the refusal is the same whether or not the code is real", async () => {
    const t = await team(h, "karthik", []);
    const wrong = await h.as("zed", "select boardroom_join_workspace('NOTACODE00000', 'Zed')").catch((e) => e.message);
    const right = await h.as("zed", "select boardroom_join_workspace($1, 'Zed')", [t.code]).catch((e) => e.message);
    expect(String(wrong)).toMatch(/invite-only/);
    expect(String(right)).toBe(String(wrong));
    expect((await h.sup("select count(*)::int c from boardroom_members where user_id = $1", [U.zed]))[0].c).toBe(0);
  });

  it("refusals are understandable and leak no schema detail", async () => {
    const msg = await h.as("zed", "select boardroom_create_workspace('Mine', 'Zed')").catch((e) => e.message);
    expect(msg).not.toMatch(/boardroom_|violates|relation|constraint|permission denied/i);
    expect(msg.length).toBeGreaterThan(20);
  });

  it("allowlisted users create and join as before", async () => {
    const t = await team(h, "karthik", ["nirav"]);
    expect((await h.rows("nirav", "select count(*)::int c from boardroom_members where workspace_id = $1", [t.ws]))[0].c).toBe(2);
  });

  it("nobody can read or edit the allowlist from the client, including to add themselves", async () => {
    for (const user of ["zed", "karthik"]) {
      await expect(h.as(user, "select * from boardroom_allowed_users")).rejects.toThrow(/permission denied/);
      await expect(h.as(user, "insert into boardroom_allowed_users (user_id) values ($1)", [U[user]])).rejects.toThrow(/permission denied/);
      await expect(h.as(user, "update boardroom_allowed_users set note = 'x'")).rejects.toThrow(/permission denied/);
      await expect(h.as(user, "delete from boardroom_allowed_users")).rejects.toThrow(/permission denied/);
    }
    await expect(h.asAnon("select * from boardroom_allowed_users")).rejects.toThrow(/permission denied/);
    await expect(h.as("zed", "select boardroom_create_workspace('Mine', 'Zed')")).rejects.toThrow(/invite-only/);
  });

  it("no client-callable function can add to the allowlist", async () => {
    const fns = await h.sup(
      `select p.proname from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.prosrc ~* '(insert\\s+into|update|delete\\s+from)\\s+public\\.boardroom_allowed_users'
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')`,
    );
    expect(fns).toEqual([]);
  });

  it("removing someone from the allowlist cuts off access they already had", async () => {
    const t = await team(h, "sol", ["nirav"]);
    const own = (await h.rows("nirav", "select boardroom_post_message($1, 'hello') id", [t.thread]))[0].id;
    await h.as("nirav", "select boardroom_edit_message($1, 'edited while allowed')", [own]);
    await h.sup("delete from boardroom_allowed_users where user_id = $1", [U.nirav]);
    await expect(h.as("nirav", "select boardroom_edit_message($1, 'edited after removal')", [own])).rejects.toThrow(/your own/);
    expect(await h.rows("nirav", "select id from boardroom_workspaces")).toHaveLength(0); // from every workspace he was in
    expect(await h.rows("nirav", "select id from boardroom_messages")).toHaveLength(0);
    await expect(h.as("nirav", "select boardroom_post_message($1, 'still here?')", [t.thread])).rejects.toThrow(/not found/);
    await expect(h.as("nirav", "insert into boardroom_threads (workspace_id, title) values ($1, 'x')", [t.ws])).rejects.toThrow(/row-level security/);
    await expect(h.as("nirav", "select boardroom_invite_code($1)", [t.ws])).rejects.toThrow(/only a founder/);
    await h.sup("insert into boardroom_allowed_users (user_id) values ($1)", [U.nirav]);
    expect(await h.rows("nirav", "select id from boardroom_workspaces where id = $1", [t.ws])).toHaveLength(1);
  });

  it("limits are defined and sane", async () => {
    for (const name of ["threads", "documents", "versions_per_document", "tasks", "snapshots",
      "attachments_per_message", "attachments_chars", "message_chars", "prompt_chars", "context_chars",
      "manifest_chars", "document_chars", "mentions"]) {
      const n = await limit(name);
      expect(n, name).toBeGreaterThan(0);
    }
    expect(await limit("no_such_limit")).toBeNull();
  });

  it("threads are capped per workspace", async () => {
    const t = await team(h, "eve", []);
    const cap = await limit("threads");
    await h.sup("alter table boardroom_threads disable trigger user");
    await h.sup("insert into boardroom_threads (workspace_id, title, created_by) select $1, 't' || g, $2 from generate_series(1, $3::int) g", [t.ws, U.eve, cap - 1]); // + the one from team()
    await h.sup("alter table boardroom_threads enable trigger user");
    await expect(h.as("eve", "insert into boardroom_threads (workspace_id, title) values ($1, 'one too many')", [t.ws])).rejects.toThrow(/limit of \d+ discussions/);
    // Another workspace is unaffected.
    const other = await team(h, "mia", []);
    expect(other.thread).toBeTruthy();
  }, SLOW);

  it("thread text sizes are checked with a friendly error", async () => {
    const t = await team(h, "ivy", []);
    await expect(h.as("ivy", "insert into boardroom_threads (workspace_id, title) values ($1, $2)", [t.ws, "x".repeat(161)])).rejects.toThrow(/title is too long/);
    await expect(h.as("ivy", "insert into boardroom_threads (workspace_id, title, problem) values ($1, 'ok', $2)", [t.ws, "x".repeat(4001)])).rejects.toThrow(/description is too long/);
  });

  it("documents, versions and document size are capped", async () => {
    const t = await team(h, "sol", []);
    const docCap = await limit("documents");
    const verCap = await limit("versions_per_document");
    const docChars = await limit("document_chars");
    await h.sup("insert into boardroom_documents (workspace_id, slug, title, owner_id) select $1, 'd' || g, 'Doc', $2 from generate_series(1, $3::int) g", [t.ws, U.sol, docCap - 1]);
    await h.as("sol", "select boardroom_save_document($1, 'last-one', 'Last', 'general', 'text')", [t.ws]); // reaches the cap
    await expect(h.as("sol", "select boardroom_save_document($1, 'one-more', 'More', 'general', 'text')", [t.ws])).rejects.toThrow(/limit of \d+ documents/);
    await h.as("sol", "select boardroom_save_document($1, 'last-one', 'Last', 'general', 'edited')", [t.ws]); // existing doc still saves
    await expect(h.as("sol", "select boardroom_save_document($1, 'last-one', 'Last', 'general', $2)", [t.ws, "x".repeat(docChars + 1)])).rejects.toThrow(/too large/);
    const doc = (await h.sup("select id from boardroom_documents where workspace_id = $1 and slug = 'last-one'", [t.ws]))[0].id;
    await h.sup("insert into boardroom_document_versions (document_id, workspace_id, version, content) select $1, $2, g, 'v' || g from generate_series(3, $3::int) g", [doc, t.ws, verCap]);
    await h.sup("update boardroom_documents set current_version = $2 where id = $1", [doc, verCap]);
    await expect(h.as("sol", "select boardroom_save_document($1, 'last-one', 'Last', 'general', 'newest')", [t.ws])).rejects.toThrow(/limit of \d+ saved versions/);
  }, SLOW);

  it("messages and attachments are capped with friendly errors", async () => {
    const t = await team(h, "tom", ["nirav"]);
    const msgChars = await limit("message_chars");
    const attCount = await limit("attachments_per_message");
    const attChars = await limit("attachments_chars");
    const mentions = await limit("mentions");
    await expect(h.as("tom", "select boardroom_post_message($1, $2)", [t.thread, "x".repeat(msgChars + 1)])).rejects.toThrow(/too long/);
    const okAtt = JSON.stringify([{ document_id: U.tom, title: "Plan" }]);
    await h.as("tom", "select boardroom_post_message($1, 'with attachment', null, '{}'::uuid[], $2::jsonb)", [t.thread, okAtt]);
    const many = JSON.stringify(Array.from({ length: attCount + 1 }, () => ({ document_id: U.tom, title: "x" })));
    await expect(h.as("tom", "select boardroom_post_message($1, 'm', null, '{}'::uuid[], $2::jsonb)", [t.thread, many])).rejects.toThrow(/too many attachments/);
    const huge = JSON.stringify([{ document_id: U.tom, title: "x".repeat(attChars) }]);
    await expect(h.as("tom", "select boardroom_post_message($1, 'm', null, '{}'::uuid[], $2::jsonb)", [t.thread, huge])).rejects.toThrow(/attachments are too large/);
    await expect(h.as("tom", "select boardroom_post_message($1, 'm', null, '{}'::uuid[], '{\"a\":1}'::jsonb)", [t.thread])).rejects.toThrow(/attachments are not valid/);
    const people = Array.from({ length: mentions + 1 }, () => U.nirav);
    await expect(h.as("tom", "select boardroom_post_message($1, 'm', null, $2::uuid[])", [t.thread, people])).rejects.toThrow(/too many people/);
  }, SLOW);

  it("task context and manifest sizes are capped, and the task and snapshot counts too", async () => {
    const t = await team(h, "nirav", ["mia"]);
    const agent = (await h.rows("nirav", "select id from boardroom_agents where workspace_id = $1 and owner_id = $2 limit 1", [t.ws, U.mia]))[0].id;
    const create = (request, ctx, manifest = "{}") =>
      h.as("nirav", "select boardroom_create_tasks($1, array[$2]::uuid[], null, 'independent', $3, $4, $5::jsonb, null, null, 1)", [t.thread, agent, request, ctx, manifest]);
    await expect(create("p", "x".repeat((await limit("context_chars")) + 1))).rejects.toThrow(/context is too large/);
    await expect(create("p", "c", JSON.stringify({ k: "x".repeat(await limit("manifest_chars")) }))).rejects.toThrow(/context is too large/);
    expect((await create("p", "c")).rows).toHaveLength(1);

    // task count: fill the workspace with tasks, then one more is refused
    const snap = (await h.sup("select id from boardroom_context_snapshots where workspace_id = $1 limit 1", [t.ws]))[0].id;
    const taskCap = await limit("tasks");
    await h.sup(
      `insert into boardroom_agent_tasks (workspace_id, thread_id, snapshot_id, mode, prompt, status)
         select $1, $2, $3, 'independent', 'p', 'cancelled' from generate_series(1, $4::int)`,
      [t.ws, t.thread, snap, taskCap],
    );
    await expect(create("p2", "c2")).rejects.toThrow(/limit of \d+ tasks/);

    // snapshot count: a different workspace, full of snapshots
    const t2 = await team(h, "mia", ["ivy"]);
    const agent2 = (await h.rows("mia", "select id from boardroom_agents where workspace_id = $1 and owner_id = $2 limit 1", [t2.ws, U.ivy]))[0].id;
    await h.sup(
      `insert into boardroom_context_snapshots (workspace_id, thread_id, content, content_hash)
         select $1, $2, 'c', 'h' from generate_series(1, $3::int)`,
      [t2.ws, t2.thread, await limit("snapshots")],
    );
    await expect(
      h.as("mia", "select boardroom_create_tasks($1, array[$2]::uuid[], null, 'independent', 'p', 'c', '{}'::jsonb, null, null, 1)", [t2.thread, agent2]),
    ).rejects.toThrow(/limit of \d+ saved contexts/);
  }, SLOW);

  it("the limits do not get in the way of normal use", async () => {
    const t = await team(h, "karthik", ["nirav"]);
    await h.as("karthik", "select boardroom_post_message($1, 'hi', null, $2::uuid[])", [t.thread, [U.nirav]]);
    await h.as("karthik", "select boardroom_save_document($1, 'notes', 'Notes', 'general', 'some text')", [t.ws]);
    expect((await h.rows("nirav", "select content from boardroom_documents_current($1)", [t.ws]))[0].content).toBe("some text");
  });
});

/* ===================================================================== H4 */
describe("H4: authenticated users hold only the table privileges they need", () => {
  let h, tables;
  // What the client genuinely writes directly (everything else goes through functions).
  const INSERT_COLS = {
    boardroom_threads: ["workspace_id", "title", "problem", "category"],
    boardroom_agents: ["workspace_id", "provider", "display_name", "owner_id", "native_url", "role", "instructions", "enabled",
      "context_format", "allowed_modes", "may_review_proposals", "allow_proxy_submit"],
    boardroom_action_items: ["workspace_id", "decision_id", "thread_id", "title", "description", "owner_id", "priority",
      "due_date", "exploratory", "link_url", "created_by"],
    boardroom_action_comments: ["workspace_id", "action_id", "body"],
    boardroom_reactions: ["message_id", "workspace_id", "user_id", "emoji"],
    boardroom_thread_documents: ["thread_id", "document_id", "workspace_id", "attached_by"],
  };
  const UPDATE_COLS = {
    boardroom_threads: ["title", "problem", "category", "status", "pinned", "updated_at"],
    boardroom_agents: ["display_name", "native_url", "role", "instructions", "enabled", "context_format", "allowed_modes",
      "may_review_proposals", "allow_proxy_submit", "updated_at"],
    boardroom_action_items: ["title", "description", "owner_id", "priority", "status", "due_date", "completion_notes", "link_url"],
    boardroom_members: ["display_name", "muted_kinds"],
    boardroom_notifications: ["read_at"],
  };
  const DELETE_TABLES = ["boardroom_reactions", "boardroom_thread_documents"];
  const SELECT_COLS_RESTRICTED = { boardroom_workspaces: ["id", "name", "created_by", "created_at", "governance_restricted"] };
  const NO_CLIENT_ACCESS = ["boardroom_allowed_users"];
  const CLIENT_RPCS = [
    "boardroom_approve_founder", "boardroom_cancel_task", "boardroom_close_founder_request", "boardroom_create_tasks",
    "boardroom_create_workspace", "boardroom_documents_current", "boardroom_fail_task", "boardroom_post_with_tasks",
    "boardroom_request_founder",
    "boardroom_edit_message", "boardroom_invite_code", "boardroom_is_founder", "boardroom_is_member",
    "boardroom_join_workspace", "boardroom_post_message", "boardroom_propose_decision", "boardroom_request_more",
    "boardroom_retry_task", "boardroom_rotate_code", "boardroom_save_document", "boardroom_save_proposal",
    "boardroom_set_proposal_status", "boardroom_set_role", "boardroom_submit_response", "boardroom_task_started",
    "boardroom_vote_decision",
  ];

  const colPrivs = async (role) =>
    h.sup(
      `select c.relname as t, a.attname as col,
              has_column_privilege($1, c.oid, a.attnum, 'SELECT') as sel,
              has_column_privilege($1, c.oid, a.attnum, 'INSERT') as ins,
              has_column_privilege($1, c.oid, a.attnum, 'UPDATE') as upd
         from pg_class c join pg_attribute a on a.attrelid = c.oid
        where c.relnamespace = 'public'::regnamespace and c.relname like 'boardroom\\_%' and c.relkind = 'r'
          and a.attnum > 0 and not a.attisdropped`,
      [role],
    );
  const grouped = (rows, key) => {
    const out = {};
    for (const r of rows) if (r[key]) (out[r.t] ??= []).push(r.col);
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.sort()]));
  };
  const sorted = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v].sort()]));

  beforeAll(async () => {
    h = await bootBoardroomDb();
    tables = (await h.sup("select relname from pg_class where relnamespace = 'public'::regnamespace and relname like 'boardroom\\_%' and relkind = 'r' order by 1")).map((r) => r.relname);
  }, SLOW);

  it("every Boardroom table has row-level security on, and the policy count is the documented one", async () => {
    const off = await h.sup(
      "select relname from pg_class where relnamespace = 'public'::regnamespace and relname like 'boardroom\\_%' and relkind = 'r' and not relrowsecurity",
    );
    expect(off).toEqual([]);
    // 35 policies on 23 tables: WAITINGONLEDGER.md quotes both numbers for the person applying the migration.
    expect(tables).toHaveLength(23);
    expect((await h.sup("select count(*)::int c from pg_policies where tablename like 'boardroom\\_%'"))[0].c).toBe(35);
  });

  it("authenticated users cannot TRUNCATE any Boardroom table, and no rows are lost", async () => {
    const t = await team(h, "karthik", ["nirav"], ["nirav"]);
    await propose(h, "karthik", t);
    const count = async () => Object.fromEntries(await Promise.all(tables.map(async (n) => [n, (await h.sup(`select count(*)::int c from public.${n}`))[0].c])));
    const before = await count();
    expect(tables.length).toBeGreaterThanOrEqual(20);
    for (const name of tables) {
      await expect(h.as("karthik", `truncate table public.${name}`), name).rejects.toThrow(/permission denied/);
      await expect(h.as("karthik", `truncate table public.${name} cascade`), name).rejects.toThrow(/permission denied/);
    }
    expect(await count()).toEqual(before);
    expect(before.boardroom_audit_log).toBeGreaterThan(0);
  }, SLOW);

  it("introspection: no whole-table write, TRUNCATE, REFERENCES or TRIGGER privilege for anon or authenticated", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const priv of ["TRUNCATE", "REFERENCES", "TRIGGER", "INSERT", "UPDATE"]) {
        const bad = await h.sup(
          `select relname from pg_class where relnamespace = 'public'::regnamespace and relname like 'boardroom\\_%' and relkind = 'r'
             and has_table_privilege($1, oid, $2)`,
          [role, priv],
        );
        expect(bad.map((r) => r.relname), `${role} ${priv}`).toEqual([]);
      }
    }
    const del = await h.sup(
      `select relname from pg_class where relnamespace = 'public'::regnamespace and relname like 'boardroom\\_%' and relkind = 'r'
         and has_table_privilege('authenticated', oid, 'DELETE') order by 1`,
    );
    expect(del.map((r) => r.relname)).toEqual(DELETE_TABLES);
    const anonDel = await h.sup(
      `select relname from pg_class where relnamespace = 'public'::regnamespace and relname like 'boardroom\\_%' and relkind = 'r'
         and has_table_privilege('anon', oid, 'DELETE')`,
    );
    expect(anonDel).toEqual([]);
  });

  it("introspection: nothing is granted to PUBLIC on any Boardroom table", async () => {
    const pub = await h.sup(
      `select c.relname from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        where c.relnamespace = 'public'::regnamespace and c.relname like 'boardroom\\_%' and c.relkind = 'r' and acl.grantee = 0`,
    );
    expect(pub).toEqual([]);
  });

  it("introspection: column grants match exactly what the client writes", async () => {
    const auth = await colPrivs("authenticated");
    expect(grouped(auth, "ins")).toEqual(sorted(INSERT_COLS));
    expect(grouped(auth, "upd")).toEqual(sorted(UPDATE_COLS));
    const sel = grouped(auth, "sel");
    for (const name of tables) {
      if (NO_CLIENT_ACCESS.includes(name)) expect(sel[name], name).toBeUndefined();
      else if (SELECT_COLS_RESTRICTED[name]) expect(sel[name], name).toEqual([...SELECT_COLS_RESTRICTED[name]].sort());
      else expect(sel[name]?.length, name).toBeGreaterThan(0);
    }
    const anon = await colPrivs("anon");
    for (const key of ["sel", "ins", "upd"]) expect(grouped(anon, key), `anon ${key}`).toEqual({});
  });

  it("introspection: functions are callable only where intended", async () => {
    const fns = await h.sup(
      `select p.proname,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ok,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ok,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0) as public_ok
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'boardroom\\_%'`,
    );
    expect(fns.length).toBeGreaterThan(CLIENT_RPCS.length);
    expect(fns.filter((f) => f.anon_ok).map((f) => f.proname)).toEqual([]);
    expect(fns.filter((f) => f.public_ok).map((f) => f.proname)).toEqual([]);
    expect(fns.filter((f) => f.auth_ok).map((f) => f.proname).sort()).toEqual([...CLIENT_RPCS].sort());
  });

  it("read access is intact for members and still closed to outsiders", async () => {
    const t = await team(h, "sol", ["nirav"]);
    await h.as("sol", "select boardroom_post_message($1, 'hello')", [t.thread]);
    for (const name of tables) {
      if (NO_CLIENT_ACCESS.includes(name) || SELECT_COLS_RESTRICTED[name] || name === "boardroom_notifications") continue;
      await expect(h.as("nirav", `select * from public.${name}`), name).resolves.toBeTruthy();
      expect(await h.rows("eve", `select * from public.${name} where workspace_id = $1`, [t.ws]), name).toHaveLength(0);
    }
    expect((await h.rows("nirav", "select id from boardroom_messages where thread_id = $1", [t.thread])).length).toBeGreaterThan(0);
    expect((await h.rows("nirav", "select * from boardroom_notifications")).length).toBeGreaterThanOrEqual(0);
  });

  it("the direct writes the client really makes still work", async () => {
    const t = await team(h, "karthik", ["nirav"], ["nirav"]);
    const msg = (await h.rows("karthik", "select boardroom_post_message($1, 'react to me') id", [t.thread]))[0].id;
    // reactions: insert (idempotent, as the client does it) and delete
    const react = "insert into boardroom_reactions (message_id, workspace_id, user_id, emoji) values ($1, $2, $3, 'agree') on conflict (message_id, user_id, emoji) do nothing";
    await h.as("nirav", react, [msg, t.ws, U.nirav]);
    await h.as("nirav", react, [msg, t.ws, U.nirav]);
    expect((await h.rows("karthik", "select count(*)::int c from boardroom_reactions where message_id = $1", [msg]))[0].c).toBe(1);
    await h.as("nirav", "delete from boardroom_reactions where message_id = $1 and user_id = $2 and emoji = 'agree'", [msg, U.nirav]);
    expect((await h.rows("karthik", "select count(*)::int c from boardroom_reactions where message_id = $1", [msg]))[0].c).toBe(0);
    // thread documents: attach (ignore duplicates) and detach
    await h.as("karthik", "select boardroom_save_document($1, 'a.md', 'A', 'general', 'x')", [t.ws]);
    const doc = (await h.rows("karthik", "select id from boardroom_documents where workspace_id = $1", [t.ws]))[0].id;
    const attach = "insert into boardroom_thread_documents (thread_id, document_id, workspace_id, attached_by) values ($1, $2, $3, $4) on conflict (thread_id, document_id) do nothing";
    await h.as("karthik", attach, [t.thread, doc, t.ws, U.karthik]);
    await h.as("karthik", attach, [t.thread, doc, t.ws, U.karthik]);
    expect((await h.rows("nirav", "select count(*)::int c from boardroom_thread_documents where thread_id = $1", [t.thread]))[0].c).toBe(1);
    await h.as("karthik", "delete from boardroom_thread_documents where thread_id = $1 and document_id = $2", [t.thread, doc]);
    // threads, agents, profile, notifications, action comments
    await h.as("karthik", "update boardroom_threads set pinned = true, title = 'Renamed' where id = $1", [t.thread]);
    await h.as("nirav", "update boardroom_agents set instructions = 'be brief' where owner_id = $1 and workspace_id = $2", [U.nirav, t.ws]);
    await h.as("nirav", "update boardroom_members set display_name = 'Nirav K', muted_kinds = array['mention'] where user_id = $1 and workspace_id = $2", [U.nirav, t.ws]);
    await h.as("nirav", "update boardroom_notifications set read_at = now() where user_id = $1", [U.nirav]);
    const dec = await propose(h, "karthik", t);
    await vote(h, "karthik", dec);
    await h.as("karthik", "update boardroom_decisions set title = 'x' where id = $1", [dec]).then(
      () => { throw new Error("decision edited directly"); },
      (e) => expect(e.message).toMatch(/permission denied/),
    );
  }, SLOW);

  it("a repeated reaction by upsert-update is refused rather than silently rewriting a row", async () => {
    const t = await team(h, "tom", ["nirav"]);
    const msg = (await h.rows("tom", "select boardroom_post_message($1, 'x') id", [t.thread]))[0].id;
    await h.as("nirav", "insert into boardroom_reactions (message_id, workspace_id, user_id, emoji) values ($1, $2, $3, 'agree')", [msg, t.ws, U.nirav]);
    await expect(
      h.as("nirav", "insert into boardroom_reactions (message_id, workspace_id, user_id, emoji) values ($1, $2, $3, 'agree') on conflict (message_id, user_id, emoji) do update set emoji = excluded.emoji", [msg, t.ws, U.nirav]),
    ).rejects.toThrow(/permission denied/);
  });

  it("append-only records cannot be altered or removed by clients", async () => {
    const t = await team(h, "karthik", ["nirav"], ["nirav"]);
    await h.as("karthik", "select boardroom_save_document($1, 'v.md', 'V', 'general', 'one')", [t.ws]);
    const agent = (await h.rows("karthik", "select id from boardroom_agents where owner_id = $1 and workspace_id = $2 limit 1", [U.nirav, t.ws]))[0].id;
    await h.as("karthik", "select boardroom_create_tasks($1, array[$2]::uuid[], null, 'independent', 'p', 'c', '{}'::jsonb, null, null, 1)", [t.thread, agent]);
    const dec = await propose(h, "karthik", t);
    await vote(h, "nirav", dec);
    for (const [name, sql] of [
      ["audit log", "update boardroom_audit_log set action = 'forged'"],
      ["audit log delete", "delete from boardroom_audit_log"],
      ["document versions", "update boardroom_document_versions set content = 'tampered'"],
      ["document versions delete", "delete from boardroom_document_versions"],
      ["snapshots", "update boardroom_context_snapshots set content = 'tampered'"],
      ["snapshots delete", "delete from boardroom_context_snapshots"],
      ["message edits", "delete from boardroom_message_edits"],
      ["decisions", "update boardroom_decisions set rationale = 'edited'"],
      ["decisions delete", "delete from boardroom_decisions"],
      ["votes", "update boardroom_decision_votes set vote = 'rejected'"],
      ["votes delete", "delete from boardroom_decision_votes"],
      ["messages delete", "delete from boardroom_messages"],
      ["tasks delete", "delete from boardroom_agent_tasks"],
    ]) {
      await expect(h.as("karthik", sql), name).rejects.toThrow(/permission denied/);
    }
    // The database-side backstops still hold for the table owner.
    await expect(h.sup("update boardroom_document_versions set content = 'tampered'")).rejects.toThrow(/append-only/);
    await expect(h.sup("update boardroom_context_snapshots set content = 'tampered'")).rejects.toThrow(/append-only/);
    await expect(h.sup("update boardroom_decisions set rationale = 'edited' where id = $1", [dec])).rejects.toThrow(/final decision/);
  }, SLOW);
});

/* ===================================================================== M7 */
describe("M7 Concurrency: Document save version collisions and optimistic locking", () => {
  let h, t;
  beforeAll(async () => {
    h = await bootBoardroomDb();
    t = await team(h, "karthik", ["nirav"]);
  }, SLOW);

  it("sequential save with a stale p_expected_version is rejected with SQLSTATE 40001", async () => {
    // 1. Initial document creation at v1
    await h.as("karthik", "select boardroom_save_document($1, 'notes.md', 'Notes', 'general', 'v1 text', false, 0)", [t.ws]);

    // 2. Karthik saves v2 based on v1 (expected_version = 1)
    await h.as("karthik", "select boardroom_save_document($1, 'notes.md', 'Notes', 'general', 'v2 from karthik', false, 1)", [t.ws]);

    // 3. Nirav attempts to save v2 based on stale v1 (expected_version = 1)
    let caught: any;
    try {
      await h.as("nirav", "select boardroom_save_document($1, 'notes.md', 'Notes', 'general', 'v2 from nirav', false, 1)", [t.ws]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.code ?? caught.errcode ?? caught.message).toMatch(/40001|Document version conflict/);
    expect(caught.message).toMatch(/Document version conflict: expected version 1, but current version is 2/);

    // 4. Verify version history is clean: exactly 2 versions, current is v2
    const doc = (await h.rows("karthik", "select current_version from boardroom_documents where workspace_id = $1 and slug = 'notes.md'", [t.ws]))[0];
    expect(doc.current_version).toBe(2);
    const versions = await h.rows("karthik", "select version, content from boardroom_document_versions where workspace_id = $1 order by version", [t.ws]);
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions[1].content).toBe("v2 from karthik");
  });

  it("concurrent/simultaneous saves (Promise.allSettled on the same document) where one succeeds and the conflicting one is safely rejected without corrupting document version history", async () => {
    await h.as("karthik", "select boardroom_save_document($1, 'spec.md', 'Spec', 'general', 'v1 base', false, 0)", [t.ws]);

    // Both try to save against base version 1 simultaneously
    const results = await Promise.allSettled([
      h.as("karthik", "select boardroom_save_document($1, 'spec.md', 'Spec', 'general', 'v2A', false, 1)", [t.ws]),
      h.as("nirav", "select boardroom_save_document($1, 'spec.md', 'Spec', 'general', 'v2B', false, 1)", [t.ws]),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedReason.code ?? rejectedReason.errcode ?? rejectedReason.message).toMatch(/40001|Document version conflict/);

    const doc = (await h.rows("karthik", "select current_version from boardroom_documents where workspace_id = $1 and slug = 'spec.md'", [t.ws]))[0];
    expect(doc.current_version).toBe(2);

    const versions = await h.rows("karthik", "select version, content from boardroom_document_versions where workspace_id = $1 and document_id in (select id from boardroom_documents where workspace_id = $1 and slug = 'spec.md') order by version", [t.ws]);
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it("creating a document with p_expected_version = 0 when slug already exists is rejected", async () => {
    await h.as("karthik", "select boardroom_save_document($1, 'roadmap.md', 'Roadmap', 'general', 'karthik draft', false, 0)", [t.ws]);

    // Nirav tries to create 'roadmap.md' expecting version 0
    let caught: any;
    try {
      await h.as("nirav", "select boardroom_save_document($1, 'roadmap.md', 'Roadmap', 'general', 'nirav draft', false, 0)", [t.ws]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.code ?? caught.errcode ?? caught.message).toMatch(/40001|Document version conflict/);
    expect(caught.message).toMatch(/Document version conflict: expected version 0, but current version is 1/);
  });

  it("saving a non-existent document with p_expected_version > 0 is rejected with SQLSTATE P0002", async () => {
    let caught: any;
    try {
      await h.as("karthik", "select boardroom_save_document($1, 'ghost.md', 'Ghost', 'general', 'content', false, 5)", [t.ws]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.code ?? caught.errcode ?? caught.message).toMatch(/P0002|Document does not exist/);
  });

  it("backward compatibility (save without p_expected_version succeeds)", async () => {
    await h.as("karthik", "select boardroom_save_document($1, 'legacy.md', 'Legacy', 'general', 'v1')", [t.ws]);
    await h.as("karthik", "select boardroom_save_document($1, 'legacy.md', 'Legacy', 'general', 'v2')", [t.ws]);
    const doc = (await h.rows("karthik", "select current_version from boardroom_documents where workspace_id = $1 and slug = 'legacy.md'", [t.ws]))[0];
    expect(doc.current_version).toBe(2);
  });
});

