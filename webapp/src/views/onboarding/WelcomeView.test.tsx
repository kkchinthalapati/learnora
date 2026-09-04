import { beforeEach, describe, expect, it } from "vitest";
import { Route, Routes } from "react-router";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { WelcomeView } from "./WelcomeView";
import { OnboardingGate, WELCOME_PATH } from "./OnboardingGate";
import { SETTINGS_KEY, loadSettings } from "../../lib/settings";
import { DASHBOARD_LAYOUT_KEY } from "../dashboard/DashboardCustomizeModal";
import { LIFE_CONTEXT_KEY } from "../../lib/lifeContext";
import { ONBOARDING_LOCAL_KEY } from "../../lib/onboarding";

/* A new account: created after onboarding shipped, no answers recorded. */
const newUser = fakeSession({ created_at: "2026-12-01T00:00:00.000Z" });

function renderWizard() {
  return renderWithAuth(
    <WelcomeView />,
    { session: newUser },
    {
      initialEntries: ["/welcome"],
    },
  );
}

beforeEach(() => {
  localStorage.clear();
  mockAuthSession("user-1");
  /* The wizard's last act is writing its answers to user_metadata. Every test
     here lets that succeed unless it is specifically testing the failure. */
  server.use(
    http.put(`${SUPABASE_URL}/auth/v1/user`, () =>
      HttpResponse.json({ user: newUser.user }),
    ),
    http.post(`${SUPABASE_URL}/rest/v1/folders`, () =>
      HttpResponse.json([{ id: "folder-1", name: "Organic Chemistry" }]),
    ),
  );
});

async function walkToSubjectStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /let's set it up/i }));
  await user.click(screen.getByRole("button", { name: /school exams/i }));
  await user.click(screen.getByRole("button", { name: /continue/i }));
  await user.click(
    screen.getByRole("button", { name: /stay on top of deadlines/i }),
  );
  await user.click(screen.getByRole("button", { name: /continue/i }));
  await user.click(screen.getByRole("button", { name: /direct coach/i }));
  await user.click(screen.getByRole("button", { name: /continue/i }));
  await user.click(screen.getByRole("button", { name: /^late/i }));
  await user.click(screen.getByRole("button", { name: /1 hour/i }));
  await user.click(screen.getByRole("button", { name: /continue/i }));
}

describe("WelcomeView", () => {
  it("opens on a welcome that names the student", async () => {
    renderWithAuth(
      <WelcomeView />,
      {
        session: fakeSession({
          created_at: "2026-12-01T00:00:00.000Z",
          user_metadata: { full_name: "Ada Lovelace" },
        }),
      },
      { initialEntries: ["/welcome"] },
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: /welcome, ada\./i }),
    ).toBeInTheDocument();
  });

  it("will not advance past a question that has not been answered", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: /let's set it up/i }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /school exams/i }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("writes the answers into settings, life context and the dashboard layout", async () => {
    const user = userEvent.setup();
    renderWizard();

    await walkToSubjectStep(user);
    await user.type(
      screen.getByRole("textbox", { name: /subject/i }),
      "Organic Chemistry",
    );
    await user.click(
      screen.getByRole("button", { name: /create it and finish/i }),
    );

    await screen.findByRole("heading", { level: 1, name: /you're set up/i });

    const settings = loadSettings();
    expect(settings.aiPersona).toBe("coach");
    expect(localStorage.getItem(SETTINGS_KEY)).toContain("coach");

    const life = JSON.parse(localStorage.getItem(LIFE_CONTEXT_KEY) ?? "{}");
    expect(life.chronotype).toBe("night");
    expect(life.weekdayCapacityMins).toBe(60);

    /* "Stay on top of deadlines" alone: the timeline earns its place, the
       community section does not. */
    const layout = JSON.parse(
      localStorage.getItem(DASHBOARD_LAYOUT_KEY) ?? "{}",
    );
    expect(layout.visibleSections.todayTimeline).toBe(true);
    expect(layout.visibleSections.sessionsCommunity).toBe(false);
  });

  it("still lets the student through when the metadata write fails", async () => {
    server.use(
      http.put(`${SUPABASE_URL}/auth/v1/user`, () =>
        HttpResponse.json({ message: "nope" }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderWizard();

    await walkToSubjectStep(user);
    await user.click(
      screen.getByRole("button", { name: /finish without one/i }),
    );

    await screen.findByRole("heading", { level: 1, name: /you're set up/i });
    /* The local mirror is what stops the guard bouncing them straight back. */
    await waitFor(() =>
      expect(localStorage.getItem(ONBOARDING_LOCAL_KEY)).toContain("user-1"),
    );
  });

  it("shows a starting point for each thing they asked for", async () => {
    const user = userEvent.setup();
    renderWizard();

    await walkToSubjectStep(user);
    await user.click(
      screen.getByRole("button", { name: /finish without one/i }),
    );

    await screen.findByRole("heading", { level: 1, name: /you're set up/i });
    expect(
      screen.getByRole("heading", { name: /your exams and deadlines/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /study rooms and friends/i }),
    ).not.toBeInTheDocument();
  });

  it("records a skip so the wizard does not come back", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: /skip setup/i }));

    await waitFor(() =>
      expect(localStorage.getItem(ONBOARDING_LOCAL_KEY)).toContain("user-1"),
    );
  });
});

describe("OnboardingGate", () => {
  /* A miniature of the real route table: the gate wraps the app, /welcome
     sits beside it. */
  const tree = (
    <Routes>
      <Route element={<OnboardingGate />}>
        <Route path="/" element={<p>the dashboard</p>} />
      </Route>
      <Route path={WELCOME_PATH} element={<p>the wizard</p>} />
    </Routes>
  );

  it("redirects a brand new account into the wizard", async () => {
    renderWithAuth(tree, { session: newUser }, { initialEntries: ["/"] });
    expect(await screen.findByText("the wizard")).toBeInTheDocument();
  });

  it("lets an account that has already answered through", async () => {
    const seen = fakeSession({
      created_at: "2026-12-01T00:00:00.000Z",
      user_metadata: {
        onboarding: { completedAt: "2026-12-02T00:00:00.000Z" },
      },
    });
    renderWithAuth(tree, { session: seen }, { initialEntries: ["/"] });
    expect(await screen.findByText("the dashboard")).toBeInTheDocument();
  });

  it("leaves an account that predates the feature alone", async () => {
    const old = fakeSession({ created_at: "2026-01-01T00:00:00.000Z" });
    renderWithAuth(tree, { session: old }, { initialEntries: ["/"] });
    expect(await screen.findByText("the dashboard")).toBeInTheDocument();
  });
});
