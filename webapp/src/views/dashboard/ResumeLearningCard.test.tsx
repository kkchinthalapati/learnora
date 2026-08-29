import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { ResumeLearningCard } from "./ResumeLearningCard";
import {
  saveStudySnapshot,
  clearStudySnapshot,
  recordMaterialVisit,
  recordDeckReview,
  recordQuizProgress,
  recordFocusGoal,
} from "../../lib/continuity";

function renderCard(initialRoute = "/") {
  return renderWithAuth(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/" element={<ResumeLearningCard />} />
        <Route path="/library" element={<h1>Library Page</h1>} />
        <Route path="/notes/:materialId" element={<h1>Notes Page</h1>} />
        <Route path="/review/:deckId" element={<h1>Review Page</h1>} />
        <Route path="/quiz/:quizId" element={<h1>Quiz Page</h1>} />
        <Route path="/timer" element={<h1>Timer Page</h1>} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
  );
}

describe("ResumeLearningCard", () => {
  beforeEach(() => {
    localStorage.clear();
    clearStudySnapshot();
    mockAuthSession("user-1");
  });

  it("renders empty state when no study session has been recorded yet", async () => {
    const user = userEvent.setup();
    renderCard();

    expect(
      screen.getByRole("heading", { name: "Pick up where you left off" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Open a note, review a flashcard deck/),
    ).toBeInTheDocument();

    const openLibBtn = screen.getByRole("button", { name: "Open Library" });
    await user.click(openLibBtn);
    expect(
      await screen.findByRole("heading", { name: "Library Page" }),
    ).toBeInTheDocument();
  });

  it("renders active material resume card with progress bar and 1-click resume CTA", async () => {
    const user = userEvent.setup();
    recordMaterialVisit({
      id: "mat-42",
      title: "Cellular Metabolism & ATP",
      folderId: "f-bio",
      scrollPercentage: 65,
    });

    renderCard();

    expect(screen.getByText("Cellular Metabolism & ATP")).toBeInTheDocument();
    expect(screen.getByText("Notes • 65% read")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "65",
    );
    expect(screen.getByText("65% complete")).toBeInTheDocument();

    const resumeBtn = screen.getByRole("button", { name: "Resume" });
    await user.click(resumeBtn);

    expect(
      await screen.findByRole("heading", { name: "Notes Page" }),
    ).toBeInTheDocument();
  });

  it("renders active flashcard deck resume card and navigates to review runner", async () => {
    const user = userEvent.setup();
    recordDeckReview({
      id: "deck-99",
      title: "Organic Chemistry Reactions",
      cardIndex: 7,
      totalCards: 20,
    });

    renderCard();

    expect(screen.getByText("Organic Chemistry Reactions")).toBeInTheDocument();
    expect(screen.getByText("Flashcards • Card 8 of 20")).toBeInTheDocument();
    expect(screen.getByText("40% complete")).toBeInTheDocument();

    const resumeBtn = screen.getByRole("button", { name: "Resume" });
    await user.click(resumeBtn);

    expect(
      await screen.findByRole("heading", { name: "Review Page" }),
    ).toBeInTheDocument();
  });

  it("renders active quiz draft resume card and navigates to quiz runner", async () => {
    const user = userEvent.setup();
    recordQuizProgress({
      id: "quiz-12",
      title: "Molecular Genetics Exam Drill",
      questionIndex: 2,
      totalQuestions: 10,
    });

    renderCard();

    expect(
      screen.getByText("Molecular Genetics Exam Drill"),
    ).toBeInTheDocument();
    expect(screen.getByText("Quiz • Question 3 of 10")).toBeInTheDocument();
    expect(screen.getByText("30% complete")).toBeInTheDocument();

    const resumeBtn = screen.getByRole("button", { name: "Resume" });
    await user.click(resumeBtn);

    expect(
      await screen.findByRole("heading", { name: "Quiz Page" }),
    ).toBeInTheDocument();
  });

  it("renders active focus goal resume card and navigates to timer", async () => {
    const user = userEvent.setup();
    recordFocusGoal({
      task: "Calculus Problem Set 4",
      folderId: "f-math",
      minutesRemaining: 20,
    });

    renderCard();

    expect(screen.getByText("Calculus Problem Set 4")).toBeInTheDocument();
    expect(screen.getByText("Focus Goal • 20m remaining")).toBeInTheDocument();

    const resumeBtn = screen.getByRole("button", { name: "Resume" });
    await user.click(resumeBtn);

    expect(
      await screen.findByRole("heading", { name: "Timer Page" }),
    ).toBeInTheDocument();
  });

  it("displays recent activities tray when multiple study contexts exist", async () => {
    const user = userEvent.setup();
    saveStudySnapshot({
      lastOpenedMaterial: {
        id: "mat-old",
        title: "Photosynthesis Notes",
        scrollPercentage: 50,
        lastVisitedAt: "2026-08-20T10:00:00.000Z",
      },
      lastReviewedDeck: {
        id: "deck-active",
        title: "Biochemistry Decks",
        cardIndex: 3,
        totalCards: 10,
        lastReviewedAt: "2026-08-20T14:00:00.000Z",
      },
    });

    renderCard();

    expect(
      screen.getByRole("heading", { level: 3, name: "Biochemistry Decks" }),
    ).toBeInTheDocument();

    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    expect(screen.getByText("Photosynthesis Notes")).toBeInTheDocument();

    const trayLink = screen.getByRole("link", { name: /Photosynthesis Notes/ });
    await user.click(trayLink);

    expect(
      await screen.findByRole("heading", { name: "Notes Page" }),
    ).toBeInTheDocument();
  });
});
