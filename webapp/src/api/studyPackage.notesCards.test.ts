import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { generateNotes } from "./studyPackage";
import type { Material } from "./types";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;
const MATERIAL = { id: "m1", title: "Rates", folder_id: null } as unknown as Material;
const NOTES = `## Rates\n\nRate depends on concentration and temperature, and on a catalyst.\n\n\`\`\`openui\nroot = Stack([t])\nt = KeyTerms("Words", [["Rate", "How fast"]])\n\`\`\``;

describe("generateNotes with cards", () => {
  beforeEach(() => mockAuthSession("user-1"));
  afterEach(() => localStorage.setItem("learnora:flag:openUi", "false"));

  it("asks for notes cards when cards are on, and keeps them in the saved Markdown", async () => {
    localStorage.setItem("learnora:flag:openUi", "true");
    let context: unknown;
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        context = ((await request.json()) as { context?: unknown }).context;
        return HttpResponse.json({ text: NOTES });
      }),
    );
    const md = await generateNotes({
      material: MATERIAL,
      source: { inlineText: "Rates of reaction material." },
      settings: DEFAULT_SETTINGS,
      persist: false,
    });
    expect(String(context)).toContain("CARDS IN NOTES");
    expect(String(context)).not.toContain("MiniQuiz(");
    expect(md).toContain("```openui");
  });

  it("sends no card section when cards are off", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ text: NOTES });
      }),
    );
    await generateNotes({
      material: MATERIAL,
      source: { inlineText: "Rates of reaction material." },
      settings: DEFAULT_SETTINGS,
      persist: false,
    });
    expect(body && "context" in body).toBe(false);
  });
});
