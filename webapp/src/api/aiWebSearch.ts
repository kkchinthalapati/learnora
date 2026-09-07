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

  return callWebResearch<WebSearchResponse>(
    {
      action: "search",
      query: trimmed,
      depth: options.depth ?? 3,
      domain: options.domain,
    },
    options.signal,
  );
}

export async function extractWebContent(
  url: string,
  signal?: AbortSignal,
): Promise<ExtractedWebContent> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Enter a web address to import.");

  return callWebResearch<ExtractedWebContent>(
    { action: "extract", url: trimmed },
    signal,
  );
}
