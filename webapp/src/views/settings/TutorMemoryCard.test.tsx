import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import type { TutorMemoryEntry } from "../../lib/tutorMemory";

let rows: TutorMemoryEntry[] = [];
const forget = vi.fn(async (id: string) => {
  rows = rows.filter((r) => r.materialId !== id);
});
const forgetAll = vi.fn(async () => {
  rows = [];
});
vi.mock("../../api/tutorMemory", () => ({
  tutorMemoryKey: ["tutor-memory"],
  tutorMemoryApi: {
    list: async () => rows,
    forget: (id: string) => forget(id),
    forgetAll: () => forgetAll(),
  },
}));

const { TutorMemoryCard } = await import("./TutorMemoryCard");

const list = () => screen.findByRole("list", { name: "Lessons your tutor remembers" });

describe("TutorMemoryCard", () => {
  beforeEach(() => {
    localStorage.clear();
    forget.mockClear();
    forgetAll.mockClear();
    rows = [
      { materialId: "m1", lessonTitle: "Enzymes", subject: "Biology", times: 3, lastAt: "2026-11-09T12:00:00Z" },
      { materialId: "m2", lessonTitle: "Bonding", subject: null, times: 1, lastAt: "2026-11-08T12:00:00Z" },
    ];
  });

  it("says exactly what is kept and what is not", () => {
    renderWithProviders(<TutorMemoryCard />);
    expect(screen.getByRole("heading", { name: "What your tutor remembers" })).toBeInTheDocument();
    expect(screen.getByText(/It does not keep what you typed or what it replied/)).toBeInTheDocument();
  });

  it("lists every remembered lesson with when and how often", async () => {
    renderWithProviders(<TutorMemoryCard />);
    const items = within(await list()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Enzymes");
    expect(items[0]).toHaveTextContent("Biology");
    expect(items[0]).toHaveTextContent("3 conversations");
    expect(items[1]).toHaveTextContent("Bonding");
    expect(items[1]).not.toHaveTextContent("conversations");
  });

  it("removes one lesson", async () => {
    renderWithProviders(<TutorMemoryCard />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Remove Enzymes" }));
    expect(forget).toHaveBeenCalledWith("m1");
    await waitFor(() => expect(screen.queryByText("Enzymes")).not.toBeInTheDocument());
    expect(screen.getByText("Bonding")).toBeInTheDocument();
  });

  it("forgets everything", async () => {
    renderWithProviders(<TutorMemoryCard />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Forget all of it" }));
    expect(forgetAll).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Nothing is remembered yet.")).toBeInTheDocument();
  });

  it("can be switched off, and says what that means", async () => {
    renderWithProviders(<TutorMemoryCard />);
    const toggle = screen.getByRole("switch", { name: /Let the tutor remember/ });
    expect(toggle).toBeChecked();
    await userEvent.setup().click(toggle);
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/The tutor starts fresh each time/)).toBeInTheDocument();
  });

  it("says so when nothing is remembered", async () => {
    rows = [];
    renderWithProviders(<TutorMemoryCard />);
    expect(await screen.findByText("Nothing is remembered yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Forget all of it" })).not.toBeInTheDocument();
  });
});
