import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { MisconceptionLedgerCard } from "./MisconceptionLedgerCard";

function row(overrides: Record<string, unknown>) {
  return {
    id: "m-1",
    subject: "Biology",
    concept: "Plant respiration",
    concept_key: "plant respiration",
    summary: "Thinks plants only respire at night",
    status: "open",
    severity: "moderate",
    origin_tool: "quiz",
    times_observed: 2,
    times_corrected: 0,
    first_seen_at: "2026-09-20T00:00:00Z",
    last_seen_at: "2026-09-30T00:00:00Z",
    resolved_at: null,
    ...overrides,
  };
}

describe("MisconceptionLedgerCard quick fix", () => {
  beforeEach(() => mockAuthSession("user-1"));
  afterEach(() => vi.restoreAllMocks());

  it("offers a quick fix only for diagnoses the catalogue knows, and opens it inline", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/misconceptions`, () =>
        HttpResponse.json([
          row({}),
          row({ id: "m-2", concept: "Quadratics", concept_key: "quadratics", summary: "Drops the minus sign", subject: "Maths" }),
        ]),
      ),
    );
    renderWithAuth(<MisconceptionLedgerCard />, { session: fakeSession() }, { withRouter: true });

    const fixes = await screen.findAllByRole("button", { name: "Quick fix" });
    expect(fixes).toHaveLength(1);
    await user.click(fixes[0]);
    const repair = screen.getByRole("region", { name: "Common mix-up" });
    expect(within(repair).getByText(/When do the cells of a plant respire/)).toBeInTheDocument();
  });
});
