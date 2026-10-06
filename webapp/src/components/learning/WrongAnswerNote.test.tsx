import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { WrongAnswerNote } from "./WrongAnswerNote";

const Q = {
  question: "Which gas do plants take in for photosynthesis?",
  choices: ["Oxygen", "Carbon dioxide", "Nitrogen"],
  correctIndex: 1,
  topic: "Photosynthesis",
};

beforeEach(() => mockAuthSession("user-1"));

describe("every wrong answer gets an explanation", () => {
  it("states the answer and the stored reasoning when there is one", () => {
    renderWithAuth(
      <WrongAnswerNote question={Q} chosenIndex={0} explanation="Plants take in CO₂ and give out O₂." />,
      { session: fakeSession() },
    );
    expect(screen.getByText(/The answer is “Carbon dioxide”/)).toBeInTheDocument();
    expect(screen.getByText(/Plants take in CO₂/)).toBeInTheDocument();
  });

  it("offers the tutor's explanation when the question has none — never nothing", () => {
    renderWithAuth(<WrongAnswerNote question={Q} chosenIndex={0} explanation={null} />, {
      session: fakeSession(),
    });
    expect(screen.getByText(/The answer is “Carbon dioxide”/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Why was I wrong/ })).toBeInTheDocument();
  });
});
