import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { ReportProblem } from "./ReportProblem";

const rest = (p: string) => `${SUPABASE_URL}/rest/v1/${p}`;

beforeEach(() => mockAuthSession("user-1"));

describe("Report a problem", () => {
  it("sends a reason and optional note for the question", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(rest("question_reports"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithAuth(<ReportProblem questionRef="bank:abc" questionText="What is 2+2?" />, { session: fakeSession() });
    await user.click(screen.getByRole("button", { name: "Report a problem" }));
    await user.click(screen.getByRole("radio", { name: "More than one answer is right" }));
    await user.type(screen.getByRole("textbox"), "B and C both work");
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText(/we'll check it/)).toBeInTheDocument();
    expect(body).toEqual({
      question_ref: "bank:abc",
      reason: "more_than_one_answer",
      note: "B and C both work",
      question_text: "What is 2+2?",
    });
  });

  it("says so when the daily limit is reached", async () => {
    server.use(
      http.post(rest("question_reports"), () =>
        HttpResponse.json({ code: "P0001", message: "question report limit reached" }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    renderWithAuth(<ReportProblem questionRef="gen:qx" questionText="Q" about="explanation" />, { session: fakeSession() });
    await user.click(screen.getByRole("button", { name: /Report a problem with this explanation/ }));
    expect(screen.getByRole("radio", { name: "The explanation is wrong" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText(/a lot of reports today/)).toBeInTheDocument();
  });
});
