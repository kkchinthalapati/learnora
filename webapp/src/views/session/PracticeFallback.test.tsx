import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { clearStudySnapshot } from "../../lib/continuity";
import { SessionView } from "./SessionView";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  bank: vi.fn(),
  first: vi.fn(),
  ranked: [] as { concept: string; subject: string }[],
}));

vi.mock("../../api/aiQuiz", async (orig) => ({
  ...(await orig<typeof import("../../api/aiQuiz")>()),
  generateQuizQuestions: mocks.generate,
}));
vi.mock("../../api/questionBank", () => ({ bankPracticeFor: mocks.bank, bankFirst: mocks.first }));
vi.mock("../../api/learningEvents", () => ({ learningEventsApi: { record: vi.fn(async () => true) } }));
vi.mock("../../hooks/useMisconceptions", () => ({
  useMisconceptions: () => ({ all: mocks.ranked, ranked: mocks.ranked, forSubject: () => [] }),
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
    mocks.first.mockReset();
    mocks.first.mockResolvedValue(null);
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

describe("Practice on a banked spec topic", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
    clearStudySnapshot();
    mocks.generate.mockReset();
    mocks.first.mockReset();
    mocks.ranked = [];
  });
  afterEach(() => vi.restoreAllMocks());

  it("serves the bank first and never asks the AI", async () => {
    mocks.first.mockResolvedValue(BANK);
    renderPractice();
    expect(await screen.findByText("Bank question 0?")).toBeInTheDocument();
    expect(mocks.first).toHaveBeenCalledWith(expect.stringContaining("Osmosis"), expect.any(Number));
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("doesn't claim to mix in other topics when the bank served the problems", async () => {
    mocks.ranked = [{ concept: "Photosynthesis energy source", subject: "Biology" }];
    mocks.first.mockResolvedValue(BANK);
    renderPractice();
    expect(await screen.findByText("Bank question 0?")).toBeInTheDocument();
    expect(screen.queryByText(/mixed with/i)).toBeNull();
  });
});

describe("Practice hints", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
    clearStudySnapshot();
    mocks.ranked = [];
    mocks.first.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("narrow the options but never strike every wrong one", async () => {
    /* Three hints on a four-option problem used to leave only the answer. */
    mocks.first.mockResolvedValue([
      {
        question: "Which term of the AP 3, 8, 13, … is 78?",
        choices: ["15th", "17th", "26th", "16th"],
        correctIndex: 3,
        topic: "Arithmetic Progressions",
      },
    ]);
    renderPractice();
    await screen.findByText("Which term of the AP 3, 8, 13, … is 78?");
    for (let i = 0; i < 3; i++) {
      const hint = screen.getByRole("button", { name: /I’m stuck|No more hints/ });
      if (!hint.hasAttribute("aria-disabled")) await userEvent.click(hint);
    }
    expect(screen.getAllByText(/ruled out by a hint/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: /No more hints/ })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("Practice question flow (revamp step 2)", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
    clearStudySnapshot();
    mocks.generate.mockReset();
    mocks.first.mockReset();
    mocks.first.mockResolvedValue(BANK);
  });
  afterEach(() => vi.restoreAllMocks());

  it("Check stays focusable but says 'Pick an answer first.' until an option is picked", async () => {
    renderPractice();
    await screen.findByText("Bank question 0?");
    const check = screen.getByRole("button", { name: "Check" });
    expect(check).toHaveAttribute("aria-disabled", "true");
    expect(check).not.toBeDisabled();
    await userEvent.click(check);
    expect(screen.getByText("Pick an answer first.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Water/ }));
    expect(screen.queryByText("Pick an answer first.")).toBeNull();
    expect(screen.getByRole("button", { name: "Check" })).not.toHaveAttribute("aria-disabled");
  });

  it("a wrong answer is 'Not quite', neutral, and options stay focusable with the result in their name", async () => {
    renderPractice();
    await screen.findByText("Bank question 0?");
    await userEvent.click(screen.getByRole("button", { name: /Salt/ }));
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Not quite")).toBeInTheDocument();
    expect(screen.queryByText(/✕/)).toBeNull();
    const chosen = screen.getByRole("button", { name: "B: Salt. Your answer · not quite" });
    expect(chosen).toHaveAttribute("aria-disabled", "true");
    expect(chosen).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "A: Water. The right answer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("a right answer after a hint says so, honestly", async () => {
    mocks.first.mockResolvedValue([
      { question: "Pick one?", choices: ["A1", "B1", "C1", "D1"], correctIndex: 0, topic: "T" },
      ...BANK.slice(0, 2),
    ]);
    renderPractice();
    await screen.findByText("Pick one?");
    await userEvent.click(screen.getByRole("button", { name: "I’m stuck" }));
    await userEvent.click(screen.getByRole("button", { name: /A1/ }));
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Right")).toBeInTheDocument();
    expect(screen.getByText(/Nicely worked out. You used a hint/)).toBeInTheDocument();
  });
});

describe("Practice interleaving", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
    clearStudySnapshot();
    mocks.generate.mockReset();
    mocks.first.mockReset();
    mocks.first.mockResolvedValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it("never asks the AI to mix another subject's mistakes into this one", async () => {
    /* An Arithmetic Progressions session was told to interleave photosynthesis. */
    mocks.ranked = [{ concept: "Photosynthesis energy source", subject: "Biology" }];
    mocks.generate.mockResolvedValue(BANK);
    renderPractice();
    expect(await screen.findByText("Bank question 0?")).toBeInTheDocument();
    const [args] = mocks.generate.mock.calls[0] as [{ sourceText: string }];
    expect(args.sourceText).not.toMatch(/Interleave|Photosynthesis/);
    expect(screen.queryByText(/mixed with/i)).toBeNull();
  });
});
