import { test, expect, loginAs } from "./support/fixtures";

/* Voice in the chat, in a real browser. Headless Chromium's own recogniser
 * needs Google's servers, so a scripted one stands in for it — installed
 * before the app loads, exactly where the real one would be. Everything
 * else (the hook's timers, the send path, the UI states) is the real app. */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class ScriptedRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onresult: ((e: unknown) => void) | null = null;
      start() {
        (window as unknown as { __recognition: unknown }).__recognition = this;
        setTimeout(() => this.onstart?.(), 0);
      }
      stop() {}
      abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", { value: ScriptedRecognition });
  });
});

async function say(page: import("@playwright/test").Page, text: string) {
  await page.evaluate((words) => {
    const r = (window as unknown as { __recognition: { onresult: (e: unknown) => void } }).__recognition;
    r.onresult({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: words, confidence: 0.9 } } },
    });
  }, text);
}

test("a spoken question is sent like a typed one once the student pauses", async ({ page, backend }) => {
  backend.aiReply = () => "Osmosis is water moving across a membrane.";
  await loginAs(page);
  await page.getByRole("button", { name: "Ask the tutor" }).first().click();
  const panel = page.getByRole("region", { name: "Learnora AI chat" });

  await panel.getByRole("button", { name: "Speak your question" }).click();
  await expect(panel.getByText(/Listening — pause when you're done/)).toBeVisible();
  await say(page, "what is osmosis");
  await expect(panel.getByLabel("AI chat input")).toHaveValue("what is osmosis");

  const shots = process.env.SCREENSHOT_DIR;
  if (shots) await panel.screenshot({ path: `${shots}/chat-voice-listening.png` });

  // The real 3s silence timer ends the turn; the answer arrives.
  await expect(panel.getByText("Osmosis is water moving across a membrane.")).toBeVisible({
    timeout: 10_000,
  });
  const sent = backend
    .callsTo("/functions/v1/learnora-ai")
    .map((c) => c.body as { history: { content: string }[]; tool?: string });
  expect(sent.at(-1)?.history.at(-1)?.content).toBe("what is osmosis");
  expect(sent.at(-1)?.tool).toBe("chat");
});
