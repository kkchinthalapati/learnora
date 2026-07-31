import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TermsView } from "./TermsView";

function renderTerms() {
  /* No provider stack: the page is static copy and reads no context, which is
     also why it can be public. */
  return render(
    <MemoryRouter>
      <TermsView />
    </MemoryRouter>,
  );
}

describe("TermsView", () => {
  it("renders the document and its way back into the app", () => {
    renderTerms();

    expect(
      screen.getByRole("heading", { level: 1, name: "Terms of Service" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "← Back to Learnora" }),
    ).toHaveAttribute("href", "/");
  });

  it("keeps every table-of-contents entry pointed at a real section", () => {
    const { container } = renderTerms();
    const toc = screen.getByRole("navigation", { name: "Table of Contents" });
    const links = within(toc).getAllByRole("link");

    expect(links).toHaveLength(12);
    for (const link of links) {
      const id = link.getAttribute("href")?.replace("#", "");
      expect(id).toBeTruthy();
      /* A table of contents whose anchors miss is worse than none — the whole
         point is jumping to the clause you were asked about. */
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it("carries the clauses that actually get cited", () => {
    renderTerms();

    expect(
      screen.getByRole("heading", { level: 2, name: /Eligibility/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/at least 13 years old/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "support@learnora.app" }),
    ).toHaveAttribute("href", "mailto:support@learnora.app");
  });
});
