import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonaOffsetToolbar } from "./PersonaOffsetToolbar";

describe("PersonaOffsetToolbar", () => {
  it("states the current settings in one plain line", () => {
    render(<PersonaOffsetToolbar />);

    expect(screen.getByRole("region", { name: "Answer settings" })).toBeInTheDocument();
    const summary = screen.getByRole("button", { name: /^Answer settings:/ });
    expect(summary).toHaveTextContent("Answers from my notes + web · Standard · Short");
  });

  it("switches where answers come from inside the drawer", async () => {
    const user = userEvent.setup();
    const onSourceModeChange = vi.fn();
    const onChange = vi.fn();

    render(
      <PersonaOffsetToolbar
        onSourceModeChange={onSourceModeChange}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /^Answer settings:/ }));
    const web = screen.getByRole("radio", { name: "The web" });
    await user.click(web);

    expect(onSourceModeChange).toHaveBeenCalledWith("web");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sourceMode: "web" })
    );
    expect(web).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /^Answer settings:/ })).toHaveTextContent("Answers from the web");
  });

  it("opens and closes the full adjustment drawer", async () => {
    const user = userEvent.setup();
    render(<PersonaOffsetToolbar />);

    // Initially closed when compact is true
    expect(screen.queryByRole("dialog", { name: "Answer settings" })).toBeNull();

    // Click Adjust
    const adjustBtn = screen.getByRole("button", { name: /^Answer settings:/ });
    await user.click(adjustBtn);

    expect(screen.getByRole("dialog", { name: "Answer settings" })).toBeInTheDocument();

    // Click Done to close
    const doneBtn = screen.getByRole("button", { name: "Done" });
    await user.click(doneBtn);

    expect(screen.queryByRole("dialog", { name: "Answer settings" })).toBeNull();
  });

  it("closes drawer with Escape key", async () => {
    const user = userEvent.setup();
    render(<PersonaOffsetToolbar />);

    await user.click(screen.getByRole("button", { name: /^Answer settings:/ }));
    expect(screen.getByRole("dialog", { name: "Answer settings" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Answer settings" })).toBeNull();
  });

  it("adjusts depth level using stepper buttons", async () => {
    const user = userEvent.setup();
    const onDepthChange = vi.fn();

    render(
      <PersonaOffsetToolbar
        depth={3}
        onDepthChange={onDepthChange}
        compact={false}
      />
    );

    const decBtn = screen.getByRole("button", { name: "Less detail" });
    const incBtn = screen.getByRole("button", { name: "More detail" });

    // Decrease from 3 to 2
    await user.click(decBtn);
    expect(onDepthChange).toHaveBeenCalledWith(2);

    // Increase from 3 to 4
    await user.click(incBtn);
    expect(onDepthChange).toHaveBeenCalledWith(4);
  });

  it("disables stepper bounds at level 1 and level 5", () => {
    const { rerender } = render(<PersonaOffsetToolbar depth={1} compact={false} />);
    expect(screen.getByRole("button", { name: "Less detail" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "More detail" })).not.toBeDisabled();

    rerender(<PersonaOffsetToolbar depth={5} compact={false} />);
    expect(screen.getByRole("button", { name: "Less detail" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "More detail" })).toBeDisabled();
  });

  it("selects study style chips", async () => {
    const user = userEvent.setup();
    const onStyleChange = vi.fn();
    const onChange = vi.fn();

    render(
      <PersonaOffsetToolbar
        onStyleChange={onStyleChange}
        onChange={onChange}
        compact={false}
      />
    );

    const visualChip = screen.getByRole("radio", { name: "Visual" });
    await user.click(visualChip);

    expect(onStyleChange).toHaveBeenCalledWith("visual");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ style: "visual" })
    );
    expect(visualChip).toHaveAttribute("aria-checked", "true");
  });

  it("displays readable labels correctly for depth levels", () => {
    const { rerender } = render(<PersonaOffsetToolbar depth={1} compact={false} />);
    expect(screen.getAllByText(/Just the gist/i).length).toBeGreaterThan(0);

    rerender(<PersonaOffsetToolbar depth={3} compact={false} />);
    expect(screen.getAllByText(/Standard/i).length).toBeGreaterThan(0);

    rerender(<PersonaOffsetToolbar depth={5} compact={false} />);
    expect(screen.getAllByText(/In depth/i).length).toBeGreaterThan(0);
  });
});
