import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../test/mocks/server";
import { SlackWorkspaceView } from "./SlackWorkspaceView";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { resetStore } from "../../lib/slack/slackStore";
import { clearAllThinking } from "../../lib/slack/aiDispatcher";
import { resetAllCooldowns } from "../../lib/slack/aiRotationEngine";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function renderSlackView(initialPath = "/slack/strategy") {
  return renderWithAuth(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/slack" element={<SlackWorkspaceView />} />
        <Route path="/slack/:channelId" element={<SlackWorkspaceView />} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession({ email: "kk.chinthalapati@gmail.com" }) },
  );
}

describe("SlackWorkspaceAI UI Integration", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    clearAllThinking();
    resetAllCooldowns();
  });

  afterEach(() => {
    clearAllThinking();
    resetAllCooldowns();
  });

  it("triggers @K AI mention, displays thinking indicator, and renders AI response with badge and provider tag", async () => {
    server.use(
      http.post(GEMINI_URL, async () => {
        await delay(50);
        return HttpResponse.json({
          candidates: [
            {
              content: {
                parts: [{ text: "Retention-first strategy creates defensible organic student growth." }],
                role: "model",
              },
              finishReason: "STOP",
            },
          ],
        });
      }),
    );

    const user = userEvent.setup();
    renderSlackView("/slack/strategy");

    const composer = screen.getByPlaceholderText(/Message #strategy/i);
    await user.type(composer, "@K AI analyze our moat{enter}");

    // 1. User message appears immediately
    expect(screen.getByText(/analyze our moat/)).toBeInTheDocument();

    // 2. Thinking indicator appears
    expect(
      screen.getByText("is formulating strategic recommendation..."),
    ).toBeInTheDocument();

    // 3. AI response resolves and thinking indicator is replaced
    await waitFor(() => {
      expect(
        screen.getByText("Retention-first strategy creates defensible organic student growth."),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText("is formulating strategic recommendation..."),
    ).not.toBeInTheDocument();

    // Provider tag should be visible
    expect(screen.getByText("gemini")).toBeInTheDocument();
  });

  it("handles @N AI mention in thread, keeping thinking and reply strictly isolated inside ThreadPanel", async () => {
    server.use(
      http.post(GEMINI_URL, async () => {
        await delay(50);
        return HttpResponse.json({
          candidates: [
            {
              content: {
                parts: [{ text: "Operational verification: p99 latency < 150ms guaranteed." }],
                role: "model",
              },
              finishReason: "STOP",
            },
          ],
        });
      }),
    );

    const user = userEvent.setup();
    renderSlackView("/slack/strategy");

    // Open thread on first message
    const replyButtons = screen.getAllByRole("button", { name: /Reply in thread/i });
    await user.click(replyButtons[0]);

    // Thread panel is visible
    expect(screen.getByRole("complementary", { name: /Thread in #strategy/i })).toBeInTheDocument();

    const threadComposer = screen.getByPlaceholderText(/Reply in thread/i);
    await user.type(threadComposer, "@N AI check system reliability{enter}");

    // Thinking indicator appears in thread
    expect(
      screen.getByText("is analyzing operational risks..."),
    ).toBeInTheDocument();

    // AI reply appears in thread
    await waitFor(() => {
      expect(
        screen.getByText("Operational verification: p99 latency < 150ms guaranteed."),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText("is analyzing operational risks..."),
    ).not.toBeInTheDocument();
  });

  it("fails over to Groq when Gemini returns 429 and displays groq provider tag in UI", async () => {
    server.use(
      http.post(GEMINI_URL, () => {
        return HttpResponse.json(
          { error: { code: 429, message: "Resource exhausted" } },
          { status: 429 },
        );
      }),
      http.post(GROQ_URL, () => {
        return HttpResponse.json({
          choices: [
            {
              message: {
                content: "Groq high-speed fallback answer.",
                role: "assistant",
              },
            },
          ],
        });
      }),
    );

    const user = userEvent.setup();
    renderSlackView("/slack/strategy");

    const composer = screen.getByPlaceholderText(/Message #strategy/i);
    await user.type(composer, "@K AI what is the plan under rate limit?{enter}");

    await waitFor(() => {
      expect(screen.getByText("Groq high-speed fallback answer.")).toBeInTheDocument();
    });

    // Provider tag should display groq
    expect(screen.getByText("groq")).toBeInTheDocument();
  });

  it("handles dual mentions (@K AI @N AI) by rendering both AI responses", async () => {
    server.use(
      http.post(GEMINI_URL, () => {
        return HttpResponse.json({
          candidates: [
            {
              content: {
                parts: [{ text: "Executive response from co-founder." }],
                role: "model",
              },
              finishReason: "STOP",
            },
          ],
        });
      }),
    );

    const user = userEvent.setup();
    renderSlackView("/slack/strategy");

    const composer = screen.getByPlaceholderText(/Message #strategy/i);
    await user.type(composer, "@K AI @N AI should we raise external seed capital?{enter}");

    await waitFor(() => {
      const responses = screen.getAllByText("Executive response from co-founder.");
      expect(responses.length).toBe(2);
    });
  });

  it("renders a friendly in-stream error message if all providers fail", async () => {
    server.use(
      http.post(GEMINI_URL, () => HttpResponse.json({ error: { message: "Gemini error" } }, { status: 500 })),
      http.post(GROQ_URL, () => HttpResponse.json({ error: { message: "Groq error" } }, { status: 500 })),
      http.post(OPENROUTER_URL, () => HttpResponse.json({ error: { message: "OpenRouter error" } }, { status: 500 })),
    );

    const user = userEvent.setup();
    renderSlackView("/slack/strategy");

    const composer = screen.getByPlaceholderText(/Message #strategy/i);
    await user.type(composer, "@K AI simulate outage{enter}");

    await waitFor(() => {
      expect(
        screen.getByText(/could not connect to AI providers right now/i),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText("is formulating strategic recommendation..."),
    ).not.toBeInTheDocument();
  });
});
