import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { renderWithAuth } from "../../test/auth";
import { SignupView } from "./SignupView";

const SIGNUP_URL = `${SUPABASE_URL}/auth/v1/signup`;

function renderSignup() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/signup"]}>
      <Routes>
        <Route path="/signup" element={<SignupView />} />
      </Routes>
    </MemoryRouter>,
    { session: null },
  );
}

/* An 18th birthday well in the past, derived from the real clock rather than
   hard-coded — a fixed date would start failing the age gate on its own the
   moment "today" moved past it. */
function adultDob(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 20);
  return d.toISOString().slice(0, 10);
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  {
    password = "Password1!",
    confirm = "Password1!",
    dob = adultDob(),
  }: { password?: string; confirm?: string; dob?: string } = {},
) {
  await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Date of birth"), dob);
  await user.type(screen.getByLabelText("Password"), password);
  await user.type(screen.getByLabelText("Confirm password"), confirm);
}

describe("SignupView", () => {
  it("renders every field the vanilla form had", () => {
    renderSignup();

    expect(
      screen.getByRole("heading", { level: 1, name: "Create your account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Date of birth")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(
      screen.getByText("You must be 13 or older to use Learnora"),
    ).toBeInTheDocument();
  });

  it("sends name and dob as user metadata alongside the credentials", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(SIGNUP_URL, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          user: { id: "u1", identities: [{ id: "i1" }] },
          session: null,
        });
      }),
    );

    const user = userEvent.setup();
    renderSignup();
    const dob = adultDob();
    await fillForm(user, { dob });
    await user.click(screen.getByRole("button", { name: "Create Account →" }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      email: "ada@example.com",
      password: "Password1!",
      data: { full_name: "Ada Lovelace", dob },
    });
  });

  it("shows the check-your-inbox state when confirmation is required", async () => {
    server.use(
      http.post(SIGNUP_URL, () =>
        HttpResponse.json({
          user: { id: "u1", identities: [{ id: "i1" }] },
          session: null,
        }),
      ),
    );

    const user = userEvent.setup();
    renderSignup();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Create Account →" }));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Check your email",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    /* The form is gone, not merely disabled — there is nothing left to submit. */
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
  });

  it("refuses a password under 8 characters without calling the API", async () => {
    let called = false;
    server.use(
      http.post(SIGNUP_URL, () => {
        called = true;
        return HttpResponse.json({});
      }),
    );

    const user = userEvent.setup();
    renderSignup();
    await fillForm(user, { password: "short", confirm: "short" });
    await user.click(screen.getByRole("button", { name: "Create Account →" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("at least 8 characters");
    expect(called).toBe(false);
  });

  it("refuses mismatched passwords without calling the API", async () => {
    let called = false;
    server.use(
      http.post(SIGNUP_URL, () => {
        called = true;
        return HttpResponse.json({});
      }),
    );

    const user = userEvent.setup();
    renderSignup();
    await fillForm(user, {
      password: "Password1!",
      confirm: "Password2!",
    });
    await user.click(screen.getByRole("button", { name: "Create Account →" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Passwords do not match");
    expect(called).toBe(false);
  });

  it("surfaces the duplicate-account message Supabase obfuscates", async () => {
    /* An empty `identities` array is how Supabase signals "this email is
       already registered" without confirming it outright; api/auth.ts turns
       that into a real error. */
    server.use(
      http.post(SIGNUP_URL, () =>
        HttpResponse.json({
          user: { id: "u1", identities: [] },
          session: null,
        }),
      ),
    );

    const user = userEvent.setup();
    renderSignup();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Create Account →" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already exists",
    );
  });

  it("grades password strength as the user types", async () => {
    const user = userEvent.setup();
    renderSignup();

    expect(screen.queryByText(/Too Weak/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Password"), "abc");
    expect(await screen.findByText(/Too Weak/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "Password1!");
    expect(await screen.findByText("Strong")).toBeInTheDocument();
  });
});
