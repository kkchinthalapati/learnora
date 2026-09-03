import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useWebSearch,
  webResultToNotebookSourcePayload,
  convertWebResultWithExtractedContent,
} from "./useWebSearch";
import type { WebSearchResult } from "../api/aiWebSearch";

describe("useWebSearch hook", () => {
  const sampleResult: WebSearchResult = {
    id: "phys-newtons-laws",
    title: "Newton's Laws of Motion: Inertia, Force, and Action-Reaction",
    url: "https://openstax.org/books/physics/newtons-laws-of-motion",
    domain: "openstax.org",
    snippet: "Newton's three laws of motion describe the relationship between a body and the forces acting upon it.",
    score: 0.96,
  };

  it("initializes with default empty state", () => {
    const { result } = renderHook(() => useWebSearch());
    expect(result.current.query).toBe("");
    expect(result.current.results).toEqual([]);
    expect(result.current.response).toBeNull();
    expect(result.current.citations).toEqual([]);
    expect(result.current.summary).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("updates query via setQuery", () => {
    const { result } = renderHook(() => useWebSearch());
    act(() => {
      result.current.setQuery("Photosynthesis in plants");
    });
    expect(result.current.query).toBe("Photosynthesis in plants");
  });

  it("triggers search and populates results, summary, and citations", async () => {
    const { result } = renderHook(() =>
      useWebSearch({ defaultSubject: "Physics" })
    );

    await act(async () => {
      await result.current.search("Newton laws of motion");
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.results.length).toBeGreaterThan(0);
    expect(result.current.results[0].title).toContain("Newton");
    expect(result.current.response).not.toBeNull();
    expect(result.current.citations.length).toBe(result.current.results.length);
    expect(result.current.citations[0].index).toBe(1);
    expect(result.current.summary).toContain("[1]");
  });

  it("supports search override parameters (query, subject, domain)", async () => {
    const { result } = renderHook(() => useWebSearch());

    await act(async () => {
      await result.current.search(
        "Calculus integration",
        "Mathematics",
        { domain: "mit.edu" }
      );
    });

    expect(result.current.query).toBe("Calculus integration");
    expect(result.current.results.length).toBeGreaterThan(0);
    expect(result.current.results[0].domain).toBe("mit.edu");
  });

  it("handles error when searching with empty query", async () => {
    const { result } = renderHook(() => useWebSearch());

    await act(async () => {
      const res = await result.current.search("");
      expect(res).toBeNull();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe("Search query cannot be empty");
    expect(result.current.results).toEqual([]);
    expect(result.current.response).toBeNull();
  });

  it("clears state when calling clear()", async () => {
    const { result } = renderHook(() => useWebSearch());

    await act(async () => {
      await result.current.search("Thermodynamics", "Physics");
    });
    expect(result.current.results.length).toBeGreaterThan(0);

    act(() => {
      result.current.clear();
    });

    expect(result.current.query).toBe("");
    expect(result.current.results).toEqual([]);
    expect(result.current.response).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("auto-searches on mount if autoSearch and initialQuery are set", async () => {
    const { result } = renderHook(() =>
      useWebSearch({
        initialQuery: "Periodic table trends",
        defaultSubject: "Chemistry",
        autoSearch: true,
      })
    );

    // Initial render may have triggered the effect
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.results.length).toBeGreaterThan(0);
    expect(result.current.results[0].title).toContain("Periodic");
  });

  describe("Notebook source payload generation", () => {
    it("converts a WebSearchResult into a NotebookSource payload using snippet", () => {
      const { result } = renderHook(() => useWebSearch());

      const payload = result.current.createNotebookSourcePayload(sampleResult);
      expect(payload).toEqual({
        title: sampleResult.title,
        type: "web",
        content: sampleResult.snippet,
        url: sampleResult.url,
      });
    });

    it("allows overriding content when creating notebook source payload", () => {
      const customNotes = "Student note: remember to review third law examples.";
      const payload = webResultToNotebookSourcePayload(sampleResult, customNotes);
      expect(payload).toEqual({
        title: sampleResult.title,
        type: "web",
        content: customNotes,
        url: sampleResult.url,
      });
    });

    it("asynchronously extracts full markdown content when available", async () => {
      const payload = await convertWebResultWithExtractedContent(sampleResult);
      expect(payload.type).toBe("web");
      expect(payload.title).toBe(sampleResult.title);
      expect(payload.url).toBe(sampleResult.url);
      expect(payload.content).toContain("# Newton's Laws of Motion");
      expect(payload.content).toContain("Law of Inertia");
    });
  });
});
