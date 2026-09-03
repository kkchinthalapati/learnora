import { useCallback, useEffect, useRef, useState } from "react";
import {
  extractWebContent,
  searchWebSources,
  type WebSearchResult,
  type WebSearchResponse,
} from "../api/aiWebSearch";
import type { NotebookSource } from "../types/notebooks";

export type NotebookSourcePayload = Omit<NotebookSource, "id" | "uploadedAt" | "selected">;

/**
 * Transforms a WebSearchResult into a NotebookSource payload suitable for
 * calling notebooksApi.addSource or useNotebook().addSource.
 */
export function webResultToNotebookSourcePayload(
  result: WebSearchResult,
  contentOverride?: string
): NotebookSourcePayload {
  return {
    title: result.title,
    type: "web",
    content: contentOverride || result.snippet,
    url: result.url,
  };
}

/**
 * Asynchronously extracts markdown content from a WebSearchResult's URL
 * and creates a rich NotebookSource payload. Falls back to snippet if extraction fails.
 */
export async function convertWebResultWithExtractedContent(
  result: WebSearchResult
): Promise<NotebookSourcePayload> {
  try {
    const extracted = await extractWebContent(result.url);
    return {
      title: result.title,
      type: "web",
      content: extracted.markdown || result.snippet,
      url: result.url,
    };
  } catch {
    return webResultToNotebookSourcePayload(result);
  }
}

export interface UseWebSearchOptions {
  defaultSubject?: string;
  defaultDomain?: string;
  defaultDepth?: number;
  initialQuery?: string;
  autoSearch?: boolean;
}

export interface UseWebSearchResult {
  query: string;
  setQuery: (q: string) => void;
  results: WebSearchResult[];
  response: WebSearchResponse | null;
  citations: { index: number; title: string; url: string }[];
  summary?: string;
  isLoading: boolean;
  error: string | null;
  search: (
    overrideQuery?: string,
    overrideSubject?: string,
    options?: { depth?: number; domain?: string }
  ) => Promise<WebSearchResponse | null>;
  clear: () => void;
  createNotebookSourcePayload: (
    result: WebSearchResult,
    contentOverride?: string
  ) => NotebookSourcePayload;
}

/**
 * Custom React hook for executing web intelligence queries, tracking search states,
 * and seamlessly exporting citations as notebook sources.
 */
export function useWebSearch(options?: UseWebSearchOptions): UseWebSearchResult {
  const [query, setQuery] = useState(options?.initialQuery ?? "");
  const [results, setResults] = useState<WebSearchResult[]>([]);
  const [response, setResponse] = useState<WebSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialSearchRan = useRef(false);

  const search = useCallback(
    async (
      overrideQuery?: string,
      overrideSubject?: string,
      searchOpts?: { depth?: number; domain?: string }
    ): Promise<WebSearchResponse | null> => {
      const q = (overrideQuery !== undefined ? overrideQuery : query).trim();

      if (overrideQuery !== undefined) {
        setQuery(overrideQuery);
      }

      if (!q) {
        setError("Search query cannot be empty");
        setResults([]);
        setResponse(null);
        setIsLoading(false);
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const subject = overrideSubject ?? options?.defaultSubject;
        const depth = searchOpts?.depth ?? options?.defaultDepth;
        const domain = searchOpts?.domain ?? options?.defaultDomain;

        const res = await searchWebSources(q, subject, { depth, domain });
        setResponse(res);
        setResults(res.results);
        setIsLoading(false);
        return res;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Web search failed";
        setError(errMsg);
        setResults([]);
        setResponse(null);
        setIsLoading(false);
        return null;
      }
    },
    [
      query,
      options?.defaultSubject,
      options?.defaultDepth,
      options?.defaultDomain,
    ]
  );

  const clear = useCallback(() => {
    setQuery("");
    setResults([]);
    setResponse(null);
    setError(null);
    setIsLoading(false);
  }, []);

  const createNotebookSourcePayload = useCallback(
    (result: WebSearchResult, contentOverride?: string): NotebookSourcePayload => {
      return webResultToNotebookSourcePayload(result, contentOverride);
    },
    []
  );

  useEffect(() => {
    if (
      options?.autoSearch &&
      options.initialQuery &&
      options.initialQuery.trim() &&
      !initialSearchRan.current
    ) {
      initialSearchRan.current = true;
      void search(options.initialQuery);
    }
  }, [options?.autoSearch, options?.initialQuery, search]);

  return {
    query,
    setQuery,
    results,
    response,
    citations: response?.citations ?? [],
    summary: response?.summary,
    isLoading,
    error,
    search,
    clear,
    createNotebookSourcePayload,
  };
}
