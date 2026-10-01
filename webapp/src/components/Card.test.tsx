import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card primitive", () => {
  it("renders a div by default with panel variant and md padding", () => {
    render(<Card data-testid="test-card">Content</Card>);
    const el = screen.getByTestId("test-card");
    expect(el.tagName.toLowerCase()).toBe("div");
    expect(el.textContent).toBe("Content");
    expect(el.className).toContain("card");
    expect(el.className).toContain("panel");
    expect(el.className).toContain("padding-md");
    expect(el.className).toContain("radius-lg");
  });

  it("renders as section when requested", () => {
    render(
      <Card as="section" aria-label="Section card" data-testid="section-card">
        Section
      </Card>,
    );
    const el = screen.getByTestId("section-card");
    expect(el.tagName.toLowerCase()).toBe("section");
    expect(screen.getByRole("region", { name: "Section card" })).toBe(el);
  });

  it("applies elevated variant with xl radius default", () => {
    render(
      <Card variant="elevated" data-testid="elevated-card">
        Elevated
      </Card>,
    );
    const el = screen.getByTestId("elevated-card");
    expect(el.className).toContain("elevated");
    expect(el.className).toContain("radius-xl");
  });

  it("applies subtle and row variants", () => {
    const { rerender } = render(
      <Card variant="subtle" data-testid="c">
        Subtle
      </Card>,
    );
    expect(screen.getByTestId("c").className).toContain("subtle");

    rerender(
      <Card variant="row" data-testid="c">
        Row
      </Card>,
    );
    expect(screen.getByTestId("c").className).toContain("row");
  });

  it("applies custom padding and radius overrides", () => {
    render(
      <Card padding="none" radius="xl" data-testid="c">
        Custom
      </Card>,
    );
    const el = screen.getByTestId("c");
    expect(el.className).toContain("padding-none");
    expect(el.className).toContain("radius-xl");
  });

  it("applies hoverElevation and interactive modifiers", () => {
    render(
      <Card hoverElevation interactive data-testid="interactive-card">
        Clickable
      </Card>,
    );
    const el = screen.getByTestId("interactive-card");
    expect(el.className).toContain("hoverElevation");
    expect(el.className).toContain("interactive");
  });

  it("merges custom className and forwards extra props", () => {
    render(
      <Card className="custom-class" data-custom="value" data-testid="c">
        Extra
      </Card>,
    );
    const el = screen.getByTestId("c");
    expect(el.className).toContain("custom-class");
    expect(el.getAttribute("data-custom")).toBe("value");
  });
});
