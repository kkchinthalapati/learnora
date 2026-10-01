import { useCallback, useRef, useState } from "react";
import {
  extractWebContent,
  searchWebSources,
  type WebSearchResponse,
  type WebSearchResult,
} from "../api/aiWebSearch";
import type { NotebookSource } from "../types/notebooks";

export type NotebookSourcePayload = Omit<
  NotebookSource,
  "id" | "uploadedAt" | "selected"
>;

export function useWebSearch() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<WebSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const search = useCallback(async (nextQuery: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setQuery(nextQuery);
    setIsLoading(true);
    setError(null);
    try {
      const next = await searchWebSources(nextQuery, {
        signal: controller.signal,
      });
      setResponse(next);
      return next;
    } catch (cause) {
      if (controller.signal.aborted) return null;
      setResponse(null);
      setError(cause instanceof Error ? cause.message : "Web research failed.");
      return null;
    } finally {
      if (requestRef.current === controller) setIsLoading(false);
    }
  }, []);

  const importResult = useCallback(
    async (
      result: WebSearchResult,
    ): Promise<NotebookSourcePayload & { type: "web"; url: string }> => {
      const extracted = await extractWebContent(result.url);
      return {
        title: extracted.title || result.title,
        type: "web",
        content: extracted.markdown,
        url: extracted.url || result.url,
      };
    },
    [],
  );

  return {
    query,
    setQuery,
    results: response?.results ?? [],
    isLoading,
    error,
    search,
    importResult,
  };
}
