import { describe, expect, it } from "vitest";
import { buildPodcastPrompt, parsePodcastScript } from "./podcast";
import { DEFAULT_PODCAST_STYLE, type PodcastStyle } from "../lib/podcastStyle";

const line = (speaker: string, text: string) => ({ speaker, text });
const dialogue = Array.from({ length: 10 }, (_, i) =>
  line(i % 2 ? "student" : "host", `Line ${i + 1} about **rates**.`),
);

describe("parsePodcastScript", () => {
  it("keeps a two-voice dialogue line by line", () => {
    const script = parsePodcastScript(
      JSON.stringify({ title: "Rates", lines: dialogue }),
      "Fallback",
    );
    expect(script?.title).toBe("Rates");
    expect(script?.lines).toHaveLength(10);
    expect(script?.lines[0]).toEqual({
      speaker: "host",
      text: "Line 1 about **rates**.",
    });
  });

  it("refuses a script that is too short or has only one voice", () => {
    expect(
      parsePodcastScript(JSON.stringify({ lines: dialogue.slice(0, 4) }), "x"),
    ).toBeNull();
    expect(
      parsePodcastScript(
        JSON.stringify({
          lines: dialogue.map((l) => ({ ...l, speaker: "host" })),
        }),
        "x",
      ),
    ).toBeNull();
    expect(parsePodcastScript("not json", "x")).toBeNull();
  });

  it("falls back to the lesson name for a missing title", () => {
    expect(
      parsePodcastScript(JSON.stringify({ lines: dialogue }), "Enzymes")?.title,
    ).toBe("Enzymes");
  });
});

describe("buildPodcastPrompt", () => {
  it("fences the notes and carries the learner style when there is one", () => {
    const prompt = buildPodcastPrompt({
      lesson: "Rates",
      notes: "Temperature speeds reactions.",
      level: "GCSE",
      styleLine: "HOW THIS STUDENT LEARNS BEST (Real-world use): …",
    });
    expect(prompt).toContain("Temperature speeds reactions.");
    expect(prompt).toContain("HOW THIS STUDENT LEARNS BEST");
    expect(prompt).toContain("teach from these only");
  });
});

describe("parsePodcastScript with a chosen style", () => {
  const style = (patch: Partial<PodcastStyle>): PodcastStyle => ({ ...DEFAULT_PODCAST_STYLE, ...patch });

  it("keeps a recall break with its answer", () => {
    const lines = [...dialogue, { speaker: "check", text: "Which way does water move?", answer: "Towards the concentrated side." }];
    const script = parsePodcastScript(JSON.stringify({ lines }), "x", style({ recallBreaks: true }));
    expect(script?.lines.at(-1)).toEqual({
      speaker: "check",
      text: "Which way does water move?",
      answer: "Towards the concentrated side.",
    });
  });

  it("drops a recall break with no answer, or when breaks are off", () => {
    const noAnswer = [...dialogue, { speaker: "check", text: "A question?" }];
    expect(parsePodcastScript(JSON.stringify({ lines: noAnswer }), "x", style({}))?.lines.some((l) => l.speaker === "check")).toBe(false);
    const withAnswer = [...dialogue, { speaker: "check", text: "A question?", answer: "Yes." }];
    expect(
      parsePodcastScript(JSON.stringify({ lines: withAnswer }), "x", style({ recallBreaks: false }))?.lines.some(
        (l) => l.speaker === "check",
      ),
    ).toBe(false);
  });

  it("reads a solo episode as one voice, however the reply labelled it", () => {
    const script = parsePodcastScript(JSON.stringify({ lines: dialogue }), "x", style({ format: "solo" }));
    expect(script?.lines.every((l) => l.speaker === "host")).toBe(true);
  });

  it("still needs both voices for a debate", () => {
    const hostOnly = dialogue.map((l) => ({ ...l, speaker: "host" }));
    expect(parsePodcastScript(JSON.stringify({ lines: hostOnly }), "x", style({ format: "debate" }))).toBeNull();
  });

  it("puts the chosen format, focus and breaks in the prompt", () => {
    const prompt = buildPodcastPrompt({
      lesson: "Osmosis",
      notes: "Water moves.",
      level: "GCSE",
      style: style({ format: "debate", focus: "missed" }),
      missed: ["Water potential"],
    });
    expect(prompt).toMatch(/FORMAT \(Debate\)/);
    expect(prompt).toContain("Water potential");
    expect(prompt).toMatch(/RECALL BREAKS/);
    expect(prompt).toContain('"speaker": "check"');
  });
});
