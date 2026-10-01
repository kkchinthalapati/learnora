import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { createStudySession, loadStudySession, saveStudySession } from "../lib/studySessions";
import { fetchSession, flushSessionPushes } from "./studySessionSync";

const url = `${SUPABASE_URL}/rest/v1/study_session_state`;

beforeEach(() => {
  localStorage.clear();
  mockAuthSession("user-1");
});
afterEach(() => vi.useRealTimers());

describe("study session sync", () => {
  it("pushes a saved session to the server, once per burst of edits", async () => {
    const posts: unknown[] = [];
    server.use(
      http.post(url, async ({ request }) => {
        posts.push(await request.json());
        return HttpResponse.json([], { status: 201 });
      }),
    );
    const s = createStudySession({ objective: "Enzymes", mode: "explain", id: "s-abc12345" });
    saveStudySession(s);
    saveStudySession({ ...s, currentStep: 1 });
    flushSessionPushes();
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ id: "s-abc12345", status: "active", record: { currentStep: 1 } });
  });

  it("reads a session another device saved", async () => {
    const remote = createStudySession({ objective: "Titration", mode: "practice", id: "s-remote01" });
    server.use(http.get(url, () => HttpResponse.json({ record: remote })));
    expect(loadStudySession("s-remote01")).toBeNull();
    expect((await fetchSession("s-remote01"))?.objective).toBe("Titration");
  });
});
