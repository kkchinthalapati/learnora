// @ts-nocheck -- SQL scenario tests: rows are untyped query results.
import { beforeAll, describe, expect, it } from "vitest";
import { U, bootBoardroomDb, promote, propose, statusOf, team, vote } from "./sqlHarness";

/* Phase 2 governance rules, decided by the founders:
 *   1. a founder may step down voluntarily;  2. no involuntary removal;
 *   3. promoting a member to founder needs EVERY existing active founder;
 *   4. a final decision needs at least two active founders;
 *   5. with fewer, governance is restricted: nothing can become final;
 *   6. no direct database call can skip these rules. */

const SLOW = 120_000;
const roleOf = async (h, ws, user) =>
  (await h.sup("select role from boardroom_members where workspace_id = $1 and user_id = $2", [ws, U[user]]))[0]?.role;
const audit = async (h, ws, action) =>
  (await h.sup("select count(*)::int c from boardroom_audit_log where workspace_id = $1 and action = $2", [ws, action]))[0].c;
const request = (h, user, ws, candidate) => h.rows(user, "select boardroom_request_founder($1, $2) id", [ws, U[candidate]]);

describe("Governance: unanimous promotion, active founders, restricted state", () => {
  let h;
  beforeAll(async () => {
    h = await bootBoardroomDb();
  }, SLOW);

  it("a member becomes a founder only when EVERY founder approves", async () => {
    const t = await team(h, "karthik", ["nirav", "mia"], ["nirav"]);
    const before = async (a) => audit(h, t.ws, a); // making nirav a founder logged these once already
    const [req0, app0, pro0] = [await before("founder_requested"), await before("founder_approved"), await before("founder_promoted")];
    const rid = (await request(h, "karthik", t.ws, "mia"))[0].id;
    expect(await roleOf(h, t.ws, "mia")).toBe("member"); // one of two founders is not enough
    expect((await h.sup("select status from boardroom_founder_requests where id = $1", [rid]))[0].status).toBe("pending");
    await h.as("nirav", "select boardroom_approve_founder($1)", [rid]);
    expect(await roleOf(h, t.ws, "mia")).toBe("founder");
    expect((await h.sup("select status from boardroom_founder_requests where id = $1", [rid]))[0].status).toBe("approved");
    expect(await audit(h, t.ws, "founder_requested")).toBe(req0 + 1);
    expect(await audit(h, t.ws, "founder_approved")).toBe(app0 + 1);
    expect(await audit(h, t.ws, "founder_promoted")).toBe(pro0 + 1);
  }, SLOW);

  it("the old shortcut is closed: set_role cannot promote, for a founder or anyone", async () => {
    const t = await team(h, "sol", ["tom"]);
    await expect(h.as("sol", "select boardroom_set_role($1, $2, 'founder')", [t.ws, U.tom])).rejects.toThrow(/every founder to approve/);
    await expect(h.as("tom", "select boardroom_set_role($1, $2, 'founder')", [t.ws, U.tom])).rejects.toThrow(/only a founder/);
    expect(await roleOf(h, t.ws, "tom")).toBe("member");
  }, SLOW);

  it("with a single founder, one approval is unanimous: that is how a workspace gets its second founder", async () => {
    const t = await team(h, "sol", ["tom"]);
    await request(h, "sol", t.ws, "tom");
    expect(await roleOf(h, t.ws, "tom")).toBe("founder");
  }, SLOW);

  it("only an active founder can ask, approve or close; the candidate, members and outsiders cannot", async () => {
    const t = await team(h, "karthik", ["nirav", "mia", "ivy"], ["nirav"]);
    await expect(request(h, "mia", t.ws, "ivy")).rejects.toThrow(/only a founder/);
    await expect(request(h, "eve", t.ws, "ivy")).rejects.toThrow(/only a founder/);
    const rid = (await request(h, "karthik", t.ws, "mia"))[0].id;
    await expect(h.as("mia", "select boardroom_approve_founder($1)", [rid])).rejects.toThrow(/only a founder/); // the candidate
    await expect(h.as("ivy", "select boardroom_approve_founder($1)", [rid])).rejects.toThrow(/only a founder/);
    await expect(h.as("eve", "select boardroom_approve_founder($1)", [rid])).rejects.toThrow(/only a founder/);
    await expect(h.as("mia", "select boardroom_close_founder_request($1)", [rid])).rejects.toThrow(/only a founder/);
    expect(await roleOf(h, t.ws, "mia")).toBe("member");
  }, SLOW);

  it("a founder cannot approve twice or approve on someone else's behalf, and duplicate requests are refused", async () => {
    const t = await team(h, "karthik", ["nirav", "mia"], ["nirav"]);
    const rid = (await request(h, "karthik", t.ws, "mia"))[0].id;
    await h.as("karthik", "select boardroom_approve_founder($1)", [rid]); // already approved as the requester
    expect((await h.sup("select count(*)::int c from boardroom_founder_approvals where request_id = $1", [rid]))[0].c).toBe(1);
    expect(await roleOf(h, t.ws, "mia")).toBe("member");
    await expect(request(h, "nirav", t.ws, "mia")).rejects.toThrow(/already a pending request/);
    await expect(h.as("karthik", "insert into boardroom_founder_approvals (request_id, user_id, workspace_id) values ($1, $2, $3)", [rid, U.nirav, t.ws]))
      .rejects.toThrow(/permission denied/);
    expect(await roleOf(h, t.ws, "mia")).toBe("member");
  }, SLOW);

  it("any founder can decline a request; a closed request cannot be approved later", async () => {
    const t = await team(h, "karthik", ["nirav", "mia"], ["nirav"]);
    const rid = (await request(h, "karthik", t.ws, "mia"))[0].id;
    await h.as("nirav", "select boardroom_close_founder_request($1)", [rid]);
    await expect(h.as("nirav", "select boardroom_approve_founder($1)", [rid])).rejects.toThrow(/already closed/);
    expect(await roleOf(h, t.ws, "mia")).toBe("member");
    expect(await audit(h, t.ws, "founder_request_closed")).toBe(1);
    await request(h, "karthik", t.ws, "mia"); // a fresh request is allowed
  }, SLOW);

  it("a pending request is re-checked when a founder steps down", async () => {
    const t = await team(h, "karthik", ["nirav", "ivy", "mia"], ["nirav", "ivy"]);
    const rid = (await request(h, "karthik", t.ws, "mia"))[0].id;
    await h.as("nirav", "select boardroom_approve_founder($1)", [rid]);
    expect(await roleOf(h, t.ws, "mia")).toBe("member"); // ivy has not approved
    await h.as("ivy", "select boardroom_set_role($1, $2, 'member')", [t.ws, U.ivy]);
    expect(await roleOf(h, t.ws, "mia")).toBe("founder"); // the remaining founders had both approved
  }, SLOW);

  it("a new founder joins the electorate for decisions that are already open", async () => {
    const t = await team(h, "nirav", ["mia", "tom"], ["mia"]);
    const d = await propose(h, "nirav", t);
    await promote(h, t.ws, ["nirav", "mia"], "tom");
    expect((await statusOf(h, d)).status).toBe("pending"); // tom has not voted
    await vote(h, "mia", d);
    expect((await statusOf(h, d)).status).toBe("pending");
    await vote(h, "tom", d);
    expect((await statusOf(h, d)).status).toBe("final");
  }, SLOW);

  it("restricted state: a workspace with fewer than two active founders cannot finalise anything", async () => {
    const t = await team(h, "sol", ["tom"]);
    const flag = async () => (await h.rows("tom", "select governance_restricted r from boardroom_workspaces where id = $1", [t.ws]))[0].r;
    expect(await flag()).toBe(true); // a new workspace starts restricted
    const d = await propose(h, "sol", t);
    await vote(h, "sol", d);
    expect((await statusOf(h, d)).status).toBe("pending");
    await request(h, "sol", t.ws, "tom");
    expect(await flag()).toBe(false);
    expect(await audit(h, t.ws, "governance_restored")).toBe(1);
    expect((await statusOf(h, d)).status).toBe("pending"); // tom still has to vote
    await h.as("tom", "select boardroom_set_role($1, $2, 'member')", [t.ws, U.tom]); // steps down
    expect(await flag()).toBe(true);
    expect(await audit(h, t.ws, "governance_restricted")).toBe(1);
    await vote(h, "sol", d);
    expect((await statusOf(h, d)).status).toBe("pending");
    const members = await h.rows("sol", "select user_id from boardroom_notifications where kind = 'governance_changed'");
    expect(members.length).toBeGreaterThan(0);
  }, SLOW);

  it("an account taken off the allowlist stops counting as an active founder, and cannot vote", async () => {
    const t = await team(h, "ivy", ["mia"], ["mia"]);
    const d = await propose(h, "ivy", t);
    await h.sup("delete from boardroom_allowed_users where user_id = $1", [U.mia]);
    expect((await h.rows("ivy", "select governance_restricted r from boardroom_workspaces where id = $1", [t.ws]))[0].r).toBe(true);
    await expect(vote(h, "mia", d)).rejects.toThrow(/only a founder/);
    await vote(h, "ivy", d);
    expect((await statusOf(h, d)).status).toBe("pending");
    await h.sup("insert into boardroom_allowed_users (user_id) values ($1)", [U.mia]);
    expect((await h.rows("ivy", "select governance_restricted r from boardroom_workspaces where id = $1", [t.ws]))[0].r).toBe(false);
    await vote(h, "mia", d);
    expect((await statusOf(h, d)).status).toBe("final");
  }, SLOW);

  it("a candidate whose account is not enabled cannot be made a founder", async () => {
    const t = await team(h, "eve", ["mia"]);
    await h.sup("delete from boardroom_allowed_users where user_id = $1", [U.mia]);
    await expect(request(h, "eve", t.ws, "mia")).rejects.toThrow(/not enabled/);
    await h.sup("insert into boardroom_allowed_users (user_id) values ($1) on conflict do nothing", [U.mia]); // leave the fixture as found
  }, SLOW);

  it("there is no way to remove a founder against their will", async () => {
    const t = await team(h, "karthik", ["nirav"], ["nirav"]);
    await expect(h.as("karthik", "select boardroom_set_role($1, $2, 'member')", [t.ws, U.nirav])).rejects.toThrow(/step down/);
    await expect(h.as("karthik", "update boardroom_members set role = 'member' where user_id = $1", [U.nirav])).rejects.toThrow(/permission denied/);
    await expect(h.as("karthik", "delete from boardroom_members where user_id = $1", [U.nirav])).rejects.toThrow(/permission denied/);
    expect(await roleOf(h, t.ws, "nirav")).toBe("founder");
  }, SLOW);

  it("direct table access cannot create, approve or promote", async () => {
    const t = await team(h, "karthik", ["nirav", "mia"], ["nirav"]);
    await expect(h.as("karthik", "insert into boardroom_founder_requests (workspace_id, candidate_id, status) values ($1, $2, 'approved')", [t.ws, U.mia]))
      .rejects.toThrow(/permission denied/);
    const rid = (await request(h, "karthik", t.ws, "mia"))[0].id;
    await expect(h.as("karthik", "update boardroom_founder_requests set status = 'approved' where id = $1", [rid])).rejects.toThrow(/permission denied/);
    await expect(h.as("mia", "update boardroom_members set role = 'founder' where user_id = $1", [U.mia])).rejects.toThrow(/permission denied/);
    expect(await roleOf(h, t.ws, "mia")).toBe("member");
    // the request is visible to members and to no one else
    expect(await h.rows("mia", "select id from boardroom_founder_requests where workspace_id = $1 and status = 'pending'", [t.ws])).toHaveLength(1);
    expect(await h.rows("zed", "select id from boardroom_founder_requests")).toHaveLength(0);
  }, SLOW);

  it("a founder's own account deletion re-checks pending requests and restricts governance", async () => {
    const t = await team(h, "tom", ["sol", "nirav"], ["sol"]);
    const rid = (await request(h, "tom", t.ws, "nirav"))[0].id;
    await h.sup("delete from auth.users where id = $1", [U.sol]);
    expect((await h.sup("select status from boardroom_founder_requests where id = $1", [rid]))[0].status).toBe("approved");
    expect(await roleOf(h, t.ws, "nirav")).toBe("founder");
  }, SLOW);
});
