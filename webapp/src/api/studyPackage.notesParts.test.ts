import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { MAX_PDF_CHARS } from "../lib/pdfText";
import { generateNotes, notesPartInstruction } from "./studyPackage";
import type { Material } from "./types";

const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;
const MATERIAL = { id: "m1", title: "Long chapter", folder_id: null } as unknown as Material;

/* A source past one request's worth: 2.5 parts of distinct paragraphs, so
   each request can be checked for the paragraphs it was given. */
const paragraph = (n: number) => `Section ${n}: ${"the content of this section ".repeat(30)}`;
const LONG = Array.from({ length: Math.ceil((MAX_PDF_CHARS * 2.5) / 850) }, (_, n) => paragraph(n)).join("\n\n");

function servePrompts(reply: (prompt: string, call: number) => Response) {
  const prompts: string[] = [];
  server.use(
    http.post(EDGE_URL, async ({ request }) => {
      const { history } = (await request.json()) as { history: { content: string }[] };
      prompts.push(history[0].content);
      return reply(history[0].content, prompts.length);
    }),
  );
  return prompts;
}

const notesFor = (call: number) => `### Part ${call} notes\n\nNotes written from part ${call} of the chapter, long enough to count.`;

describe("generateNotes for a long source", () => {
  beforeEach(() => mockAuthSession("user-1"));

  it("leaves a short source as one request with an unchanged prompt", async () => {
    const prompts = servePrompts((_, call) => HttpResponse.json({ text: notesFor(call) }));
    await generateNotes({ material: MATERIAL, source: { inlineText: "Short material." }, settings: DEFAULT_SETTINGS, persist: false });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).not.toContain("part 1 of");
  });

  it("writes every part in order and joins them, each request within one part's size", async () => {
    const seen: string[] = [];
    const prompts = servePrompts((_, call) => HttpResponse.json({ text: notesFor(call) }));
    const md = await generateNotes({
      material: MATERIAL,
      source: { inlineText: LONG },
      settings: DEFAULT_SETTINGS,
      persist: false,
      onPart: (part, of) => seen.push(`${part}/${of}`),
    });

    expect(seen).toEqual(["1/3", "2/3", "3/3"]);
    expect(prompts).toHaveLength(3);
    for (const prompt of prompts) expect(prompt.length).toBeLessThan(MAX_PDF_CHARS + 6000);
    expect(prompts[0]).toContain("Section 0:");
    expect(prompts[2]).toContain(`Section ${LONG.split("\n\n").length - 1}:`);
    expect(prompts[1]).toContain("Do not write a ## title");
    expect(md).toBe([1, 2, 3].map(notesFor).join("\n\n"));
  });

  it("keeps the parts it wrote and says what is missing when a later part fails", async () => {
    // Keyed by the prompt, not the call count: a failed request is retried.
    servePrompts((prompt, call) =>
      prompt.includes("This is part 2 of 3")
        ? HttpResponse.json({ text: "too short" })
        : HttpResponse.json({ text: notesFor(call) }),
    );
    const md = await generateNotes({ material: MATERIAL, source: { inlineText: LONG }, settings: DEFAULT_SETTINGS, persist: false });
    expect(md.startsWith(notesFor(1))).toBe(true);
    expect(md).toContain("Not covered yet:** the notes for part 2 of 3");
    expect(md).not.toContain("Part 3 notes");
  });

  it("fails as before when the first part fails", async () => {
    servePrompts(() => HttpResponse.json({ text: "too short" }));
    await expect(
      generateNotes({ material: MATERIAL, source: { inlineText: LONG }, settings: DEFAULT_SETTINGS, persist: false }),
    ).rejects.toThrow();
  });
});

describe("notesPartInstruction", () => {
  it("adds nothing for a single part", () => {
    expect(notesPartInstruction(1, 1)).toBe("");
  });
});

describe("a drawing for notes that came back without one", () => {
  beforeEach(() => mockAuthSession("user-1"));

  const longNote = [
    "## Photosynthesis",
    "",
    "### The light-dependent stage",
    "",
    "The process happens in the thylakoid, in steps that split water and release oxygen. ".repeat(6),
    "",
    "### Why it matters",
    "",
    "Food chains start with plants, which is why this matters for every ecosystem. ".repeat(4),
  ].join("\n");
  const SVG = '<svg viewBox="0 0 640 420" xmlns="http://www.w3.org/2000/svg"><title>Light stage</title></svg>';

  it("adds one drawing of the most drawable section, from that section's text", async () => {
    const prompts = servePrompts((prompt) =>
      HttpResponse.json({
        text: prompt.includes("Draw one clear revision diagram") ? `Light stage\n\n\`\`\`svg\n${SVG}\n\`\`\`` : longNote,
      }),
    );
    const md = await generateNotes({ material: MATERIAL, source: { inlineText: "Material." }, settings: DEFAULT_SETTINGS, persist: false });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('"The light-dependent stage"');
    expect(prompts[1]).toContain("split water");
    expect(md.indexOf("```svg")).toBeLessThan(md.indexOf("### Why it matters"));
    expect(md).toContain("<title>Light stage</title>");
  });

  it("bills every part and the drawing as one note", async () => {
    const bodies: { tool?: string; sessionKey?: string }[] = [];
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        const body = (await request.json()) as { tool?: string; sessionKey?: string; history: { content: string }[] };
        bodies.push(body);
        const drawing = body.history[0].content.includes("Draw one clear revision diagram");
        return HttpResponse.json({ text: drawing ? `\`\`\`svg\n${SVG}\n\`\`\`` : longNote });
      }),
    );
    await generateNotes({ material: MATERIAL, source: { inlineText: LONG }, settings: DEFAULT_SETTINGS, persist: false });
    expect(bodies.length).toBe(4);
    expect(new Set(bodies.map((b) => b.tool))).toEqual(new Set(["notes"]));
    const keys = new Set(bodies.map((b) => b.sessionKey));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toMatch(/^notes-[A-Za-z0-9_-]{6,80}$/);

    // A second note is its own unit.
    bodies.length = 0;
    await generateNotes({ material: MATERIAL, source: { inlineText: "Material." }, settings: DEFAULT_SETTINGS, persist: false });
    expect(bodies[0].sessionKey).not.toBe([...keys][0]);
  });

  it("leaves notes that already have a drawing, and keeps notes when the drawing fails", async () => {
    const withDrawing = `${longNote}\n\n\`\`\`svg\n${SVG}\n\`\`\``;
    let prompts = servePrompts(() => HttpResponse.json({ text: withDrawing }));
    await generateNotes({ material: MATERIAL, source: { inlineText: "Material." }, settings: DEFAULT_SETTINGS, persist: false });
    expect(prompts).toHaveLength(1);

    prompts = servePrompts((prompt) =>
      prompt.includes("Draw one clear revision diagram")
        ? HttpResponse.json({ error: "over allowance" }, { status: 429 })
        : HttpResponse.json({ text: longNote }),
    );
    const md = await generateNotes({ material: MATERIAL, source: { inlineText: "Material." }, settings: DEFAULT_SETTINGS, persist: false });
    expect(md).toBe(longNote.trim());
  });
});
