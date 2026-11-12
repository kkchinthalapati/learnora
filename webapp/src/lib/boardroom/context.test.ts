import { describe, expect, it } from "vitest";
import { assembleContext, DOC_CHAR_BUDGET, keywords, scoreDocuments } from "./context";
import { decision, doc, msg, thread } from "./fixtures";

const name = (m: { author_type: string }) => (m.author_type === "ai" ? "Claude (Nirav)" : "Karthik");

describe("assembleContext", () => {
  const docs = [
    { doc: doc("d1", "LEARNORA_OVERVIEW.md", "overview"), content: "Learnora is a study app." },
    { doc: doc("d2", "ARCHITECTURE.md", "architecture"), content: "Backend is Supabase Postgres with RLS and edge functions." },
    { doc: doc("d3", "DESIGN_SYSTEM.md", "design"), content: "Tokens and teal accent." },
    { doc: doc("d4", "OLD.md", "architecture", { archived: true }), content: "supabase old notes" },
  ];
  const messages = [
    msg("a", "human", "Should we move off Supabase?"),
    msg("bb", "ai", "I think stay."),
    msg("ccc", "human", "Why?"),
  ];
  const run = (over: Partial<Parameters<typeof assembleContext>[0]> = {}) =>
    assembleContext({
      thread,
      messages,
      authorName: name,
      documents: docs,
      attachedIds: new Set(),
      decisions: [],
      mode: "cross_examination",
      ...over,
    });

  it("includes the overview and relevant documents and lists them in the manifest", () => {
    const r = run();
    const slugs = r.manifest.documents.map((d) => d.slug);
    expect(slugs).toContain("LEARNORA_OVERVIEW.md");
    expect(slugs).toContain("ARCHITECTURE.md");
    expect(slugs).not.toContain("DESIGN_SYSTEM.md");
    expect(slugs).not.toContain("OLD.md");
    expect(r.content).toContain("Backend is Supabase Postgres");
    expect(r.manifest.characters).toBe(r.content.length);
  });

  it("always includes an attached document, even an off-topic one", () => {
    const r = run({ attachedIds: new Set(["d3"]), mode: "independent" });
    expect(r.manifest.documents.find((x) => x.id === "d3")?.reason).toMatch(/attached/);
  });

  it("hides AI messages for independent analysis and says so", () => {
    const r = run({ documents: [], mode: "independent" });
    expect(r.content).not.toContain("I think stay.");
    expect(r.manifest.excludedAiMessages).toBe(true);
    expect(r.manifest.messages.count).toBe(2);
  });

  it("lists AI answers as opinions, not inline, for cross-examination", () => {
    const r = run({ documents: [] });
    expect(r.content).not.toContain("I think stay.");
    expect(r.manifest.opinionIds).toEqual(["bb"]);
    expect(r.manifest.excludedAiMessages).toBe(false);
  });

  it("keeps AI messages inline, labelled as AI, for modes without an opinions section", () => {
    const r = run({ documents: [], mode: "implementation_plan" });
    expect(r.content).toContain("[AI] Claude (Nirav): I think stay.");
  });

  it("never includes system events as if they were contributions", () => {
    const r = run({ documents: [], messages: [...messages, msg("s", "system", "Prompt prepared for Claude")] });
    expect(r.content).not.toContain("Prompt prepared");
  });

  it("includes only final decisions", () => {
    const r = run({
      documents: [],
      messages: [],
      mode: "independent",
      decisions: [decision("x"), decision("y", { status: "pending" })],
    });
    expect(r.manifest.decisions.map((d) => d.id)).toEqual(["x"]);
  });

  it("cuts long documents and records the cut", () => {
    const long = { doc: doc("d9", "LONG.md", "architecture"), content: "supabase ".repeat(2000) };
    const r = run({ documents: [long], messages: [], mode: "independent" });
    expect(r.manifest.documents[0].truncated).toBe(true);
    expect(r.content.length).toBeLessThan(DOC_CHAR_BUDGET + 1500);
  });

  it("is deterministic, so snapshots can be compared by hash", () => {
    expect(run().content).toBe(run().content);
  });
});

describe("keywords and scoring", () => {
  it("drops stop words and ranks by frequency", () => {
    expect(keywords("the database and the database migration")).toEqual(["database", "migration"]);
  });

  it("ranks a category-matching document above an unrelated one", () => {
    const scored = scoreDocuments(
      [
        { doc: doc("1", "A", "design"), content: "colour palette" },
        { doc: doc("2", "B", "architecture"), content: "supabase" },
      ],
      thread,
      "supabase firebase",
      new Set(),
    );
    expect(scored[0].doc.id).toBe("2");
  });
});
