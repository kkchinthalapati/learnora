import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { fakeSession, renderWithAuth } from "../test/auth";
import { getGreeting } from "../lib/greeting";
import { AppShell } from "./AppShell";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function serveDueCount(count: number) {
  server.use(
    http.head(rest("flashcards"), () =>
      HttpResponse.json(null, {
        status: 200,
        headers: { "content-range": `*/${count}` },
      }),
    ),
  );
}

function renderShell(initialPath: string, fullName = "Ada Lovelace") {
  return renderWithAuth(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<h1>Dashboard view</h1>} />
          <Route path="/tasks" element={<h1>Tasks view</h1>} />
          <Route path="/library" element={<h1>Library view</h1>} />
          <Route path="/folders/:folderId" element={<h1>Biology</h1>} />
          <Route path="/settings" element={<h1>Settings view</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
    { session: fakeSession({ user_metadata: { full_name: fullName } }) },
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders every nav link with its label", () => {
    serveDueCount(0);
    renderShell("/");

    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: /Task Manager/ }),
    ).toHaveAttribute("href", "/tasks");
    expect(screen.getByRole("link", { name: /Library/ })).toHaveAttribute(
      "href",
      "/library",
    );
    expect(screen.getByRole("link", { name: /Timer/ })).toHaveAttribute(
      "href",
      "/timer",
    );
    expect(
      screen.getByRole("link", { name: /This week's plan/ }),
    ).toHaveAttribute("href", "/plan");
    expect(screen.getByRole("link", { name: /Exams/ })).toHaveAttribute(
      "href",
      "/exams",
    );
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(
      screen.getByRole("link", { name: /Terms of Service/ }),
    ).toHaveAttribute("href", "/terms");
  });

  it("highlights Dashboard as active only on the root route", () => {
    serveDueCount(0);
    renderShell("/tasks");

    expect(
      screen.getByRole("link", { name: /Dashboard/ }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /Task Manager/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps Library active on a page reached from it with no sidebar entry of its own", async () => {
    server.use(
      http.get(rest("folders"), () =>
        HttpResponse.json([
          {
            id: "f-1",
            user_id: "user-1",
            name: "Biology",
            color: "#4A90E2",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ),
    );
    serveDueCount(0);
    renderShell("/folders/f-1");

    await screen.findByRole("heading", { name: "Biology" });
    expect(screen.getByRole("link", { name: /Library/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows the flashcards-due badge only when cards are due", async () => {
    serveDueCount(3);
    renderShell("/");

    expect(await screen.findByText("3")).toBeInTheDocument();
  });

  it("hides the badge when nothing is due", async () => {
    serveDueCount(0);
    renderShell("/");

    await screen.findByText("Dashboard view");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("opens the create modal from the sidebar's Create button", async () => {
    serveDueCount(0);
    renderShell("/");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(
      screen.getByRole("dialog", { name: "Create study material" }),
    ).toBeInTheDocument();
  });

  it("greets the signed-in user by first name, time-of-day appropriate", () => {
    /* Derives the expected greeting from the real clock rather than mocking
       it — `getGreeting` itself is already unit-tested against fixed times
       in lib/greeting.test.ts, and this codebase's own precedent (Step 9)
       found `vi.useFakeTimers` breaks MSW/userEvent pacing in view tests
       like this one. */
    serveDueCount(0);
    renderShell("/", "Ada Lovelace");

    expect(screen.getByText(getGreeting("Ada"))).toBeInTheDocument();
  });

  it("shows the current section as a label, not a competing page heading", () => {
    serveDueCount(0);
    renderShell("/tasks");

    // The header (a <header> landmark, i.e. role "banner") shows the
    // section label as plain text, not a second <h1> — the view's own
    // heading ("Tasks view" here) stays the page's one and only <h1>.
    expect(
      within(screen.getByRole("banner")).getByText("Task Manager"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("logs out from the header button", async () => {
    serveDueCount(0);
    const signOut = vi.fn().mockResolvedValue(undefined);
    renderWithAuth(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<h1>Dashboard view</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
      { session: fakeSession(), signOut },
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Log Out" }));

    expect(signOut).toHaveBeenCalled();
  });

  it("flips the theme with one click, and persists only the theme (not other unsaved appearance edits)", async () => {
    /* Doesn't assume which state "system" resolves to first (that depends
       on jsdom's default `prefers-color-scheme`, which this suite doesn't
       control) — only that one click flips it, persists exactly that flip,
       and a second click flips it back. */
    serveDueCount(0);
    renderShell("/");
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", { name: "Toggle Theme" });

    const wasDark = document.body.classList.contains("dark-theme");

    await user.click(toggle);

    expect(document.body.classList.contains("dark-theme")).toBe(!wasDark);
    expect(JSON.parse(localStorage.getItem("learnora_mode") ?? "")).toBe(
      wasDark ? "light" : "dark",
    );
    // A studio-only field was never touched by this control.
    expect(localStorage.getItem("learnora_accent")).toBeNull();

    await user.click(toggle);
    expect(document.body.classList.contains("dark-theme")).toBe(wasDark);
    expect(JSON.parse(localStorage.getItem("learnora_mode") ?? "")).toBe(
      wasDark ? "dark" : "light",
    );
  });

  it("toggles the mobile menu open and closed from the header button", async () => {
    /* `collapsed` is a CSS Module class, so the DOM's actual class token is
       a hashed name like `_collapsed_xxxxx` — checked by substring rather
       than `toHaveClass`, which requires an exact token match. */
    serveDueCount(0);
    renderShell("/");
    const user = userEvent.setup();

    const sidebar = screen.getByRole("navigation", { name: "Main navigation" });
    expect(sidebar.className).not.toMatch(/collapsed/);

    await user.click(
      screen.getByRole("button", { name: "Toggle Sidebar Menu" }),
    );
    expect(sidebar.className).toMatch(/collapsed/);

    await user.click(
      screen.getByRole("button", { name: "Toggle Sidebar Menu" }),
    );
    expect(sidebar.className).not.toMatch(/collapsed/);
  });

  it("auto-closes the mobile menu after choosing a nav link on a narrow viewport", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 480,
    });
    serveDueCount(0);
    renderShell("/");
    const user = userEvent.setup();

    const sidebar = screen.getByRole("navigation", { name: "Main navigation" });
    await user.click(
      screen.getByRole("button", { name: "Toggle Sidebar Menu" }),
    );
    expect(sidebar.className).toMatch(/collapsed/);

    await user.click(screen.getByRole("link", { name: /Task Manager/ }));
    await waitFor(() => expect(sidebar.className).not.toMatch(/collapsed/));

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalWidth,
    });
  });
});
