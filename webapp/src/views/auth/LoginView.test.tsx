import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { LoginView } from "./LoginView";

const TOKEN_URL = `${SUPABASE_URL}/auth/v1/token`;

/* Renders the login screen inside a router that also has somewhere to be
   redirected *to*, so the signed-in bounce is observable rather than inferred. */
function renderLogin(
  { session }: { session?: ReturnType<typeof fakeSession> } = {},
  initialEntries: (string | { pathname: string; state: unknown })[] = [
    "/login",
  ],
) {
  return renderWithAuth(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<LoginView />} />
        <Route path="/" element={<h1>Dashboard</h1>} />
        <Route path="/plan" element={<h1>This week's plan</h1>} />
      </Routes>
    </MemoryRouter>,
    { session: session ?? null },
  );
}

describe("LoginView", () => {
  it("renders the sign-in form with its way out to the other two screens", () => {
    renderLogin();

    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Forgot Password?" }),
    ).toHaveAttribute("href", "/forgot-password");
    expect(
      screen.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", "/signup");
  });

  it("signs in with the typed credentials, trimming the email", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(TOKEN_URL, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          access_token: "tok",
          refresh_token: "r",
          expires_in: 3600,
          token_type: "bearer",
          user: { id: "user-1", email: "ada@example.com" },
        });
      }),
    );

    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "  ada@example.com  ");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Log In →" }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      email: "ada@example.com",
      password: "password123",
    });
  });

  it("shows the friendly message for bad credentials, as an alert", async () => {
    server.use(
      http.post(TOKEN_URL, () =>
        HttpResponse.json(
          { error: "invalid_grant", error_description: "Invalid login credentials" },
          { status: 400 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Log In →" }));

    /* role="alert", not just visible text: an error that blocks what the user
       just tried has to be announced, which the vanilla's #auth-status never
       was. */
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Incorrect email or password.");
  });

  it("reveals the password when the toggle is used", async () => {
    const user = userEvent.setup();
    renderLogin();

    const field = screen.getByLabelText("Password");
    expect(field).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(field).toHaveAttribute("type", "password");
  });

  it("bounces an already-signed-in user to the dashboard", () => {
    renderLogin({ session: fakeSession() });

    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("returns a signed-in user to the route the guard sent them from", () => {
    /* The `state.from` ProtectedRoute has been recording since Step 4, finally
       consumed. */
    renderLogin({ session: fakeSession() }, [
      { pathname: "/login", state: { from: { pathname: "/plan" } } },
    ]);

    expect(
      screen.getByRole("heading", { level: 1, name: "This week's plan" }),
    ).toBeInTheDocument();
  });

  it("never bounces back into an auth route", () => {
    /* Guards against the loop where /login redirects to a `from` that is
       itself /signup, which redirects back. */
    renderLogin({ session: fakeSession() }, [
      { pathname: "/login", state: { from: { pathname: "/signup" } } },
    ]);

    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
  });
});
