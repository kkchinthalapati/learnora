import { beforeEach, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import { learningEventsApi } from "../../api/learningEvents";
import { ChallengeSprintRunner } from "./ChallengeSprintRunner";
vi.mock("../../api/learningEvents", () => ({ learningEventsApi: { record: vi.fn().mockResolvedValue(undefined) } }));
const question = { id: "q1", question: "Which is correct?", options: ["Correct choice", "Wrong choice"], correctAnswerIndex: 0, baitOptionIndex: 1,
  trapArchetypeId: "trap", trapName: "Distractor", baitExplanation: "Bait", trapExplanation: "Explanation", hint: "Hint", topic: "Enzymes" };
beforeEach(() => vi.clearAllMocks());
it.each([["Correct choice", 1], ["Wrong choice", 0]] as const)("records %s as score %s on the question topic", async (answer, score) => {
  renderWithProviders(<ChallengeSprintRunner questions={[question]} subject="Biology" onComplete={() => {}} onExit={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: new RegExp(answer) }));
  await userEvent.click(screen.getByRole("button", { name: /confirm|lock/i }));
  expect(learningEventsApi.record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ source: "detective", topicKey: "enzymes", score, payload: { trapId: "trap" } }));
});
