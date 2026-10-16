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

describe("MisconceptionLedgerCard as Mix-ups (revamp step 3)", () => {
  beforeEach(() => mockAuthSession("user-1"));
  afterEach(() => vi.restoreAllMocks());

  it("lists Fixed first, labels the rest by loop state, and never by severity", async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/misconceptions`, () =>
        HttpResponse.json([
          row({ id: "f", concept: "Strong acids", concept_key: "strong acids", status: "resolved", resolved_at: past, severity: "critical" }),
          row({ id: "r", concept: "Osmosis", concept_key: "osmosis", status: "improving", repaired_at: past, retest_due_at: past }),
          row({ id: "w", concept: "Enzymes", concept_key: "enzymes", status: "improving", repaired_at: past, retest_due_at: future }),
        ]),
      ),
    );
    renderWithAuth(<MisconceptionLedgerCard />, { session: fakeSession() }, { withRouter: true });

    const card = await screen.findByRole("region", { name: "Mistakes you're fixing" });
    const fixedHeading = await within(card).findByRole("heading", { name: "Fixed · 1" });
    const fixingHeading = within(card).getByRole("heading", { name: /^Fixing · / });
    expect(fixedHeading.compareDocumentPosition(fixingHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).getByText("Check-back ready")).toBeInTheDocument();
    expect(within(card).getByText(/^Check /)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Try it · 1 min" })).toBeInTheDocument();
    expect(within(card).queryByText("Blocking")).toBeNull();
    expect(within(card).getByText("How this works")).toBeInTheDocument();
  });
});
