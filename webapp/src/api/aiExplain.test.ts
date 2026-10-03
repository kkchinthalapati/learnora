import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { queryClient } from "../lib/queryClient";

vi.mock("./ai", () => ({ callEdge: vi.fn() }));
import { callEdge } from "./ai";
import { planExplanation } from "./aiExplain";

const mockedCallEdge = vi.mocked(callEdge);
const REST = `${SUPABASE_URL}/rest/v1`;

const PLAN = JSON.stringify({
  steps: [
    { concept: "Light energy", explanation: "Chlorophyll absorbs light." },
    { concept: "Limiting factors", explanation: "The scarcest input sets the rate." },
  ],
  trap: "",
});

describe("planExplanation grounding", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    mockedCallEdge.mockResolvedValue({ text: PLAN } as Awaited<ReturnType<typeof callEdge>>);
  });
  afterEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it("gives the tutor the student's matching notes and returns them as sources", async () => {
    server.use(
      http.get(`${REST}/materials`, () =>
        HttpResponse.json([
          { id: "m1", user_id: "user-1", folder_id: null, title: "Bioenergetics", type: "pdf", raw_content: null, storage_path: "x", created_at: "" },
        ]),
      ),
      http.get(`${REST}/notes`, () =>
        HttpResponse.json([
          {
            id: "n1",
            user_id: "user-1",
            material_id: "m1",
            markdown_content:
              "The rate of photosynthesis is limited by light intensity, carbon dioxide concentration and temperature. The limiting factor is whichever is in shortest supply.",
            html_content: null,
            created_at: "",
          },
        ]),
      ),
    );

    const trace = await planExplanation("Biology", "limiting factors in photosynthesis");

    const prompt = mockedCallEdge.mock.calls[0][0].history[0].content as string;
    expect(prompt).toContain("FROM THE STUDENT'S OWN NOTES");
    expect(prompt).toContain("light intensity");
    expect(trace.sources).toEqual([
      expect.objectContaining({ materialId: "m1", label: "Bioenergetics (notes), part 1" }),
    ]);
  });

  it("works without notes and adds no sources", async () => {
    const trace = await planExplanation("Biology", "limiting factors in photosynthesis");
    const prompt = mockedCallEdge.mock.calls[0][0].history[0].content as string;
    expect(prompt).not.toContain("FROM THE STUDENT'S OWN NOTES");
    expect(trace.sources).toBeUndefined();
    expect(trace.layers).toHaveLength(2);
  });
});
