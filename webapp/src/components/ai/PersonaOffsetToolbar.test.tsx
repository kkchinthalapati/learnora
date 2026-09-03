import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonaOffsetToolbar } from "./PersonaOffsetToolbar";

describe("PersonaOffsetToolbar", () => {
  it("renders compact quick pills with default values", () => {
    render(<PersonaOffsetToolbar />);

    expect(screen.getByRole("region", { name: "AI Study Persona & Source Settings" })).toBeInTheDocument();
    expect(screen.getByText(/Lvl 3: Standard/)).toBeInTheDocument();
    expect(screen.getByText("Concise ⚡")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Source mode 🌐 Web" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Source mode 📚 Notebook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Source mode 🔀 Hybrid" })).toBeInTheDocument();
  });

  it("allows switching source mode directly from compact pills", async () => {
    const user = userEvent.setup();
    const onSourceModeChange = vi.fn();
    const onChange = vi.fn();

    render(
      <PersonaOffsetToolbar
        onSourceModeChange={onSourceModeChange}
        onChange={onChange}
      />
    );

    const webPill = screen.getByRole("button", { name: "Source mode 🌐 Web" });
    await user.click(webPill);

    expect(onSourceModeChange).toHaveBeenCalledWith("web");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sourceMode: "web" })
    );
    expect(webPill).toHaveAttribute("aria-pressed", "true");
  });

  it("opens and closes the full adjustment drawer", async () => {
    const user = userEvent.setup();
    render(<PersonaOffsetToolbar />);

    // Initially closed when compact is true
    expect(screen.queryByRole("dialog", { name: "AI Study Persona Settings Drawer" })).toBeNull();

    // Click Adjust
    const adjustBtn = screen.getByRole("button", { name: "Adjust AI study persona" });
    await user.click(adjustBtn);

    expect(screen.getByRole("dialog", { name: "AI Study Persona Settings Drawer" })).toBeInTheDocument();

    // Click Done to close
    const doneBtn = screen.getByRole("button", { name: "Done" });
    await user.click(doneBtn);

    expect(screen.queryByRole("dialog", { name: "AI Study Persona Settings Drawer" })).toBeNull();
  });

  it("closes drawer with Escape key", async () => {
    const user = userEvent.setup();
    render(<PersonaOffsetToolbar />);

    await user.click(screen.getByRole("button", { name: "Adjust AI study persona" }));
    expect(screen.getByRole("dialog", { name: "AI Study Persona Settings Drawer" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "AI Study Persona Settings Drawer" })).toBeNull();
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

    const decBtn = screen.getByRole("button", { name: "Decrease depth level" });
    const incBtn = screen.getByRole("button", { name: "Increase depth level" });

    // Decrease from 3 to 2
    await user.click(decBtn);
    expect(onDepthChange).toHaveBeenCalledWith(2);

    // Increase from 3 to 4
    await user.click(incBtn);
    expect(onDepthChange).toHaveBeenCalledWith(4);
  });

  it("disables stepper bounds at level 1 and level 5", () => {
    const { rerender } = render(<PersonaOffsetToolbar depth={1} compact={false} />);
    expect(screen.getByRole("button", { name: "Decrease depth level" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase depth level" })).not.toBeDisabled();

    rerender(<PersonaOffsetToolbar depth={5} compact={false} />);
    expect(screen.getByRole("button", { name: "Decrease depth level" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase depth level" })).toBeDisabled();
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

    const visualChip = screen.getByRole("radio", { name: "Visual 🎨" });
    await user.click(visualChip);

    expect(onStyleChange).toHaveBeenCalledWith("visual");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ style: "visual" })
    );
    expect(visualChip).toHaveAttribute("aria-checked", "true");
  });

  it("displays readable labels correctly for depth levels", () => {
    const { rerender } = render(<PersonaOffsetToolbar depth={1} compact={false} />);
    expect(screen.getAllByText(/Quick Intuition/i).length).toBeGreaterThan(0);

    rerender(<PersonaOffsetToolbar depth={3} compact={false} />);
    expect(screen.getAllByText(/Standard/i).length).toBeGreaterThan(0);

    rerender(<PersonaOffsetToolbar depth={5} compact={false} />);
    expect(screen.getAllByText(/Deep Academic/i).length).toBeGreaterThan(0);
  });
});
