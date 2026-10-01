import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { MobileTabBar } from "./MobileTabBar";
import { ChatContext, type ChatApi } from "../context/chat";

function renderAt(path: string, chat?: Partial<ChatApi>) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <MobileTabBar />
    </MemoryRouter>
  );
  render(
    chat ? (
      <ChatContext.Provider value={{ isOpen: false, ...chat } as ChatApi}>
        {tree}
      </ChatContext.Provider>
    ) : (
      tree
    ),
  );
}

describe("MobileTabBar", () => {
  it("offers the same five destinations as the sidebar", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Quick navigation" });
    for (const name of ["Today", "Library", "Study", "Plan", "Progress"]) {
      expect(nav).toContainElement(screen.getByRole("link", { name }));
    }
  });

  it.each([
    ["/quiz/q-1", "Library"],
    ["/timer", "Plan"],
    ["/trajectory", "Progress"],
  ])("marks exactly one tab current on %s (%s)", (path, name) => {
    renderAt(path);
    const current = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual([name]);
  });

  it("floats an Ask button that opens the tutor", async () => {
    const open = vi.fn();
    renderAt("/", { open });
    await userEvent.click(screen.getByRole("button", { name: "Ask the tutor" }));
    expect(open).toHaveBeenCalled();
  });
});
