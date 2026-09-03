import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import { WebSourceImportModal } from "./WebSourceImportModal";

describe("WebSourceImportModal", () => {
  it("does not render when open is false", () => {
    renderWithProviders(
      <WebSourceImportModal
        open={false}
        onClose={vi.fn()}
        onImport={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders when open is true with search prompt", () => {
    renderWithProviders(
      <WebSourceImportModal
        open={true}
        onClose={vi.fn()}
        onImport={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Import Web Intelligence")).toBeInTheDocument();
    expect(screen.getByText("Search the Academic Web")).toBeInTheDocument();
  });

  it("searches and renders result cards with domain badges and snippets", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WebSourceImportModal
        open={true}
        onClose={vi.fn()}
        onImport={vi.fn()}
      />
    );

    const input = screen.getByRole("textbox", {
      name: "Search articles and papers or paste URL",
    });
    await user.type(input, "Attention");

    const searchBtn = screen.getByRole("button", { name: "Search" });
    await user.click(searchBtn);

    expect(screen.getByText("Attention Is All You Need ↗")).toBeInTheDocument();
    expect(screen.getByText("🌐 arxiv.org")).toBeInTheDocument();
    expect(
      screen.getByText(/The dominant sequence transduction models are based on complex recurrent/i)
    ).toBeInTheDocument();
  });

  it("recognizes direct URL paste and renders preview card", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WebSourceImportModal
        open={true}
        onClose={vi.fn()}
        onImport={vi.fn()}
      />
    );

    const input = screen.getByRole("textbox", {
      name: "Search articles and papers or paste URL",
    });
    await user.type(input, "https://nature.com/articles/quantum-info");

    expect(screen.getByText("Quantum Info ↗")).toBeInTheDocument();
    expect(screen.getByText("🌐 nature.com")).toBeInTheDocument();
    expect(
      screen.getByText(/External reference imported from nature.com/i)
    ).toBeInTheDocument();
  });

  it("calls onImport with source payload when 1-click Add to Notebook is clicked", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();

    renderWithProviders(
      <WebSourceImportModal
        open={true}
        onClose={vi.fn()}
        onImport={onImport}
        defaultQuery="Attention"
      />
    );

    const addButtons = screen.getAllByRole("button", {
      name: /Add .* to Notebook/i,
    });
    expect(addButtons.length).toBeGreaterThan(0);

    await user.click(addButtons[0]);

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Attention Is All You Need",
        url: "https://arxiv.org/abs/1706.03762",
        type: "web",
        content: expect.any(String),
      })
    );

    // Button should now reflect added state
    expect(screen.getByText("✓ Added to Notebook")).toBeInTheDocument();
  });

  it("closes the modal when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(
      <WebSourceImportModal
        open={true}
        onClose={onClose}
        onImport={vi.fn()}
      />
    );

    const closeBtn = screen.getByRole("button", { name: "Close" });
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
