import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { mockAuthSession, mockNoAuthSession } from "../test/mockSession";
import { SUPABASE_URL } from "../lib/supabase";
import { extractWebContent, searchWebSources } from "./aiWebSearch";

const ENDPOINT = `${SUPABASE_URL}/functions/v1/web-research`;

describe("web research API", () => {
  beforeEach(() => mockAuthSession("student-1"));

  it("sends an authenticated live search request", async () => {
    let requestBody: Record<string, unknown> = {};
    let authorization = "";
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        authorization = request.headers.get("Authorization") ?? "";
        return HttpResponse.json({
          query: "cellular respiration",
          results: [
            {
              id: "1-source",
              title: "Cellular respiration",
              url: "https://openstax.org/books/biology/pages/7-1-energy-in-living-systems",
              domain: "openstax.org",
              snippet: "Cells release energy from glucose.",
              score: 0.92,
            },
          ],
        });
      }),
    );

    const response = await searchWebSources("cellular respiration", {
      depth: 4,
    });

    expect(authorization).toBe("Bearer test-access-token");
    expect(requestBody).toMatchObject({
      action: "search",
      query: "cellular respiration",
      depth: 4,
    });
    expect(response.results[0].domain).toBe("openstax.org");
  });

  it("extracts page text through the server boundary", async () => {
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        const body = (await request.json()) as { action: string };
        expect(body.action).toBe("extract");
        return HttpResponse.json({
          title: "A useful paper",
          url: "https://example.edu/paper",
          domain: "example.edu",
          markdown: "# A useful paper\n\nEvidence from the page.",
        });
      }),
    );

    await expect(
      extractWebContent("https://example.edu/paper"),
    ).resolves.toMatchObject({
      domain: "example.edu",
      markdown: expect.stringContaining("Evidence from the page"),
    });
  });

  it("surfaces provider errors instead of inventing fallback results", async () => {
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json(
          { error: "Live web research is not configured yet." },
          { status: 503 },
        ),
      ),
    );

    await expect(searchWebSources("mitosis")).rejects.toThrow(
      "Live web research is not configured yet.",
    );
  });

  it("requires a signed-in session", async () => {
    mockNoAuthSession();
    await expect(searchWebSources("mitosis")).rejects.toThrow(
      "Please log in to use web research.",
    );
  });
});
