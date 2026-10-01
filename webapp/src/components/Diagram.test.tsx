import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Diagram } from "./Diagram";

const DRAWING =
  '<svg viewBox="0 0 200 120"><title>Circle theorems</title>' +
  '<circle cx="100" cy="60" r="40" fill="none" stroke="currentColor" /></svg>';

describe("Diagram", () => {
  it("draws the diagram and captions it from its title", () => {
    const { container } = render(<Diagram source={DRAWING} />);
    expect(
      screen.getByRole("img", { name: "Circle theorems" }),
    ).toBeInTheDocument();
    /* The <title> element names the drawing for a screen reader but is not
       painted, so the caption is what a sighted student reads. */
    expect(container.querySelector("figcaption")).toHaveTextContent(
      "Circle theorems",
    );
  });

  it("opens full-screen, because a chat bubble is narrower than the labels need", async () => {
    const user = userEvent.setup();
    render(<Diagram source={DRAWING} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Enlarge diagram/ }));

    const dialog = screen.getByRole("dialog", { name: "Circle theorems" });
    expect(dialog).toBeInTheDocument();
    /* Escape closes it — there is no app Modal behind this, so the key
       handling is the component's own. */
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hands the drawing over as an .svg file", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:diagram");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<Diagram source={DRAWING} downloadName="circle-theorems" />);
    await user.click(screen.getByRole("button", { name: "Download SVG" }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("shows the source rather than nothing when the drawing is unusable", () => {
    render(<Diagram source="<svg><circle" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/<circle/)).toBeInTheDocument();
  });

  it("never renders script a model put in the source", () => {
    const { container } = render(
      <Diagram source='<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>' />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).not.toContain("alert");
  });
});
