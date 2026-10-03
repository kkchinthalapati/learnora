import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SourceAttribution } from "./SourceAttribution";

describe("SourceAttribution", () => {
  it("links each source to the notes it came from", () => {
    render(
      <MemoryRouter>
        <SourceAttribution
          sources={[{ materialId: "m 1", label: "Bioenergetics (notes), part 2", excerpt: "Light intensity limits…" }]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("complementary", { name: "From your notes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bioenergetics (notes), part 2" })).toHaveAttribute("href", "/notes/m%201");
  });

  it("renders nothing without sources", () => {
    const { container } = render(<SourceAttribution sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
