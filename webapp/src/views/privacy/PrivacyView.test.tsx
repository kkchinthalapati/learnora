import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PrivacyView } from "./PrivacyView";

function renderPrivacy() {
  /* No provider stack: the page is static copy and reads no context, which is
     also why it can be public. */
  return render(
    <MemoryRouter>
      <PrivacyView />
    </MemoryRouter>,
  );
}

describe("PrivacyView", () => {
  it("renders the document and its way back into the app", () => {
    renderPrivacy();

    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "← Back to Learnora" }),
    ).toHaveAttribute("href", "/");
  });

  it("keeps every table-of-contents entry pointed at a real section", () => {
    const { container } = renderPrivacy();
    const toc = screen.getByRole("navigation", { name: "Table of Contents" });
    const links = within(toc).getAllByRole("link");

    expect(links).toHaveLength(12);
    for (const link of links) {
      const id = link.getAttribute("href")?.replace("#", "");
      expect(id).toBeTruthy();
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it("names the AI providers and says data isn't used for training", () => {
    renderPrivacy();

    expect(screen.getAllByText(/Anthropic/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Google/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/do not allow Anthropic or Google to train/),
    ).toBeInTheDocument();
  });

  it("explains retention and the 30-day backup purge on deletion", () => {
    renderPrivacy();

    expect(
      screen.getByRole("heading", { level: 2, name: /Data Retention/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/purged automatically within/)).toBeInTheDocument();
    expect(screen.getByText(/30 days/)).toBeInTheDocument();
  });

  it("covers GDPR and CCPA rights by name", () => {
    renderPrivacy();

    expect(
      screen.getByRole("heading", { level: 2, name: /GDPR — EU\/UK Users/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /CCPA — California Users/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "support@learnora.app" }).length,
    ).toBeGreaterThan(0);
  });
});
