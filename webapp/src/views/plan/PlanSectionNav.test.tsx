import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithAuth } from "../../test/auth";
import { PlanSectionNav } from "./PlanSectionNav";

describe("PlanSectionNav", () => {
  it("keeps the three planning routes canonical and marks the current one", () => {
    renderWithAuth(
      <MemoryRouter initialEntries={["/tasks"]}>
        <PlanSectionNav />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/plan",
      "/tasks",
      "/exams",
    ]);
    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
