import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { fakeSession, renderWithAuth } from "../test/auth";
import { AppShell } from "./AppShell";

/* The shell after the 2026-10 overhaul (webapp/DESIGN.md 0.2): one top bar
 * with Home · Subjects · Progress, search, Ask, the timer and a profile
 * menu; the page's title row under it. No sidebar, rail or drawer. */

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

function renderShell(initialPath: string, fullName = "Ada Lovelace", signOut = vi.fn()) {
  return renderWithAuth(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<h1>Home view</h1>} />
        <Route path="/tasks" element={<p>Tasks view</p>} />
        <Route path="/library" element={<h1>Library view</h1>} />
        <Route path="/folders/:folderId" element={<h1>Biology</h1>} />
        <Route path="/settings" element={<h1>Settings view</h1>} />
      </Route>
    </Routes>,
    { session: fakeSession({ user_metadata: { full_name: fullName } }), signOut },
    { initialEntries: [initialPath] },
  );
}

const mainNav = () => screen.getByRole("navigation", { name: "Main navigation" });

describe("AppShell", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers a skip link first that focuses the page content", async () => {
    serveDueCount(0);
    renderShell("/");
    const user = userEvent.setup();

    await user.tab();
    const skipLink = screen.getByRole("link", { name: "Skip to content" });
    expect(skipLink).toHaveFocus();

    await user.click(skipLink);
    expect(document.getElementById("page-content")).toHaveFocus();
  });

  it("has three destinations: Home, Subjects and Progress", () => {
    serveDueCount(0);
    renderShell("/");
    const links = within(mainNav()).getAllByRole("link");

    expect(links.map((l) => l.textContent)).toEqual(["Home", "Subjects", "Progress"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/", "/subjects", "/analytics"]);
  });

  it("marks Home as the current page on the root route", () => {
    serveDueCount(0);
    renderShell("/");

    expect(within(mainNav()).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(within(mainNav()).getByRole("link", { name: "Subjects" })).not.toHaveAttribute("aria-current");
  });

  it("keeps Subjects lit on pages that belong to it", async () => {
    serveDueCount(0);
    renderShell("/folders/f-1");

    await screen.findByRole("heading", { name: "Biology" });
    const subjects = within(mainNav()).getByRole("link", { name: "Subjects" });
    expect(subjects).toHaveAttribute("aria-current", "true");
    expect(within(mainNav()).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("shows how many cards are due on Subjects, and nothing when none are", async () => {
    serveDueCount(3);
    renderShell("/");
    expect(await within(mainNav()).findByText("3")).toBeInTheDocument();
  });

  it("shows no due count when nothing is due", async () => {
    serveDueCount(0);
    renderShell("/");
    await screen.findByText("Home view");
    expect(within(mainNav()).queryByText("0")).not.toBeInTheDocument();
  });

  /* Ask and search need the chat and command-palette providers, which this
     harness doesn't mount; with no provider they stay out rather than render
     a button that does nothing. */
  it("puts the focus timer in the top bar", () => {
    serveDueCount(0);
    renderShell("/");
    const bar = screen.getByRole("banner");

    expect(within(bar).getByRole("link", { name: "Focus timer" })).toHaveAttribute("href", "/timer");
    expect(within(bar).queryByRole("button", { name: "Ask the tutor" })).toBeNull();
  });

  it("renders the current section as the page's one <h1>", () => {
    serveDueCount(0);
    renderShell("/tasks");

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tasks");
  });

  it("has exactly one banner landmark", () => {
    serveDueCount(0);
    renderShell("/tasks");
    expect(screen.getAllByRole("banner")).toHaveLength(1);
  });

  it("keeps sign out behind the profile menu", async () => {
    serveDueCount(0);
    const signOut = vi.fn().mockResolvedValue(undefined);
    renderShell("/", "Ada Lovelace", signOut);
    const user = userEvent.setup();

    expect(screen.queryByRole("menuitem", { name: "Sign out" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ada Lovelace, account menu" }));
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(within(menu).getByRole("menuitem", { name: /Study room and friends/ })).toHaveAttribute("href", "/room");

    await user.click(within(menu).getByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("closes the profile menu with Escape and returns focus to the button", async () => {
    serveDueCount(0);
    renderShell("/");
    const user = userEvent.setup();

    const button = screen.getByRole("button", { name: "Ada Lovelace, account menu" });
    await user.click(button);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });
});
