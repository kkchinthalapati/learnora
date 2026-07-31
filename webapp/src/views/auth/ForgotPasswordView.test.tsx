import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { renderWithAuth } from "../../test/auth";
import { ForgotPasswordView } from "./ForgotPasswordView";

const RECOVER_URL = `${SUPABASE_URL}/auth/v1/recover`;

function renderForgot() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/forgot-password"]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordView />} />
      </Routes>
    </MemoryRouter>,
    { session: null },
  );
}

describe("ForgotPasswordView", () => {
  it("renders the request form", () => {
    renderForgot();

    expect(
      screen.getByRole("heading", { level: 1, name: "Reset Password" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log In" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("requests a reset link for the trimmed email", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(RECOVER_URL, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      }),
    );

    const user = userEvent.setup();
    renderForgot();

    await user.type(screen.getByLabelText("Email"), " ada@example.com ");
    await user.click(screen.getByRole("button", { name: "Send Reset Link →" }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ email: "ada@example.com" });
  });

  it("confirms without revealing whether the account exists", async () => {
    server.use(http.post(RECOVER_URL, () => HttpResponse.json({})));

    const user = userEvent.setup();
    renderForgot();

    await user.type(screen.getByLabelText("Email"), "nobody@example.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Link →" }));

    /* "If an account exists" — the wording matters, since a definite yes/no
       would make this form an account-enumeration oracle. Found by text rather
       than by role: the always-mounted toast container is also a role="status"
       region, so the role alone is ambiguous. */
    const status = await screen.findByText(/If an account exists/);
    /* Polite, not an alert: nothing went wrong. */
    expect(status).toHaveAttribute("role", "status");
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("reports a rate limit as an alert", async () => {
    server.use(
      http.post(RECOVER_URL, () =>
        HttpResponse.json(
          { error: "over_email_send_rate_limit", message: "Too many requests" },
          { status: 429 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderForgot();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send Reset Link →" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests",
    );
  });
});
