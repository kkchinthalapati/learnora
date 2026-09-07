import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { server } from "../../test/mocks/server";
import { renderWithProviders } from "../../test/render";
import { WebSourceImportModal } from "./WebSourceImportModal";

const ENDPOINT = `${SUPABASE_URL}/functions/v1/web-research`;
const webResult = {
  id: "source-1",
  title: "Attention Is All You Need",
  url: "https://arxiv.org/abs/1706.03762",
  domain: "arxiv.org",
  snippet: "The Transformer uses attention instead of recurrence.",
  score: 0.97,
};

describe("WebSourceImportModal", () => {
  beforeEach(() => {
    mockAuthSession("student-1");
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        const body = (await request.json()) as { action: string };
        if (body.action === "extract") {
          return HttpResponse.json({
            title: webResult.title,
            url: webResult.url,
            domain: webResult.domain,
            markdown:
              "# Attention Is All You Need\n\nFull extracted paper text.",
          });
        }
        return HttpResponse.json({ query: "attention", results: [webResult] });
      }),
    );
  });

  it("does not render while closed", () => {
    renderWithProviders(
      <WebSourceImportModal
        open={false}
        onClose={vi.fn()}
        onImport={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows live results returned by the research endpoint", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WebSourceImportModal open onClose={vi.fn()} onImport={vi.fn()} />,
    );

    await user.type(screen.getByRole("textbox"), "attention");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(
      await screen.findByText("Attention Is All You Need ↗"),
    ).toBeInTheDocument();
    expect(screen.getByText("arxiv.org")).toBeInTheDocument();
    expect(screen.getByText("97% query match")).toBeInTheDocument();
  });

  it("imports extracted page text rather than the result snippet", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    renderWithProviders(
      <WebSourceImportModal
        open
        onClose={vi.fn()}
        onImport={onImport}
        defaultQuery="attention"
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Import full source" }),
    );
    expect(onImport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "web",
        content: expect.stringContaining("Full extracted paper text"),
      }),
    );
  });

  it("shows provider failures without fabricated fallback cards", async () => {
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json(
          { error: "Research is unavailable." },
          { status: 503 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <WebSourceImportModal open onClose={vi.fn()} onImport={vi.fn()} />,
    );

    await user.type(screen.getByRole("textbox"), "mitosis");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Research is unavailable.",
    );
    expect(screen.queryByRole("article")).toBeNull();
  });
});
