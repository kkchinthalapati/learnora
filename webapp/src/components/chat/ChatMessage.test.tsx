import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ChatMessageBubble } from "./ChatMessage";
import type { ChatMessage } from "../../context/chat";

const reply = (text: string): ChatMessage => ({ id: "m1", role: "ai", text });

const draw = (text: string, onAsk?: (q: string) => void) =>
  render(
    <MemoryRouter>
      <ChatMessageBubble message={reply(text)} onAsk={onAsk} />
    </MemoryRouter>,
  );

const CARD = 'Here you go.\n\n```openui\nroot = Stack([k, fu])\nk = Callout("key", "One idea.")\nfu = FollowUps(["Quiz me"])\n```\n\nBye.';

afterEach(() => localStorage.setItem("learnora:flag:openUi", "false"));

describe("ChatMessageBubble OpenUI cards", () => {
  it("draws the card between the Markdown runs when the flag is on", async () => {
    localStorage.setItem("learnora:flag:openUi", "true");
    draw(CARD, () => {});
    expect(await screen.findByText("Key idea")).toBeTruthy();
    expect(screen.getByText("Here you go.")).toBeTruthy();
    expect(screen.getByText("Bye.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quiz me" })).toBeTruthy();
  });

  it("says so when part of a card cannot be drawn", async () => {
    localStorage.setItem("learnora:flag:openUi", "true");
    draw('```openui\nroot = Stack([x])\nx = Nonsense("a")\n```');
    expect(await screen.findByRole("note")).toHaveTextContent(/couldn’t be drawn/i);
  });

  it("still draws a card that arrives with the flag off, never its source", async () => {
    draw(CARD);
    expect(await screen.findByText("Key idea")).toBeTruthy();
    expect(screen.queryByText(/root = Stack/)).toBeNull();
  });
});
