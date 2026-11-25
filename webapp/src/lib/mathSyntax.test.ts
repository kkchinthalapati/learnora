import { describe, expect, it } from "vitest";
import { repairDoubledCommands, splitMath } from "./mathSyntax";

describe("repairDoubledCommands", () => {
  it("reads two backslashes before a known command as one", () => {
    expect(repairDoubledCommands("I = \\\\dfrac{12\\\\text{ V}}{4\\ \\\\Omega}")).toBe(
      "I = \\dfrac{12\\text{ V}}{4\\ \\Omega}",
    );
  });

  it("repairs a command at the very start", () => {
    expect(repairDoubledCommands("\\\\frac{1}{2}")).toBe("\\frac{1}{2}");
  });

  it("leaves a real line break alone", () => {
    const aligned = "a &= b \\\\ c &= d";
    expect(repairDoubledCommands(aligned)).toBe(aligned);
    /* A break followed by a command is three backslashes. */
    const broken = "x \\\\\\frac{1}{2}";
    expect(repairDoubledCommands(broken)).toBe(broken);
  });

  it("leaves a break before letters that only start like a command", () => {
    /* Short names are never repaired: this could be a row break, then p·i. */
    expect(repairDoubledCommands("a\\\\pi")).toBe("a\\\\pi");
    expect(repairDoubledCommands("1\\\\textbook")).toBe("1\\\\textbook");
  });

  it("leaves correct TeX untouched", () => {
    expect(repairDoubledCommands("\\dfrac{1}{2}\\Omega")).toBe("\\dfrac{1}{2}\\Omega");
  });
});

describe("splitMath with doubly escaped maths", () => {
  it("hands the renderer the repaired equation", () => {
    const parts = splitMath("Current: $I = \\\\dfrac{V}{R}$ amps");
    expect(parts).toEqual([
      { kind: "text", value: "Current: " },
      { kind: "math", value: "I = \\dfrac{V}{R}", display: false },
      { kind: "text", value: " amps" },
    ]);
  });
});
