import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { LimitNotice } from "./LimitNotice";
import { quotaUsage } from "../lib/entitlements";

const renderAt = (used: number, plan: "free" | "plus" = "free") =>
  render(
    <MemoryRouter>
      <LimitNotice
        usage={quotaUsage(plan, "debugger", used)}
        toolName="Explain sessions"
      />
    </MemoryRouter>,
  );

describe("LimitNotice", () => {
  it("says nothing with plenty left", () => {
    const { container } = renderAt(0, "plus");
    expect(container).toBeEmptyDOMElement();
  });

  it("warns before the last go, and says the whole session is covered", () => {
    renderAt(1);
    expect(
      screen.getByText(
        "This uses your last tutor go for today. The whole session is covered.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Use cards instead (free)" }),
    ).toHaveAttribute("href", "/study/new?mode=recall&minutes=10");
    expect(screen.queryByRole("link", { name: "See plans" })).toBeNull();
  });

  it("when none are left: free options first, the upgrade one quiet link to a page", () => {
    renderAt(2);
    const links = screen.getAllByRole("link").map((l) => l.textContent);
    expect(links).toEqual(["Use cards instead (free)", "See plans"]);
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute(
      "href",
      "/upgrade",
    );
  });
});
