import { expect, it, vi } from "vitest";
import { generateQuizQuestions } from "./aiQuiz";
import { callEdge } from "./ai";
import { quizzesApi } from "./quizzes";
import { loadSettings } from "../lib/settings";
vi.mock("./ai", () => ({ callEdge: vi.fn() }));
vi.mock("./misconceptions", () => ({ misconceptionsApi: { fetchAll: async () => [] } }));
it("generates questions without creating a library quiz", async () => {
  const questions = [{ question: "Which?", choices: ["A", "B", "C", "D"], correctIndex: 1, feedback: "Because B." }];
  vi.mocked(callEdge).mockResolvedValue({ text: JSON.stringify(questions) });
  const add = vi.spyOn(quizzesApi, "add");
  expect(await generateQuizQuestions({ topic: "Enzymes", sourceText: "Notes on enzymes", settings: loadSettings(), options: { questionCount: 4 } })).toHaveLength(1);
  expect(add).not.toHaveBeenCalled();
  expect(callEdge).toHaveBeenCalledWith(expect.objectContaining({ tool: "quiz", mode: "quiz" }));
});
