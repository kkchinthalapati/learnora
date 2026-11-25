// @ts-nocheck -- a SQL scenario script: rows are untyped query results.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/* Runs the real Boardroom migration in an in-process Postgres (PGlite) with a
 * stand-in for Supabase's auth schema and roles, then drives it as different
 * users. This is what proves the row-level security, the role and state rules
 * and the immutability triggers, which the client-side tests cannot. It is not
 * Supabase itself: the Realtime publication, storage and the hosted auth
 * service are not exercised. */
const MIGRATION = resolve(__dirname, "../../../../supabase/migrations/20261108020000_boardroom.sql");

describe("Boardroom migration (SQL and RLS)", () => {
  it("enforces every access and workflow rule", async () => {
  const db = new PGlite();
const U = {
  karthik: "00000000-0000-0000-0000-00000000000a",
  nirav: "00000000-0000-0000-0000-00000000000b",
  eve: "00000000-0000-0000-0000-00000000000c",
  mia: "00000000-0000-0000-0000-00000000000d",
};

// ---- stand-in for the parts of Supabase the migration relies on
await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  insert into auth.users values ('${U.karthik}'), ('${U.nirav}'), ('${U.eve}'), ('${U.mia}');
`);
try {
  await db.exec("create publication supabase_realtime;");
} catch (e) {
  // PGlite has no Realtime publication; the migration then skips that step.
}
await db.exec(readFileSync(MIGRATION, "utf8"));
// The activation step the project owner runs by hand (see the migration header):
// everyone here is allowlisted. The allowlist itself is tested in
// boardroom.hardening.sql.test.ts, where a non-allowlisted user exists.
for (const id of Object.values(U)) await db.query("insert into public.boardroom_allowed_users (user_id) values ($1)", [id]);

let pass = 0;
const failures = [];
function ok(cond, name, extra = "") {
  if (cond) pass += 1;
  else failures.push(`${name} ${extra}`);
}

async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ? U[user] : ""}', false); set role authenticated;`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
async function rows(user, sql, params) {
  return (await as(user, sql, params)).rows;
}
async function denied(user, sql, params, name, pattern = /./) {
  try {
    await as(user, sql, params);
    failures.push(`${name}: expected an error, but it succeeded`);
  } catch (e) {
    if (pattern.test(e.message)) pass += 1;
    else failures.push(`${name}: wrong error "${e.message}"`);
  }
}
const sup = async (sql, params = []) => (await db.query(sql, params)).rows;

// ---------------------------------------------------------------- workspace
const [{ boardroom_create_workspace: WS }] = await rows("karthik", "select boardroom_create_workspace('Boardroom', 'Karthik')");
ok(!!WS, "karthik creates workspace");
let r = await rows("karthik", "select role from boardroom_members where workspace_id=$1", [WS]);
ok(r.length === 1 && r[0].role === "founder", "creator is founder");
r = await rows("karthik", "select display_name, owner_id from boardroom_agents where workspace_id=$1 order by display_name", [WS]);
ok(r.map((x) => x.display_name).join() === "ChatGPT (Karthik),Claude (Karthik)", "two agents seeded", JSON.stringify(r));

// an outsider sees nothing and cannot act
for (const t of ["boardroom_workspaces", "boardroom_members", "boardroom_agents"]) {
  ok((await rows("eve", `select ${t === "boardroom_workspaces" ? "id, name" : "*"} from ${t}`)).length === 0, `outsider reads 0 rows of ${t}`);
}
await denied("nirav", "select boardroom_invite_code($1)", [WS], "non-member cannot read invite code", /only a founder/);
await denied("nirav", "select boardroom_join_workspace('WRONGCODE', 'Nirav')", [], "bad code rejected", /invite code/);
const [{ boardroom_invite_code: CODE }] = await rows("karthik", "select boardroom_invite_code($1)", [WS]);
await as("nirav", "select boardroom_join_workspace($1, 'Nirav')", [CODE]);
r = await rows("nirav", "select role from boardroom_members where user_id=$1", [U.nirav]);
ok(r[0]?.role === "member", "joiner starts as member");
r = await rows("nirav", "select display_name from boardroom_agents where workspace_id=$1 order by display_name", [WS]);
ok(r.length === 4 && r.some((x) => x.display_name === "Claude (Nirav)"), "four profiles after join", JSON.stringify(r));
await denied("nirav", "select boardroom_invite_code($1)", [WS], "member cannot see invite code", /only a founder/);
await denied("nirav", "select boardroom_set_role($1,$2,'founder')", [WS, U.nirav], "member cannot promote self", /only a founder/);
await as("karthik", "select boardroom_request_founder($1,$2)", [WS, U.nirav]); // sole founder: one approval is unanimous
r = await rows("nirav", "select role from boardroom_members where user_id=$1", [U.nirav]);
ok(r[0].role === "founder", "founder promotes the other founder");
await denied("karthik", "update boardroom_members set role='member' where user_id=$1", [U.karthik], "role column not directly writable", /permission denied/);

// ------------------------------------------------------------- threads/messages
const [{ id: T }] = await rows("karthik", "insert into boardroom_threads (workspace_id,title,problem,category) values ($1,'Supabase to Firebase?','Usage limit ran out','engineering') returning id", [WS]);
ok(!!T, "member creates thread");
r = await rows("karthik", "select created_by from boardroom_threads where id=$1", [T]);
ok(r[0].created_by === U.karthik, "created_by comes from the session");
await denied("karthik", "insert into boardroom_threads (workspace_id,title,created_by) values ($1,'x',$2)", [WS, U.nirav], "cannot spoof created_by", /permission denied/);
await denied("eve", "insert into boardroom_threads (workspace_id,title) values ($1,'intruder')", [WS], "outsider cannot create thread", /row-level security|violates/);
ok((await rows("eve", "select * from boardroom_threads")).length === 0, "outsider sees no threads");

await denied("karthik", "insert into boardroom_messages (workspace_id,thread_id,author_type,author_id,content) values ($1,$2,'human',$3,'direct')", [WS, T, U.karthik], "no direct message inserts", /permission denied/);
await denied("eve", "select boardroom_post_message($1,'hello')", [T], "outsider cannot post", /not found/);
const [{ boardroom_post_message: M1 }] = await rows("karthik", "select boardroom_post_message($1, $2, null, $3::uuid[])", [T, "@Claude (Nirav), thoughts on Firebase?", [U.nirav]]);
ok(!!M1, "post message");
let n = await rows("nirav", "select kind, title from boardroom_notifications where kind = 'mention'");
ok(n.length === 1 && n[0].kind === "mention", "mentioned human is notified", JSON.stringify(n));
ok((await rows("karthik", "select * from boardroom_notifications where kind='mention'")).length === 0, "author is not notified of own message");
await denied("karthik", "select boardroom_post_message($1, '   ')", [T], "empty message refused", /empty/);

// edits
await as("karthik", "select boardroom_edit_message($1, 'Revised question')", [M1]);
r = await rows("nirav", "select content, status from boardroom_messages where id=$1", [M1]);
ok(r[0].content === "Revised question" && r[0].status === "edited", "edit applies");
r = await rows("nirav", "select previous_content from boardroom_message_edits where message_id=$1", [M1]);
ok(r.length === 1 && r[0].previous_content.startsWith("@Claude"), "edit history keeps the original");
await denied("nirav", "select boardroom_edit_message($1, 'hijack')", [M1], "cannot edit another's message", /your own/);
await denied("nirav", "update boardroom_messages set content='x' where id=$1", [M1], "no direct message update", /permission denied/);

// ------------------------------------------------------------------ relay
const agents = await rows("karthik", "select id, display_name, owner_id from boardroom_agents where workspace_id=$1", [WS]);
const claudeNirav = agents.find((a) => a.display_name === "Claude (Nirav)");
const chatgptKarthik = agents.find((a) => a.display_name === "ChatGPT (Karthik)");
const manifest = { documents: [], decisions: [], messages: { count: 1 } };
const [{ boardroom_post_message: MT }] = await rows("karthik", "select boardroom_post_message($1, $2)", [T, "@Claude (Nirav) @ChatGPT (Karthik) what do you think of Firebase?"]);
const create = (user, agent, mode = "independent", trigger = MT, snap = null) =>
  rows(user, "select boardroom_create_tasks($1, array[$2]::uuid[], $3, $4, '', $5, $6::jsonb, $7, null, 1) ids", [T, agent, trigger, mode, "CONTEXT TEXT", JSON.stringify(manifest), snap]);
const K1 = (await create("karthik", claudeNirav.id))[0].ids[0];
let t = await rows("nirav", "select * from boardroom_agent_tasks where id=$1", [K1]);
ok(t[0].status === "awaiting_owner" && t[0].owner_id === U.nirav && t[0].created_by === U.karthik, "task: awaiting owner, owner=Nirav, creator=Karthik");
const snapRow = await rows("karthik", "select content_hash, content from boardroom_context_snapshots where id=$1", [t[0].snapshot_id]);
const expectHash = (await sup("select encode(sha256(convert_to('CONTEXT TEXT','UTF8')),'hex') h"))[0].h;
ok(snapRow[0].content_hash === expectHash, "snapshot hash is computed server-side");
const K1b = (await create("karthik", claudeNirav.id))[0].ids[0];
ok(K1b === K1, "same mention + profile is idempotent");
ok((await sup("select count(*)::int c from boardroom_agent_tasks"))[0].c === 1, "no duplicate task row");
const K2 = (await create("karthik", chatgptKarthik.id, "independent", MT, t[0].snapshot_id))[0].ids[0];
ok((await sup("select snapshot_id from boardroom_agent_tasks where id=$1", [K2]))[0].snapshot_id === t[0].snapshot_id, "two profiles share one snapshot");
const sys = await rows("karthik", "select author_type, system_kind from boardroom_messages where thread_id=$1 and author_type='system'", [T]);
ok(sys.length === 2 && sys.every((s) => s.system_kind === "task_created"), "system messages record the tasks, separate from AI answers");
ok((await rows("karthik", "select * from boardroom_messages where author_type='ai'")).length === 0, "no AI message before a human submits");
n = await rows("nirav", "select kind from boardroom_notifications where kind='task_awaiting_owner'");
ok(n.length === 1, "account owner notified");
await denied("eve", "select boardroom_create_tasks($1,array[$2]::uuid[],null,'independent','p','c','{}'::jsonb,null,null,1)", [T, claudeNirav.id], "outsider cannot create task", /not found/);
await denied("karthik", "select boardroom_create_tasks($1,array[$2]::uuid[],null,'not_a_mode','p','c','{}'::jsonb,null,null,1)", [T, claudeNirav.id], "bad mode refused", /unknown task type/);
await denied("nirav", "update boardroom_agent_tasks set status='published' where id=$1", [K1], "no direct task writes", /permission denied/);

// disabled / permission-limited profiles
await as("nirav", "update boardroom_agents set enabled=false where id=$1", [claudeNirav.id]);
await denied("karthik", "select boardroom_create_tasks($1,array[$2]::uuid[],null,'independent','p','c','{}'::jsonb,null,null,1)", [T, claudeNirav.id], "disabled profile cannot get a task", /switched off/);
await as("nirav", "update boardroom_agents set enabled=true, allowed_modes=array['independent'] where id=$1", [claudeNirav.id]);
await denied("karthik", "select boardroom_create_tasks($1,array[$2]::uuid[],null,'code_review','p','c','{}'::jsonb,null,null,1)", [T, claudeNirav.id], "profile limited to some tasks", /not allowed/);
await as("nirav", "update boardroom_agents set allowed_modes=array['independent','cross_examination','response_to_agent','research_critique','final_synthesis','decision_review','implementation_plan','code_review'] where id=$1", [claudeNirav.id]);

// agent profile editing rights
r = await as("karthik", "update boardroom_agents set instructions='sneaky' where id=$1", [claudeNirav.id]);
ok(r.affectedRows === 0, "cannot edit someone else's AI profile");
await denied("nirav", "update boardroom_agents set owner_id=$1 where id=$2", [U.karthik, claudeNirav.id], "owner_id not editable", /permission denied/);
await denied("nirav", "update boardroom_agents set native_url='http://insecure.example' where id=$1", [claudeNirav.id], "native_url must be https", /violates|check/);
r = await as("nirav", "update boardroom_agents set instructions='Be terse' where id=$1", [claudeNirav.id]);
ok(r.affectedRows === 1, "owner edits own profile");

// submission
await denied("karthik", "select boardroom_submit_response($1, 'forged answer')", [K1], "non-owner cannot submit", /only .* can submit/);
await denied("eve", "select boardroom_submit_response($1, 'forged answer')", [K1], "outsider cannot submit", /not found/);
await denied("nirav", "select boardroom_submit_response($1, '   ')", [K1], "empty response refused", /empty/);
await denied("nirav", "select boardroom_submit_response($1, $2)", [K1, "x".repeat(60001)], "huge response refused", /60,000|violates/);
const answer = "  Stay on Supabase.\n\n- <b>Reason</b>  ";
const [{ boardroom_submit_response: AI1 }] = await rows("nirav", "select boardroom_submit_response($1, $2)", [K1, answer]);
let m = await rows("karthik", "select * from boardroom_messages where id=$1", [AI1]);
ok(m[0].content === answer, "response stored byte for byte");
ok(m[0].author_type === "ai" && m[0].agent_id === claudeNirav.id && m[0].submitted_by === U.nirav && m[0].author_id === null, "attribution: profile + submitter, no human author");
ok(m[0].source_task_id === K1 && m[0].reply_to === MT && /Round 1/.test(m[0].round_label), "linked to task and trigger");
t = await rows("karthik", "select status, response_message_id, submitted_at from boardroom_agent_tasks where id=$1", [K1]);
ok(t[0].status === "published" && t[0].response_message_id === AI1 && t[0].submitted_at, "task published");
await denied("nirav", "select boardroom_submit_response($1, 'again')", [K1], "second submission refused", /already submitted/);
n = await rows("karthik", "select kind from boardroom_notifications where kind='response_submitted'");
ok(n.length === 1, "other participants notified of the response");
ok((await rows("nirav", "select * from boardroom_notifications where kind='response_submitted'")).length === 0, "submitter not notified of own submission");
await denied("nirav", "update boardroom_messages set content='rewritten' where id=$1", [AI1], "AI message cannot be rewritten", /permission denied/);
await denied("nirav", "select boardroom_edit_message($1,'rewritten')", [AI1], "AI message cannot be edited", /your own/);
const aud = await rows("karthik", "select action from boardroom_audit_log where entity_id=$1", [K1]);
ok(aud.some((a) => a.action === "response_submitted") && aud.some((a) => a.action === "task_created"), "audit trail has both events", JSON.stringify(aud));

// duplicate paste for same profile in same thread
const [{ boardroom_post_message: M2 }] = await rows("karthik", "select boardroom_post_message($1,'@Claude (Nirav) @ChatGPT (Karthik) Another round please')", [T]);
const K3 = (await create("karthik", claudeNirav.id, "cross_examination", M2))[0].ids[0];
await denied("nirav", "select boardroom_submit_response($1, $2)", [K3, answer], "identical text refused for same profile", /exact response/);
await as("nirav", "select boardroom_cancel_task($1)", [K3]);
await denied("nirav", "select boardroom_submit_response($1, 'late')", [K3], "cancelled task takes no response", /cancelled/);
await denied("karthik", "select boardroom_retry_task($1)", [K3], "a cancelled task is not retried; ask again", /only a failed task/);
// a failed task, with the owner's reason, goes back to the owner on retry
const K4 = (await create("karthik", chatgptKarthik.id, "cross_examination", M2))[0].ids[0];
await as("karthik", "select boardroom_fail_task($1, 'ChatGPT usage limit reached')", [K4]);
await denied("mia", "select boardroom_retry_task($1)", [K4], "an outsider cannot retry", /not found/);
await as("karthik", "select boardroom_retry_task($1)", [K4]);
t = await rows("karthik", "select status, attempt, error from boardroom_agent_tasks where id=$1", [K4]);
ok(t[0].status === "awaiting_owner" && t[0].attempt === 2 && t[0].error === null, "failed task can be retried", JSON.stringify(t));

// snapshots are immutable
await denied("karthik", "update boardroom_context_snapshots set content='changed'", [], "snapshot not writable by clients", /permission denied/);
await db.exec("reset role");
try { await db.exec("update boardroom_context_snapshots set content='changed'"); failures.push("snapshot trigger did not block owner update"); } catch (e) { pass += 1; }

// -------------------------------------------------------------- documents
const [{ boardroom_save_document: D1 }] = await rows("karthik", "select boardroom_save_document($1,'ARCH.md','Architecture','architecture','v1 text')", [WS]);
await as("nirav", "select boardroom_save_document($1,'ARCH.md','Architecture','architecture','v2 text')", [WS]);
await as("nirav", "select boardroom_save_document($1,'ARCH.md','Architecture','architecture','v2 text')", [WS]);
r = await rows("karthik", "select version from boardroom_document_versions where document_id=$1 order by version", [D1]);
ok(r.map((x) => x.version).join() === "1,2", "edits append versions; unchanged text adds none", JSON.stringify(r));
r = await rows("karthik", "select content, current_version from boardroom_documents_current($1)", [WS]);
ok(r[0].content === "v2 text" && r[0].current_version === 2, "current document text");
ok((await rows("eve", "select * from boardroom_documents_current($1)", [WS])).length === 0, "outsider gets no documents");
await denied("karthik", "update boardroom_document_versions set content='tampered'", [], "versions not writable", /permission denied/);
await db.exec("reset role");
try { await db.exec("update boardroom_document_versions set content='tampered'"); failures.push("version trigger did not block"); } catch { pass += 1; }
await denied("eve", "select boardroom_save_document($1,'X.md','x','general','x')", [WS], "outsider cannot save document", /not allowed/);

// ------------------------------------------------------ proposals/decisions
const [{ boardroom_save_proposal: P1 }] = await rows("karthik", "select boardroom_save_proposal(null,$1,$2,$3::jsonb)", [WS, T, JSON.stringify({ title: "Move to Firebase", problem: "limits" })]);
await as("karthik", "select boardroom_set_proposal_status($1,'under_review')", [P1]);
await denied("karthik", "select boardroom_set_proposal_status($1,'approved')", [P1], "proposal cannot be approved by status change", /cannot go from/);
await as("nirav", "select boardroom_set_proposal_status($1,'awaiting_founders')", [P1]);
await denied("karthik", "select boardroom_save_proposal($1,$2,$3,'{\"title\":\"edit\"}'::jsonb)", [P1, WS, T], "proposal locked once with founders", /cannot be edited/);
// Mia joins as a plain member
await as("mia", "select boardroom_join_workspace($1,'Mia')", [CODE]);
await denied("mia", "select boardroom_propose_decision($1,$2,'T','approved','why','','','',null,null)", [T, P1], "non-founder cannot record a decision", /only a founder/);
const [{ boardroom_propose_decision: DEC1 }] = await rows("karthik", "select boardroom_propose_decision($1,$2,'Move to Firebase','approved','Cheaper','a','b','c',$3,null)", [T, P1, U.nirav]);
let dec = await rows("karthik", "select status, outcome from boardroom_decisions where id=$1", [DEC1]);
ok(dec[0].status === "pending", "one founder's vote does not finalise a decision", JSON.stringify(dec));
await denied("mia", "select boardroom_vote_decision($1,'approved')", [DEC1], "non-founder cannot vote", /only a founder/);
await denied("eve", "select boardroom_vote_decision($1,'approved')", [DEC1], "outsider cannot vote", /only a founder/);
await as("nirav", "select boardroom_vote_decision($1,'rejected','too risky')", [DEC1]);
dec = await rows("karthik", "select status from boardroom_decisions where id=$1", [DEC1]);
ok(dec[0].status === "contested", "disagreeing founders: contested, not averaged");
ok((await rows("karthik", "select * from boardroom_messages where system_kind='decision_contested'")).length === 1, "contest recorded in the thread");
r = await rows("karthik", "select status from boardroom_proposals where id=$1", [P1]);
ok(r[0].status === "awaiting_founders", "proposal untouched while contested");
await as("nirav", "select boardroom_vote_decision($1,'approved','convinced')", [DEC1]);
dec = await rows("karthik", "select status, outcome, decided_at from boardroom_decisions where id=$1", [DEC1]);
ok(dec[0].status === "final" && dec[0].outcome === "approved" && dec[0].decided_at, "unanimous: final");
r = await rows("karthik", "select status from boardroom_proposals where id=$1", [P1]);
ok(r[0].status === "approved", "proposal approved only through the decision");
await denied("karthik", "select boardroom_vote_decision($1,'rejected')", [DEC1], "final decision cannot be re-voted", /already final/);
await denied("karthik", "update boardroom_decisions set rationale='edited'", [], "decision not writable by clients", /permission denied/);
await db.exec("reset role");
try { await db.exec("update boardroom_decisions set rationale='edited' where id='" + DEC1 + "'"); failures.push("decision immutability trigger did not block"); } catch (e) { pass += 1; }
ok((await rows("mia", "select * from boardroom_decisions")).length === 1, "plain member can read decisions");
// supersede
const [{ boardroom_propose_decision: DEC2 }] = await rows("karthik", "select boardroom_propose_decision($1,null,'Stay on Supabase','approved','New facts','','','',null,$2)", [T, DEC1]);
await as("nirav", "select boardroom_vote_decision($1,'approved')", [DEC2]);
r = await rows("karthik", "select id, status from boardroom_decisions order by created_at");
ok(r.find((x) => x.id === DEC1).status === "superseded" && r.find((x) => x.id === DEC2).status === "final", "superseding decision replaces, never edits, the old one");
await denied("karthik", "select boardroom_propose_decision($1,null,'x','approved','why','','','',null,$2)", [T, DEC1], "cannot supersede a non-final decision", /final decision/);

// request-more
const [{ boardroom_save_proposal: P2 }] = await rows("karthik", "select boardroom_save_proposal(null,$1,$2,$3::jsonb)", [WS, T, JSON.stringify({ title: "Second" })]);
await as("karthik", "select boardroom_request_more($1,'more_evidence','need numbers')", [P2]);
r = await rows("karthik", "select status from boardroom_proposals where id=$1", [P2]);
ok(r[0].status === "under_review", "request more evidence reopens review");
await denied("mia", "select boardroom_request_more($1,'another_round','')", [P2], "member cannot request more", /only a founder/);

// ------------------------------------------------------------- action items
const A = (user, decision, extra = {}) =>
  rows(user, "insert into boardroom_action_items (workspace_id, decision_id, title, owner_id, exploratory) values ($1,$2,$3,$4,$5) returning id", [WS, decision, extra.title ?? "Do it", extra.owner ?? null, !!extra.exploratory]);
const [{ id: ACT1 }] = await A("nirav", DEC2, { owner: U.karthik });
ok(!!ACT1, "task from a final approved decision");
n = await rows("karthik", "select kind from boardroom_notifications where kind='task_assigned'");
ok(n.length === 1, "assignee notified");
const [{ boardroom_propose_decision: DEC3 }] = await rows("karthik", "select boardroom_propose_decision($1,null,'Pending one','approved','why','','','',null,null)", [T]);
await denied("nirav", "insert into boardroom_action_items (workspace_id, decision_id, title) values ($1,$2,'early')", [WS, DEC3], "no tasks from an unapproved decision", /final, approved/);
await denied("mia", "insert into boardroom_action_items (workspace_id, title, exploratory) values ($1,'explore',true)", [WS], "member cannot request exploratory work", /founder/);
await denied("nirav", "insert into boardroom_action_items (workspace_id, title) values ($1,'orphan')", [WS], "task needs a decision or exploratory flag", /violates|check/);
await denied("nirav", "insert into boardroom_action_items (workspace_id, decision_id, title, owner_id) values ($1,$2,'bad owner',$3)", [WS, DEC2, U.eve], "assignee must be a member", /not in this workspace/);
await denied("nirav", "insert into boardroom_action_items (workspace_id, decision_id, title, created_by) values ($1,$2,'spoof',$3)", [WS, DEC2, U.karthik], "created_by cannot be spoofed", /row-level security/);
r = await as("karthik", "update boardroom_action_items set status='done', completion_notes='shipped' where id=$1", [ACT1]);
r = await rows("karthik", "select status, completed_at from boardroom_action_items where id=$1", [ACT1]);
ok(r[0].status === "done" && r[0].completed_at, "completion stamped");
ok((await rows("karthik", "select * from boardroom_audit_log where action='action_updated'")).length >= 1, "status change audited");
ok((await rows("eve", "select * from boardroom_action_items")).length === 0, "outsider sees no tasks");
await as("mia", "insert into boardroom_action_comments (workspace_id, action_id, body) values ($1,$2,'looks good')", [WS, ACT1]);
await denied("eve", "insert into boardroom_action_comments (workspace_id, action_id, body) values ($1,$2,'hi')", [WS, ACT1], "outsider cannot comment", /row-level security/);

// ------------------------------------------------------------ notifications
r = await as("karthik", "update boardroom_notifications set read_at=now() where user_id=$1", [U.nirav]);
ok(r.affectedRows === 0, "cannot mark someone else's notification read");
await denied("karthik", "update boardroom_notifications set title='phish' where user_id=$1", [U.karthik], "notification text not writable", /permission denied/);
await denied("karthik", "insert into boardroom_notifications (workspace_id,user_id,kind,title) values ($1,$2,'x','fake')", [WS, U.karthik], "no forged notifications", /permission denied/);
r = await as("karthik", "update boardroom_notifications set read_at=now() where user_id=$1", [U.karthik]);
ok(r.affectedRows > 0, "mark own notifications read");
await as("karthik", "update boardroom_members set muted_kinds=array['mention'] where user_id=$1", [U.karthik]);
await as("nirav", "select boardroom_post_message($1,'ping @Karthik',null,$2::uuid[])", [T, [U.karthik]]);
n = await rows("karthik", "select * from boardroom_notifications where kind='mention' and title like 'Nirav%'");
ok(n.length === 0, "muted notification kinds are respected");

// --------------------------------------------------------------- audit/reactions
await denied("karthik", "insert into boardroom_audit_log (workspace_id, action, entity_type) values ($1,'x','y')", [WS], "audit log append-only for clients", /permission denied/);
ok((await rows("eve", "select * from boardroom_audit_log")).length === 0, "outsider cannot read audit log");
await as("nirav", "insert into boardroom_reactions (message_id, workspace_id, emoji) values ($1,$2,'agree')", [AI1, WS]);
await denied("eve", "insert into boardroom_reactions (message_id, workspace_id, emoji) values ($1,$2,'agree')", [AI1, WS], "outsider cannot react", /row-level security/);

// ------------------------------------------------------- workspace isolation
const [{ boardroom_create_workspace: WS2 }] = await rows("eve", "select boardroom_create_workspace('Eve Co','Eve')");
ok((await rows("karthik", "select id, name from boardroom_workspaces where id=$1", [WS2])).length === 0, "other workspace invisible");
await denied("karthik", "select boardroom_post_message($1,'cross-workspace')", [(await rows("eve", "insert into boardroom_threads (workspace_id,title) values ($1,'secret') returning id", [WS2]))[0].id], "cannot post into another workspace's thread", /not found/);
await denied("karthik", "select boardroom_create_tasks($1,array[$2]::uuid[],null,'independent','p','c','{}'::jsonb,null,null,1)", [T, (await rows("eve", "select id from boardroom_agents limit 1"))[0].id], "cannot use another workspace's AI profile", /not found/);

// ----------------------------------------------- account deletion keeps history
await db.exec("reset role");
try { await db.exec(`delete from auth.users where id = '${U.nirav}'`); } catch (e) { failures.push("account deletion failed: " + e.message); }
m = await sup("select author_type, agent_id, submitted_by, content from boardroom_messages where id=$1", [AI1]);
ok(m.length === 1 && m[0].content === answer, "AI answer survives deletion of its submitter's account", JSON.stringify(m));
ok((await sup("select count(*)::int c from boardroom_decisions"))[0].c === 3, "decision history survives account deletion");

console.log(`\n${pass} checks passed, ${failures.length} failed`);

  expect(failures).toEqual([]);
  expect(pass).toBeGreaterThan(100);
  await db.close();
  }, 120_000);
});
