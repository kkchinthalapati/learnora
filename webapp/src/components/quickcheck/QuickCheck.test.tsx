import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import { authValue, fakeSession } from "../../test/auth";
import { QuickCheck } from "./QuickCheck";

const generate = vi.fn();
const record = vi.fn();
vi.mock("../../api/aiQuiz", async (orig) => ({
  ...(await orig<typeof import("../../api/aiQuiz")>()),
  generateQuizQuestions: (...a: unknown[]) => generate(...a),
}));
vi.mock("../../api/learningEvents", () => ({
  learningEventsApi: { record: (...a: unknown[]) => record(...a), fetchSince: async () => [] },
}));

const questions = [
  { question: "What is Km?", choices: ["A", "B", "C", "D"], correctIndex: 1 },
  { question: "Inhibitor?", choices: ["A", "B", "C", "D"], correctIndex: 0 },
];

describe("QuickCheck", () => {
  beforeEach(() => {
    generate.mockReset().mockResolvedValue(questions);
    record.mockReset().mockResolvedValue(undefined);
  });

  it("asks one question at a time, scores, records and reports", async () => {
    const onDone = vi.fn();
    renderWithProviders(
      <QuickCheck topic="Enzymes" deckId="d1" onDone={onDone} onSkip={() => {}} />,
      authValue({ session: fakeSession() }),
    );
    await screen.findByText("What is Km?");
    await userEvent.click(screen.getByRole("button", { name: "B" }));
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Inhibitor?");
    await userEvent.click(screen.getByRole("button", { name: "C" }));
    await userEvent.click(screen.getByRole("button", { name: /finish/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ correct: 1, total: 2, score: 0.5 })));
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ source: "quick_check", score: 0.5, topicKey: "enzymes", deckId: "d1" }),
    );
  });

  it("shows an error with retry when generation fails", async () => {
    generate.mockRejectedValueOnce(new Error("quota"));
    renderWithProviders(<QuickCheck topic="Enzymes" onDone={() => {}} onSkip={() => {}} />, authValue({ session: fakeSession() }));
    await screen.findByText(/couldn.t build/i);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    await screen.findByText("What is Km?");
  });
});
