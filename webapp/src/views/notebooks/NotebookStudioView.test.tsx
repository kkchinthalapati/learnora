import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { NotebookStudioView } from "./NotebookStudioView";
import { OverlayStackProvider } from "../../context/OverlayStackProvider";
import { ToastProvider } from "../../context/ToastProvider";

describe("NotebookStudioView", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the 3-panel studio layout for a notebook", async () => {
    render(
      <OverlayStackProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/notebooks/nb-maths-theorems"]}>
            <Routes>
              <Route path="/notebooks/:notebookId" element={<NotebookStudioView />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </OverlayStackProvider>,
    );

    // Panel 1: Sources Desk
    expect(screen.getByRole("heading", { name: "Sources" })).toBeInTheDocument();
    expect(screen.getByText(/NCERT Chapter 10/)).toBeInTheDocument();

    // Panel 2: Grounded Canvas
    expect(screen.getByRole("button", { name: /Grounded AI Tutor/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Notes Canvas/ })).toBeInTheDocument();

    // Panel 3: Studio Tools & Artifacts
    expect(screen.getByText("Studio Tools")).toBeInTheDocument();
    expect(screen.getByText("Feynman Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Revision Cheat Sheet")).toBeInTheDocument();
  });

  it("switches to the notes canvas tab", async () => {
    const user = userEvent.setup();
    render(
      <OverlayStackProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/notebooks/nb-maths-theorems"]}>
            <Routes>
              <Route path="/notebooks/:notebookId" element={<NotebookStudioView />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </OverlayStackProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Notes Canvas/ }));
    expect(
      screen.getByPlaceholderText(/Write your study notes, proofs, and working here/),
    ).toBeInTheDocument();
  });

  it("opens add source modal when clicking Add source", async () => {
    const user = userEvent.setup();
    render(
      <OverlayStackProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/notebooks/nb-maths-theorems"]}>
            <Routes>
              <Route path="/notebooks/:notebookId" element={<NotebookStudioView />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </OverlayStackProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Add source/ }));
    expect(screen.getByText("Add Study Source to Notebook")).toBeInTheDocument();
  });
});
