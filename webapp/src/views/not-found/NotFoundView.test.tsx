import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { NotFoundView } from "./NotFoundView";

function renderNotFound() {
  return render(
    <MemoryRouter>
      <NotFoundView />
    </MemoryRouter>,
  );
}

describe("NotFoundView", () => {
  it("renders 404 badge and Page Not Found heading", () => {
    renderNotFound();

    expect(
      screen.getByRole("heading", { level: 1, name: "Page Not Found" }),
    ).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders navigation links to Dashboard and Library", () => {
    renderNotFound();

    expect(screen.getByRole("link", { name: /Dashboard/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: /Library/i })).toHaveAttribute(
      "href",
      "/library",
    );
  });

  it("renders a Go Back button", () => {
    renderNotFound();

    expect(
      screen.getByRole("button", { name: /Go Back/i }),
    ).toBeInTheDocument();
  });
});
