import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { server } from "../test/mocks/server";
import { useWebSearch } from "./useWebSearch";

const ENDPOINT = `${SUPABASE_URL}/functions/v1/web-research`;
const searchResult = {
  id: "source-1",
  title: "Newton's laws",
  url: "https://example.edu/newton",
  domain: "example.edu",
  snippet: "Newton described three laws of motion.",
};

describe("useWebSearch", () => {
  beforeEach(() => {
    mockAuthSession("student-1");
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        const body = (await request.json()) as { action: string };
        if (body.action === "extract") {
          return HttpResponse.json({
            title: searchResult.title,
            url: searchResult.url,
            domain: searchResult.domain,
            markdown: "# Newton's laws\n\nFull extracted source text.",
          });
        }
        return HttpResponse.json({ query: "Newton", results: [searchResult] });
      }),
    );
  });

  it("stores search results and imports extracted content", async () => {
    const { result } = renderHook(() => useWebSearch());
    await act(async () => {
      await result.current.search("Newton");
    });
    expect(result.current.results).toEqual([searchResult]);

    let source;
    await act(async () => {
      source = await result.current.importResult(searchResult);
    });
    expect(source).toMatchObject({
      type: "web",
      content: expect.stringContaining("Full extracted source text"),
    });
  });
});
