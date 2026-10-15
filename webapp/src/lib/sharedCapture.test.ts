import { describe, expect, it } from "vitest";
import { sharedText } from "./sharedCapture";

describe("sharedText", () => {
  it("prefers the shared url", () => {
    expect(sharedText({ title: "Video", text: "watch", url: " https://youtu.be/x " })).toBe(
      "https://youtu.be/x",
    );
  });

  it("pulls a link out of a short 'Title https://…' share", () => {
    expect(sharedText({ text: "Krebs cycle explained https://youtu.be/k" })).toBe(
      "https://youtu.be/k",
    );
  });

  it("keeps long shared text whole even when it contains a link", () => {
    const notes = `${"Glycolysis splits glucose. ".repeat(8)}See https://example.com`;
    expect(sharedText({ text: notes })).toBe(notes.trim());
  });

  it("falls back to the title", () => {
    expect(sharedText({ title: " Cell biology " })).toBe("Cell biology");
  });
});
