import { describe, expect, it } from "vitest";
import {
  activeMentionQuery,
  agentTarget,
  humanTarget,
  parseMentions,
  resolveAmbiguous,
  suggestMentions,
} from "./mentions";
import { agents, members } from "./fixtures";

describe("parseMentions", () => {
  it("resolves a full AI profile handle to exactly that profile", () => {
    const r = parseMentions("@Claude (Nirav), my usage limit ran out. Supabase to Firebase?", agents, members);
    expect(r.mentions.map((m) => m.target.id)).toEqual(["a-cn"]);
    expect(r.ambiguous).toEqual([]);
  });

  it("makes one mention per profile for two profiles in one message", () => {
    const r = parseMentions("@Claude (Nirav) @ChatGPT (Karthik) thoughts?", agents, members);
    expect(r.mentions.map((m) => m.target.id)).toEqual(["a-cn", "a-gk"]);
  });

  it("flags a bare provider name as ambiguous rather than guessing", () => {
    const r = parseMentions("@Claude what do you think", agents, members);
    expect(r.mentions).toEqual([]);
    expect(r.ambiguous).toHaveLength(1);
    expect(r.ambiguous[0].candidates.map((c) => c.id).sort()).toEqual(["a-ck", "a-cn"]);
  });

  it("treats a bare provider name as unambiguous when only one profile exists", () => {
    const one = agents.filter((a) => a.id !== "a-cn");
    const r = parseMentions("@Claude help", one, members);
    expect(r.mentions.map((m) => m.target.id)).toEqual(["a-ck"]);
  });

  it("resolves humans and is case-insensitive", () => {
    const r = parseMentions("@karthik and @NIRAV please look", agents, members);
    expect(r.mentions.map((m) => [m.target.kind, m.target.id])).toEqual([
      ["human", "u-karthik"],
      ["human", "u-nirav"],
    ]);
  });

  it("ignores a repeated mention instead of creating a second target", () => {
    const r = parseMentions("@Claude (Nirav) first, and again @Claude (Nirav)", agents, members);
    expect(r.mentions).toHaveLength(1);
    expect(r.duplicates).toHaveLength(1);
  });

  it("reports disabled profiles so no task is made for them", () => {
    const off = agents.map((a) => (a.id === "a-gn" ? { ...a, enabled: false } : a));
    const r = parseMentions("@ChatGPT (Nirav) review", off, members);
    expect(r.disabled.map((m) => m.target.id)).toEqual(["a-gn"]);
  });

  it("does not read an email address or unknown handle as a mention", () => {
    const r = parseMentions("mail me at team@karthik.dev or ask @nobody", agents, members);
    expect(r.mentions).toEqual([]);
    expect(r.ambiguous).toEqual([]);
  });

  it("does not match a handle that is only a prefix of a longer word", () => {
    expect(parseMentions("@Karthikeya hi", agents, members).mentions).toEqual([]);
  });
});

describe("resolveAmbiguous", () => {
  it("swaps the bare handle for the chosen profile", () => {
    const text = "@Claude is this wise?";
    const r = parseMentions(text, agents, members);
    const chosen = agentTarget(agents[2], members);
    expect(resolveAmbiguous(text, r.ambiguous[0], chosen)).toBe("@Claude (Nirav) is this wise?");
  });
});

describe("autocomplete", () => {
  it("finds the token under the caret", () => {
    expect(activeMentionQuery("hello @Cla", 10)).toEqual({ start: 6, query: "Cla" });
    expect(activeMentionQuery("hello world", 5)).toBeNull();
    expect(activeMentionQuery("a@b", 3)).toBeNull();
  });

  it("ranks prefix matches before substring matches", () => {
    const targets = [...agents.map((a) => agentTarget(a, members)), ...members.map(humanTarget)];
    const out = suggestMentions("ni", targets).map((t) => t.handle);
    expect(out[0]).toBe("Nirav");
    expect(out).toContain("Claude (Nirav)");
  });

  it("returns nothing when no handle matches", () => {
    expect(suggestMentions("zzz", agents.map((a) => agentTarget(a, members)))).toEqual([]);
  });
});
