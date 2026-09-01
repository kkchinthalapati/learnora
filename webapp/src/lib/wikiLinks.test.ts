import { describe, it, expect } from "vitest";
import { extractWikiLinks, formatWikiLink, resolveWikiLink } from "./wikiLinks";

describe("wikiLinks", () => {
  it("extracts simple wiki links", () => {
    const text = "Review [[Calculus]] and [[Linear Algebra]] before tomorrow.";
    const links = extractWikiLinks(text);

    expect(links).toHaveLength(2);
    expect(links[0].target).toBe("Calculus");
    expect(links[0].raw).toBe("[[Calculus]]");
    expect(links[1].target).toBe("Linear Algebra");
  });

  it("extracts wiki links with aliases", () => {
    const text = "See [[Machine Learning|ML]] for details.";
    const links = extractWikiLinks(text);

    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("Machine Learning");
    expect(links[0].alias).toBe("ML");
  });

  it("handles empty or invalid strings", () => {
    expect(extractWikiLinks("")).toEqual([]);
    expect(extractWikiLinks("[[]]")).toEqual([]);
    expect(extractWikiLinks("No brackets here")).toEqual([]);
  });

  it("formats wiki links correctly", () => {
    expect(formatWikiLink("Physics")).toBe("[[Physics]]");
    expect(formatWikiLink("Physics", "Mechanics")).toBe(
      "[[Physics|Mechanics]]",
    );
    expect(formatWikiLink("Physics", "Physics")).toBe("[[Physics]]");
    expect(formatWikiLink("")).toBe("");
  });

  it("resolves links to matching folders", () => {
    const resolved = resolveWikiLink("Physics 101", {
      folders: [{ id: "f-123", name: "Physics 101" }],
    });
    expect(resolved).toEqual({
      type: "folder",
      id: "f-123",
      title: "Physics 101",
      url: "/folders/f-123",
    });
  });

  it("resolves links to matching notes", () => {
    const resolved = resolveWikiLink("Derivatives Notes", {
      notes: [
        { id: "n-456", material_id: "m-789", title: "Derivatives Notes" },
      ],
    });
    expect(resolved).toEqual({
      type: "note",
      id: "n-456",
      title: "Derivatives Notes",
      url: "/notes/m-789",
    });
  });

  it("falls back to concept term on unknown target", () => {
    const resolved = resolveWikiLink("Thermodynamics", {});
    expect(resolved).toEqual({
      type: "concept",
      id: "thermodynamics",
      title: "Thermodynamics",
      url: "/graph",
    });
  });
});
