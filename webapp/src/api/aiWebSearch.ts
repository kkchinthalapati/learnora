import { supabase, SUPABASE_URL } from "../lib/supabase";

const WEB_RESEARCH_URL = `${SUPABASE_URL}/functions/v1/web-research`;

export interface WebSearchResult {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  score?: number;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
}

export interface ExtractedWebContent {
  title: string;
  url: string;
  domain: string;
  markdown: string;
}

export interface WebSearchOptions {
  depth?: 1 | 2 | 3 | 4 | 5;
  domain?: string;
  signal?: AbortSignal;
}

async function callWebResearch<T>(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please log in to use web research.");

  const response = await fetch(WEB_RESEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(20_000),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) {
    throw new Error(
      payload.error || "Web research is temporarily unavailable.",
    );
  }
  return payload;
}

export async function searchWebSources(
  query: string,
  options: WebSearchOptions = {},
): Promise<WebSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Enter a topic or question to search.");
  if (trimmed.length > 400)
    throw new Error("Keep the search under 400 characters.");

  const payload = await callWebResearch<Partial<WebSearchResponse>>(
    {
      action: "search",
      query: trimmed,
      depth: options.depth ?? 3,
      domain: options.domain,
    },
    options.signal,
  );

  /* `as T` above is a claim, not a check, and a 2xx is not a promise that the
     body has the shape this file describes — a stale function revision, a
     gateway that answers 200 with its own JSON, or an action the deployed
     function does not know all produce a well-formed response with no
     `results` in it.

     That used to reach ChatProvider as `undefined`, where `formatWebEvidence`
     calls `.slice(0, 5)` on it *after* the searchWebSources promise has
     already been caught — so the TypeError escaped the "continue without web
     evidence" fallback and the student's answer was replaced, in the
     transcript, by the words "Cannot read properties of undefined (reading
     'slice')". Normalising here keeps that failure where it belongs: no
     sources, and a reply. */
  return {
    query: typeof payload.query === "string" ? payload.query : trimmed,
    results: Array.isArray(payload.results) ? payload.results : [],
  };
}

export async function extractWebContent(
  url: string,
  signal?: AbortSignal,
): Promise<ExtractedWebContent> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Enter a web address to import.");

  const payload = await callWebResearch<Partial<ExtractedWebContent>>(
    { action: "extract", url: trimmed },
    signal,
  );

  /* Same reasoning as searchWebSources. Callers paste `markdown` straight into
     a notebook source and a study package, so an unchecked cast turned an
     unexpected 200 into the literal text "undefined" saved as the student's
     imported page. An empty extraction is a failure worth naming instead. */
  const markdown = typeof payload.markdown === "string" ? payload.markdown : "";
  if (!markdown.trim())
    throw new Error("No readable text was found on that page.");

  return {
    title: typeof payload.title === "string" ? payload.title : trimmed,
    url: typeof payload.url === "string" ? payload.url : trimmed,
    domain: typeof payload.domain === "string" ? payload.domain : "",
    markdown,
  };
}
