import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { clearStudySnapshot } from "../../lib/continuity";
import { SessionView } from "./SessionView";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  bank: vi.fn(),
}));

vi.mock("../../api/aiQuiz", async (orig) => ({
  ...(await orig<typeof import("../../api/aiQuiz")>()),
  generateQuizQuestions: mocks.generate,
}));
vi.mock("../../api/questionBank", () => ({ bankPracticeFor: mocks.bank }));
vi.mock("../../api/learningEvents", () => ({ learningEventsApi: { record: vi.fn(async () => true) } }));
vi.mock("../../hooks/useMisconceptions", () => ({
  useMisconceptions: () => ({ all: [], ranked: [], forSubject: () => [] }),
  useRecordMisconceptions: () => vi.fn(),
}));

const BANK = [0, 1, 2].map((i) => ({
  question: `Bank question ${i}?`,
  choices: ["Water", "Salt"],
  correctIndex: 0,
  topic: "Transport in cells",
  attribution: i === 0 ? "From the Oak National Academy lesson \"Osmosis\". OGL v3.0." : undefined,
}));

function renderPractice() {
  return renderWithAuth(
    <Routes>
      <Route path="/study/:sessionId" element={<SessionView />} />
    </Routes>,
    { session: fakeSession() },
    { initialEntries: ["/study/new?mode=practice&topic=Osmosis"] },
  );
}

describe("Practice when the AI can't write problems", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
    clearStudySnapshot();
    mocks.generate.mockReset();
    mocks.bank.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("serves problems from the question bank, with their attribution", async () => {
    mocks.generate.mockRejectedValue(new Error("AI is temporarily unavailable."));
    mocks.bank.mockResolvedValue(BANK);
    renderPractice();
    expect(await screen.findByText("Bank question 0?")).toBeInTheDocument();
    expect(screen.getByText(/Oak National Academy/)).toBeInTheDocument();
    expect(mocks.bank).toHaveBeenCalledWith(expect.stringContaining("Osmosis"), expect.any(Number));
  });

  it("shows the AI's error when the bank has too little", async () => {
    mocks.generate.mockRejectedValue(new Error("AI is temporarily unavailable."));
    mocks.bank.mockResolvedValue(BANK.slice(0, 1));
    renderPractice();
    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText("Bank question 0?")).toBeNull();
  });
});
