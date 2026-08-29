import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { OverlayStackProvider } from "../../context/OverlayStackProvider";
import { NotebooksHubView } from "./NotebooksHubView";

describe("NotebooksHubView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the notebooks hub with initial demo notebooks", () => {
    render(
      <OverlayStackProvider>
        <MemoryRouter>
          <NotebooksHubView />
        </MemoryRouter>
      </OverlayStackProvider>,
    );

    expect(screen.getByRole("heading", { name: "Notebooks" })).toBeInTheDocument();
    expect(screen.getByText(/Grade 9 Mathematics/)).toBeInTheDocument();
    expect(screen.getByText(/A-Level Biology/)).toBeInTheDocument();
  });

  it("filters notebooks based on search query", async () => {
    const user = userEvent.setup();
    render(
      <OverlayStackProvider>
        <MemoryRouter>
          <NotebooksHubView />
        </MemoryRouter>
      </OverlayStackProvider>,
    );

    const searchInput = screen.getByPlaceholderText(/Search notebooks/);
    await user.type(searchInput, "Mathematics");

    expect(screen.getByText(/Grade 9 Mathematics/)).toBeInTheDocument();
    expect(screen.queryByText(/A-Level Biology/)).not.toBeInTheDocument();
  });

  it("opens the create notebook modal", async () => {
    const user = userEvent.setup();
    render(
      <OverlayStackProvider>
        <MemoryRouter>
          <NotebooksHubView />
        </MemoryRouter>
      </OverlayStackProvider>,
    );

    await user.click(screen.getByRole("button", { name: /New notebook/ }));
    expect(screen.getByText("Create a new notebook")).toBeInTheDocument();
  });
});
