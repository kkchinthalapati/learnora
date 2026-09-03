import { describe, it, expect } from "vitest";
import {
  searchWebSources,
  extractWebContent,
  parseSearchTokens,
  OFFLINE_FALLBACK_CORPUS,
} from "./aiWebSearch";

describe("aiWebSearch API", () => {
  describe("parseSearchTokens", () => {
    it("tokenizes search query and removes stop words and punctuation", () => {
      const tokens = parseSearchTokens("What is Newton's second law of motion in physics?");
      expect(tokens).toContain("newton");
      expect(tokens).toContain("second");
      expect(tokens).toContain("law");
      expect(tokens).toContain("motion");
      expect(tokens).toContain("physics");
      expect(tokens).not.toContain("what");
      expect(tokens).not.toContain("is");
      expect(tokens).not.toContain("of");
      expect(tokens).not.toContain("in");
    });

    it("handles empty or whitespace query gracefully", () => {
      expect(parseSearchTokens("")).toEqual([]);
      expect(parseSearchTokens("    ")).toEqual([]);
    });
  });

  describe("searchWebSources", () => {
    it("returns relevant results for Physics topic (Newton's laws)", async () => {
      const response = await searchWebSources("Newton laws of motion", "Physics");
      expect(response.query).toBe("Newton laws of motion");
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].title).toContain("Newton");
      expect(response.results[0].domain).toBe("openstax.org");
      expect(response.citations.length).toBe(response.results.length);
      expect(response.citations[0].index).toBe(1);
      expect(response.citations[0].url).toBe(response.results[0].url);
      expect(response.summary).toContain("[1]");
    });

    it("returns relevant results for Chemistry topic (Periodic table)", async () => {
      const response = await searchWebSources("Periodic trends electronegativity", "Chemistry");
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].title).toContain("Periodic");
      expect(response.results[0].domain).toBe("chemguide.co.uk");
    });

    it("returns relevant results for Biology topic (Photosynthesis)", async () => {
      const response = await searchWebSources("Photosynthesis light reactions Calvin cycle", "Biology");
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].title).toContain("Photosynthesis");
      expect(response.results[0].domain).toBe("khanacademy.org");
    });

    it("returns relevant results for Economics topic (Supply and demand)", async () => {
      const response = await searchWebSources("Supply demand market equilibrium elasticity", "Economics");
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].title).toContain("Supply, Demand");
      expect(response.results[0].domain).toBe("investopedia.com");
    });

    it("returns relevant results for Mathematics topic (Calculus derivatives)", async () => {
      const response = await searchWebSources("Calculus derivatives chain rule", "Mathematics");
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].title).toContain("Calculus: Derivatives");
      expect(response.results[0].domain).toBe("khanacademy.org");
    });

    it("returns relevant results for History topic (Industrial Revolution)", async () => {
      const response = await searchWebSources("Industrial revolution steam engine", "History");
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].title).toContain("Industrial Revolution");
      expect(response.results[0].domain).toBe("britannica.com");
    });

    it("respects domain filtering option", async () => {
      const filtered = await searchWebSources("Calculus integration", "Mathematics", {
        domain: "mit.edu",
      });
      expect(filtered.results.length).toBeGreaterThan(0);
      expect(filtered.results.every((r) => r.domain === "mit.edu")).toBe(true);

      const nonExistentDomain = await searchWebSources("Calculus integration", "Mathematics", {
        domain: "nonexistent-university-xyz.edu",
      });
      expect(nonExistentDomain.results).toHaveLength(0);
      expect(nonExistentDomain.citations).toHaveLength(0);
      expect(nonExistentDomain.summary).toContain("No verified sources found");
    });

    it("adjusts result count and snippet formatting based on depth option", async () => {
      // Depth 1: concise
      const depth1 = await searchWebSources("Thermodynamics heat engine", "Physics", {
        depth: 1,
      });
      expect(depth1.results.length).toBeLessThanOrEqual(2);
      expect(depth1.results[0].snippet.endsWith(".")).toBe(true);

      // Depth 5: academic and highlighted
      const depth5 = await searchWebSources("Thermodynamics heat engine", "Physics", {
        depth: 5,
      });
      expect(depth5.results.length).toBeGreaterThanOrEqual(1);
      expect(depth5.results[0].snippet).toContain("[Key Academic Finding]");
    });

    it("generates 1-indexed citations and inline citation links in summary", async () => {
      const res = await searchWebSources("Linear algebra eigenvalues", "Mathematics");
      expect(res.citations.length).toBeGreaterThan(0);
      expect(res.citations[0].index).toBe(1);
      expect(res.citations[0].title).toBeTruthy();
      expect(res.citations[0].url).toBeTruthy();
      if (res.citations.length > 1) {
        expect(res.citations[1].index).toBe(2);
      }
      expect(res.summary).toContain("[1]");
    });

    it("falls back gracefully when query has no direct keyword matches", async () => {
      const res = await searchWebSources("obscure specialized esoteric query 98765", "Biology");
      expect(res.results.length).toBeGreaterThan(0);
      // Fallback returns biology sources
      const biologyUrls = OFFLINE_FALLBACK_CORPUS.filter((a) => a.subject === "Biology").map(
        (a) => a.url
      );
      expect(biologyUrls).toContain(res.results[0].url);
    });

    it("throws a descriptive error when query is empty or only whitespace", async () => {
      await expect(searchWebSources("")).rejects.toThrow("Search query cannot be empty");
      await expect(searchWebSources("   \n\t  ")).rejects.toThrow("Search query cannot be empty");
    });
  });

  describe("extractWebContent", () => {
    it("extracts markdown content and metadata from known offline articles", async () => {
      const knownUrl = "https://openstax.org/books/physics/newtons-laws-of-motion";
      const extracted = await extractWebContent(knownUrl);
      expect(extracted.title).toContain("Newton's Laws of Motion");
      expect(extracted.domain).toBe("openstax.org");
      expect(extracted.markdown).toContain("### 1. First Law (Law of Inertia)");
      expect(extracted.markdown).toContain("\\mathbf{F}_{net} = m\\mathbf{a}");
    });

    it("extracts structured markdown for external URLs outside the offline cache", async () => {
      const externalUrl = "https://stanford.edu/courses/quantum-information-theory";
      const extracted = await extractWebContent(externalUrl);
      expect(extracted.domain).toBe("stanford.edu");
      expect(extracted.title.toLowerCase()).toContain("quantum information theory");
      expect(extracted.markdown).toContain("# Quantum Information Theory");
      expect(extracted.markdown).toContain("stanford.edu");
    });

    it("throws error when URL is empty", async () => {
      await expect(extractWebContent("")).rejects.toThrow("URL cannot be empty");
      await expect(extractWebContent("   ")).rejects.toThrow("URL cannot be empty");
    });

    it("throws error when URL format is invalid", async () => {
      await expect(extractWebContent("not-a-valid-url")).rejects.toThrow("Invalid URL format");
    });

    it("throws error when URL protocol is unsupported (e.g. ftp or javascript)", async () => {
      await expect(extractWebContent("ftp://files.example.com/notes.pdf")).rejects.toThrow(
        "Unsupported protocol"
      );
    });
  });
});
