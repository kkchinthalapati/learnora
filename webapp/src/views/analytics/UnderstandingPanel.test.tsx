import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { SubjectUnderstanding } from "../../lib/understanding";

const state = vi.hoisted(() => ({
  subjects: [] as SubjectUnderstanding[],
  attempts: { data: [], isPending: false, isError: false, refetch: () => {} } as Record<string, unknown>,
  events: { data: [], isPending: false, isError: false, refetch: () => {} } as Record<string, unknown>,
}));

vi.mock("../../hooks/useQuizzes", () => ({
  useQuizAttempts: () => state.attempts,
  useQuizzes: () => ({ data: [], isPending: false }),
}));
vi.mock("../../hooks/useLearningEvents", () => ({ useLearningEvents: () => state.events }));
vi.mock("../../hooks/useMaterials", () => ({ useMaterials: () => ({ data: [], isPending: false }) }));
vi.mock("../../hooks/useFolders", () => ({ useFolders: () => ({ data: [], isPending: false }) }));
/* The fold has its own tests (lib/understanding.test.ts). */
vi.mock("../../lib/understanding", async (orig) => ({
  ...(await orig<typeof import("../../lib/understanding")>()),
  buildUnderstanding: () => state.subjects,
}));

const { UnderstandingPanel } = await import("./UnderstandingPanel");

const renderPanel = () =>
  render(
    <MemoryRouter>
      <UnderstandingPanel />
    </MemoryRouter>,
  );

const BIO: SubjectUnderstanding = {
  subjectId: "bio",
  subject: "Biology",
  summary: "1 secure, 1 still learning, 1 starting to slip.",
  topics: [
    { key: "osmosis", label: "Osmosis", state: "slipping", stateLabel: "Starting to slip", evidence: "3 questions right over 2 days" },
    { key: "enzymes", label: "Enzymes", state: "learning", stateLabel: "Still learning", evidence: "1 question right over 1 day" },
    { key: "cells", label: "Cells", state: "secure", stateLabel: "Secure", evidence: "5 questions right over 3 days" },
  ],
};

describe("UnderstandingPanel", () => {
  beforeEach(() => {
    state.subjects = [BIO];
    state.attempts = { data: [], isPending: false, isError: false, refetch: () => {} };
    state.events = { data: [], isPending: false, isError: false, refetch: () => {} };
  });

  it("shows each subject's topics in words, with what they rest on", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: "Biology" })).toBeInTheDocument();
    expect(screen.getByText("1 secure, 1 still learning, 1 starting to slip.")).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "What you know in Biology" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Osmosis");
    expect(rows[0]).toHaveTextContent("Starting to slip · 3 questions right over 2 days");
    expect(rows[2]).toHaveTextContent("Secure · 5 questions right over 3 days");
    expect(document.body.textContent).not.toContain("%");
  });

  it("leads from a topic to the thing that would help, and leaves a secure one alone", () => {
    renderPanel();
    expect(screen.getByRole("link", { name: "Check it: Osmosis" })).toHaveAttribute(
      "href",
      "/study/new?mode=recall&topic=Osmosis",
    );
    expect(screen.getByRole("link", { name: "Go over it: Enzymes" })).toHaveAttribute(
      "href",
      "/study/new?mode=explain&topic=Enzymes",
    );
    expect(screen.queryByRole("link", { name: /Cells/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open subject" })).toHaveAttribute("href", "/subjects/bio");
  });

  it("says plainly that only answered questions count", () => {
    renderPanel();
    expect(screen.getByText(/only from questions you have answered/)).toBeInTheDocument();
  });

  it("tells a student with nothing checked yet where to begin", () => {
    state.subjects = [];
    renderPanel();
    expect(screen.getByText("Nothing checked yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open a lesson" })).toHaveAttribute("href", "/subjects");
  });

  it("gives no link to a subject for topics it could not place", () => {
    state.subjects = [{ ...BIO, subjectId: null, subject: "Other topics" }];
    renderPanel();
    expect(screen.queryByRole("link", { name: "Open subject" })).not.toBeInTheDocument();
  });

  it("holds its shape while loading", () => {
    state.attempts = { ...state.attempts, isPending: true };
    renderPanel();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing checked yet")).not.toBeInTheDocument();
  });

  it("offers a retry when nothing could be read", () => {
    state.attempts = { ...state.attempts, isError: true };
    state.events = { ...state.events, isError: true };
    renderPanel();
    expect(screen.getByText("This didn't load")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
