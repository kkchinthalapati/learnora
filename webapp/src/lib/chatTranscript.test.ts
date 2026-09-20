import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTranscript,
  loadTranscript,
  saveTranscript,
  MAX_STORED_MESSAGES,
} from "./chatTranscript";
import type { ChatMessage } from "../context/chat";

function msg(id: string, text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id, role: "user", text, ...extra } as ChatMessage;
}

describe("chatTranscript", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips the messages and the model-facing thread", () => {
    saveTranscript("user-1", {
      messages: [msg("m1", "what is osmosis"), msg("m2", "Water moves…", { role: "ai" })],
      history: [
        { role: "user", content: "what is osmosis" },
        { role: "model", content: "Water moves…" },
      ],
    });

    const back = loadTranscript("user-1");
    expect(back.messages.map((m) => m.text)).toEqual(["what is osmosis", "Water moves…"]);
    /* The thread matters as much as the bubbles: restoring only what is on
       screen would leave the student looking at a conversation the tutor
       cannot see, so the next follow-up would answer out of nowhere. */
    expect(back.history).toHaveLength(2);
  });

  /* A shared laptop is the ordinary case for this age group. */
  it("never hands one account's conversation to another", () => {
    saveTranscript("user-1", { messages: [msg("m1", "private revision")], history: [] });
    expect(loadTranscript("user-2").messages).toEqual([]);
    expect(loadTranscript("user-1").messages).toHaveLength(1);
  });

  it("drops a pending message rather than restoring a bubble that spins forever", () => {
    saveTranscript("user-1", {
      messages: [msg("m1", "hi"), msg("m2", "", { role: "ai", pending: true })],
      history: [],
    });
    const back = loadTranscript("user-1");
    expect(back.messages).toHaveLength(1);
    expect(back.messages[0].id).toBe("m1");
  });

  it("keeps the newest turns when the conversation runs long", () => {
    const many = Array.from({ length: MAX_STORED_MESSAGES + 10 }, (_, i) =>
      msg(`m${i}`, `message ${i}`),
    );
    saveTranscript("user-1", { messages: many, history: [] });

    const back = loadTranscript("user-1");
    expect(back.messages).toHaveLength(MAX_STORED_MESSAGES);
    expect(back.messages.at(-1)?.text).toBe(`message ${MAX_STORED_MESSAGES + 9}`);
  });

  it("returns an empty transcript rather than throwing on unreadable storage", () => {
    localStorage.setItem("learnora:chat_transcript:user-1", "{not json");
    expect(loadTranscript("user-1")).toEqual({ messages: [], history: [] });
  });

  /* Private windows and blocked site data make these throw. A chat panel
     that cannot open because a save failed is worse than one that forgets. */
  it("survives storage refusing to write", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    expect(() =>
      saveTranscript("user-1", { messages: [msg("m1", "hi")], history: [] }),
    ).not.toThrow();
    setItem.mockRestore();
  });

  it("forgets a signed-out account on request", () => {
    saveTranscript("user-1", { messages: [msg("m1", "hi")], history: [] });
    clearTranscript("user-1");
    expect(loadTranscript("user-1").messages).toEqual([]);
  });

  it("writes nothing when there is no account", () => {
    saveTranscript(null, { messages: [msg("m1", "hi")], history: [] });
    expect(localStorage.length).toBe(0);
    expect(loadTranscript(null)).toEqual({ messages: [], history: [] });
  });
});
