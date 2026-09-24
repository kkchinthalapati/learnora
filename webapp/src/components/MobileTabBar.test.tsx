import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { MobileTabBar } from "./MobileTabBar";

function renderAt(path: string, onMore = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileTabBar onMore={onMore} />
    </MemoryRouter>,
  );
  return onMore;
}

describe("MobileTabBar", () => {
  it("offers the five main places and More", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Quick navigation" });
    for (const name of ["Today", "Library", "Study", "Plan", "Timer"]) {
      expect(nav).toContainElement(screen.getByRole("link", { name }));
    }
    expect(screen.getByRole("button", { name: /^More/ })).toBeInTheDocument();
  });

  it("marks the section a sub-page belongs to as current", () => {
    renderAt("/quiz/q-1");
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("lights More for pages that live under it, and opens the menu", async () => {
    const onMore = renderAt("/analytics");
    for (const name of ["Today", "Library", "Study", "Plan", "Timer"]) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("aria-current");
    }
    await userEvent.click(screen.getByRole("button", { name: /^More/ }));
    expect(onMore).toHaveBeenCalled();
  });
});
