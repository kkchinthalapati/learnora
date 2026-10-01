import { test, expect, loginAs } from "../e2e/support/fixtures";
import { StudentLog } from "./support/record";

/* Journey 2 — "I don't understand my homework."
 *
 * A Grade 9 student wants to ask the AI something. This drives the real chat
 * UI and records what the interface does: how it is found, what sending looks
 * like, whether context survives, and what an error or a spent daily quota
 * looks like to a kid.
 *
 * The AI backend is stubbed, so nothing here is evidence about teaching
 * quality — only about how the UI handles a simulated reply.
 */

const CHAT_INPUT = "AI chat input";

async function chatText(page: import("@playwright/test").Page): Promise<string> {
  return page
    .getByLabel("Learnora AI chat")
    .innerText()
    .catch(() => "(chat panel not found)");
}

test("ai tutor: find it, ask badly, follow up, break it", async ({
  page,
  backend,
}) => {
  test.setTimeout(110_000);
  const log = new StudentLog("02-ai-tutor", page);

  backend.aiReply = () =>
    "Photosynthesis is how plants make their own food using sunlight. " +
    "Leaves take in carbon dioxide and water, and sunlight powers a reaction " +
    "that turns them into sugar and oxygen.";

  log.did("Logged in");
  await log.timed("sign in", async () => {
    await loginAs(page);
  });
  await log.shot("landed");

  /* ---- 1. Where do I even ask a question? --------------------------- */
  log.did("Looked around the first screen for anything that looks like an AI to talk to");
  const landingText = await log.visibleText(1400);
  log.saw(`First screen:\n${landingText}`);
  const landingButtons = await log.affordances();
  log.saw(`Clickable things: ${landingButtons.join(" | ")}`);
  const aiLooking = landingButtons.filter((label) =>
    /ai|ask|chat|tutor|help|what next/i.test(label),
  );
  log.saw(`Things whose name sounds like "ask the AI": ${aiLooking.join(" | ") || "(none)"}`);

  let clicks = 0;
  let foundChat = false;

  /* A kid tries the sidebar first. */
  log.did("Tried the sidebar to see if there's an 'AI Tutor' link");
  const sidebarLinks = await page
    .getByRole("navigation")
    .first()
    .locator("a")
    .allInnerTexts()
    .catch(() => [] as string[]);
  log.saw(`Sidebar links: ${sidebarLinks.map((s) => s.replace(/\s+/g, " ").trim()).join(" | ")}`);

  /* Try the URL a student would guess / that marketing might mention. */
  log.did("Typed /ai-tutor in the address bar because that's what it's called");
  await page.goto("ai-tutor");
  await page.waitForLoadState("networkidle").catch(() => {});
  log.saw(`/ai-tutor took me to: ${new URL(page.url()).pathname}`);
  log.saw(`That page says:\n${await log.visibleText(900)}`);
  await log.shot("ai-tutor-url");

  /* Back to the dashboard and hunt for the AI actions card. */
  log.did("Went to the dashboard and started clicking tabs looking for the AI");
  await page.goto("dashboard");
  await page.waitForLoadState("networkidle").catch(() => {});
  clicks += 1;
  const tabs = await page.getByRole("tab").allInnerTexts().catch(() => [] as string[]);
  log.saw(`Dashboard tabs: ${tabs.join(" | ")}`);

  for (const tabName of ["Activity & Peers", "All"]) {
    const tab = page.getByRole("tab", { name: tabName }).first();
    if (!(await tab.isVisible().catch(() => false))) continue;
    log.did(`Clicked the "${tabName}" tab`);
    await tab.click().catch(() => {});
    await page.waitForTimeout(800);
    clicks += 1;
    log.saw(`Under "${tabName}" I can click: ${(await log.affordances()).join(" | ")}`);
    const whatNext = page.getByRole("button", { name: "What next?" }).first();
    if (await whatNext.isVisible().catch(() => false)) {
      log.saw(`Found a "What next?" button under the "${tabName}" tab`);
      await log.shot("ai-actions-card");
      const card = await log.visibleText(1600);
      log.saw(`That part of the dashboard says:\n${card}`);
      log.did("Clicked 'What next?'");
      await log.timed("what-next opens chat", async () => {
        await whatNext.click().catch(() => {});
        await page
          .getByLabel(CHAT_INPUT)
          .waitFor({ state: "visible", timeout: 15_000 })
          .catch(() => {});
      });
      clicks += 1;
      foundChat = await page.getByLabel(CHAT_INPUT).isVisible().catch(() => false);
      break;
    }
  }
  log.saw(`Chat panel open after hunting? ${foundChat}. Clicks spent: ${clicks}`);
  await log.shot("chat-open");

  if (foundChat) {
    log.saw(`Chat panel content right after opening:\n${await chatText(page)}`);
    log.saw(`Buttons inside the chat: ${(await log.affordances()).join(" | ")}`);
  } else {
    log.thought("I could not get the chat open from the dashboard at all.");
    log.did("Fell back to the command palette (Ctrl+K) since nothing else worked");
    await page.keyboard.press("Control+k").catch(() => {});
    clicks += 1;
    await log.shot("command-palette");
    log.saw(`Command palette:\n${await log.visibleText(800)}`);
    await page.keyboard.type("ai: hello").catch(() => {});
    await page.keyboard.press("Enter").catch(() => {});
    await page
      .getByLabel(CHAT_INPUT)
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => {});
    foundChat = await page.getByLabel(CHAT_INPUT).isVisible().catch(() => false);
    log.saw(`Chat open via command palette? ${foundChat}`);
  }

  const input = page.getByLabel(CHAT_INPUT).first();
  const sendButton = page.getByRole("button", { name: "Send message" }).first();

  /** Type a message and press Enter, then wait for the panel text to grow. */
  async function ask(label: string, text: string): Promise<void> {
    log.did(`Typed: "${text}"`);
    const before = await chatText(page);
    try {
      await input.fill(text);
      await input.press("Enter");
    } catch (err) {
      log.saw(`Could not type into the chat: ${String(err).slice(0, 200)}`);
      return;
    }
    await log.timed(label, async () => {
      await page
        .waitForFunction(
          (previousLength) => {
            const panel = document.querySelector('[aria-label="Learnora AI chat"]');
            return !!panel && (panel as HTMLElement).innerText.length > previousLength + 20;
          },
          before.length,
          { timeout: 20_000 },
        )
        .catch(() => {});
    });
    /* Let any retry / error bubble land before reading the screen. */
    await page.waitForTimeout(1500);
    log.saw(`Chat now shows:\n${(await chatText(page)).slice(-1200)}`);
  }

  if (foundChat) {
    /* ---- 2. A vague, badly-phrased question ------------------------- */
    await ask("vague question round-trip", "bro what does this even mean");
    await log.shot("vague-question");

    /* ---- 3. A real but sloppy question ------------------------------ */
    await ask(
      "sloppy question round-trip",
      "explain photosynthesis simply pls i dont get it",
    );
    await log.shot("sloppy-question");

    /* ---- 4. Context-dependent follow-up ----------------------------- */
    backend.aiReply = () =>
      "It happens because chlorophyll absorbs light energy, and that energy " +
      "splits water molecules, which releases the oxygen.";
    await ask("follow-up round-trip", "wait why does that happen tho");
    await log.shot("followup");
    const sentBodies = backend.calls
      .filter((c) => c.path.includes("learnora-ai"))
      .map((c) => JSON.stringify(c.body).slice(0, 600));
    log.saw(
      `What the app actually sent to the AI endpoint (does it carry history?):\n${sentBodies.join(
        "\n---\n",
      )}`,
    );

    /* ---- 5. "Still don't get it" — is there a shortcut? ------------- */
    log.did("Looked for a button like 'explain simpler' or 'give me an example'");
    const afterReply = await log.affordances();
    log.saw(`Buttons available after a reply: ${afterReply.join(" | ")}`);
    const shortcuts = afterReply.filter((label) =>
      /simpl|example|again|regenerate|retry|explain|eli5|shorter/i.test(label),
    );
    log.saw(`Shortcuts for "I still don't get it": ${shortcuts.join(" | ") || "(none found)"}`);
    backend.aiReply = () =>
      "Simpler: plants eat sunlight. Sun + water + air = plant food + the air we breathe.";
    await ask("ask-simpler round-trip", "i still dont get it can u say it even simpler");
    await log.shot("simpler");

    /* ---- 6. Empty message and a very long ramble -------------------- */
    log.did("Pressed Enter with the box empty, to see what happens");
    const beforeEmpty = await chatText(page);
    await input.fill("").catch(() => {});
    await input.press("Enter").catch(() => {});
    await page.waitForTimeout(1200);
    const afterEmpty = await chatText(page);
    log.saw(
      `Empty send: panel text ${
        afterEmpty === beforeEmpty ? "did NOT change (nothing sent)" : "CHANGED — something was sent"
      }`,
    );
    log.did("Clicked the send arrow with the box still empty");
    const sendDisabled = await sendButton.isDisabled().catch(() => null);
    log.saw(`Send button disabled while the box is empty? ${sendDisabled}`);
    const callsBeforeEmptyClick = backend.calls.filter((c) =>
      c.path.includes("learnora-ai"),
    ).length;
    /* force: the button is (correctly) disabled while the box is empty, and a
       plain click() on a disabled element does not fail — it waits for the
       button to become enabled, which here never happens, until the whole
       test times out. A student's click on a disabled button simply does
       nothing, which is what force + a short timeout reproduce. */
    await sendButton.click({ force: true, timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const callsAfterEmptyClick = backend.calls.filter((c) =>
      c.path.includes("learnora-ai"),
    ).length;
    log.saw(
      `Clicking send on an empty box fired ${
        callsAfterEmptyClick - callsBeforeEmptyClick
      } AI request(s); any visible feedback? "${(await chatText(page)).slice(-160)}"`,
    );
    await log.shot("empty-send");

    const ramble =
      "ok so basically in class today miss was talking about photosynthesis and " +
      "the light reactions and then she said something about ATP and NADPH and the " +
      "calvin cycle and i wrote it down but i dont get how the light bit connects " +
      "to the sugar bit and also she said something about stomata and i think " +
      "thats the holes in the leaf but i dont know if thats the same thing and " +
      "the test is on friday and i also dont get respiration and whether its the " +
      "opposite of this or not so can you just explain the whole thing please ";
    backend.aiReply = () =>
      "## The short version\n\n1. **Light reactions** make ATP and NADPH.\n" +
      "2. **Calvin cycle** uses them to build sugar.\n\n" +
      "`6CO2 + 6H2O -> C6H12O6 + 6O2`\n\n" +
      "> Respiration is roughly the reverse.\n\n" +
      ("Stomata are the pores that let CO2 in and O2 out. ".repeat(20));
    await ask("long ramble round-trip", ramble.repeat(2).slice(0, 1800));
    await log.shot("long-message");
    const panelScroll = await page
      .evaluate(() => {
        const panel = document.querySelector('[aria-label="Learnora AI chat"]') as HTMLElement | null;
        if (!panel) return null;
        return {
          panelWidth: Math.round(panel.getBoundingClientRect().width),
          overflowsRight:
            panel.getBoundingClientRect().right > window.innerWidth + 1,
          hasCode: !!panel.querySelector("code, pre"),
          hasList: !!panel.querySelector("ol, ul"),
          hasHeading: !!panel.querySelector("h1, h2, h3"),
          hasBold: !!panel.querySelector("strong, b"),
        };
      })
      .catch(() => null);
    log.saw(`Markdown/layout handling of the simulated long reply: ${JSON.stringify(panelScroll)}`);

    /* ---- 7. Make it fail --------------------------------------------- */
    /* times:2 — the app retries once, so two 500s cover exactly this ask and
       nothing after it, leaving the quota check below uncontaminated. */
    log.did("(setup) Server now returns 500 for the AI call");
    backend.stub("learnora-ai", 500, { error: "The server blew up" }, { times: 2 });
    await ask("failed request round-trip", "why is the sky blue");
    await log.shot("server-error");
    log.saw(`After the failure the chat shows:\n${(await chatText(page)).slice(-800)}`);
    log.saw(`Buttons after the failure: ${(await log.affordances()).join(" | ")}`);
    const toastText = await page
      .locator("[role=status], [role=alert]")
      .allInnerTexts()
      .catch(() => [] as string[]);
    log.saw(`Any toast/alert on screen: ${toastText.join(" | ") || "(none)"}`);

    log.did("(setup) Used up the whole daily chat allowance, then asked again");
    backend.spendAiRequests(999, "chat");
    await ask("daily limit round-trip", "ok what about gravity then");
    await log.shot("daily-limit");
    log.saw(`Daily-limit message as a student sees it:\n${(await chatText(page)).slice(-800)}`);
    const limitAffordances = await log.affordances();
    log.saw(`Buttons offered when out of allowance: ${limitAffordances.join(" | ")}`);

    /* ---- 8. Navigate away and come back ------------------------------ */
    log.did("Got distracted, clicked Library in the sidebar (in-app nav, no reload)");
    const beforeNav = await chatText(page);
    log.saw(`Message count marker before leaving: ${beforeNav.length} chars of transcript`);
    await page
      .getByRole("navigation")
      .first()
      .getByRole("link", { name: "Library" })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(2000);
    await log.shot("navigated-away");
    const chatStillOpen = await page.getByLabel(CHAT_INPUT).isVisible().catch(() => false);
    log.saw(`Is the chat panel still open after an in-app route change? ${chatStillOpen}`);
    if (chatStillOpen) {
      const afterNav = await chatText(page);
      log.saw(
        `Transcript after navigating: ${afterNav.length} chars — ${
          afterNav.length >= beforeNav.length - 50 ? "conversation kept" : "conversation LOST"
        }`,
      );
      log.saw(`Tail of transcript after navigating:\n${afterNav.slice(-600)}`);
    }

    log.did("Reloaded the page (closed the tab and came back)");
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);
    const openAfterReload = await page.getByLabel(CHAT_INPUT).isVisible().catch(() => false);
    log.saw(`Chat panel open after a reload? ${openAfterReload}`);
    if (openAfterReload) {
      log.saw(`Transcript after reload:\n${(await chatText(page)).slice(0, 800)}`);
    } else {
      log.saw("After a reload the chat is closed — reopening via ⌘K to check history survived");
      await page.keyboard.press("Control+k").catch(() => {});
      await page.waitForTimeout(600);
      await page.keyboard.type("ai: are you still there").catch(() => {});
      await page.keyboard.press("Enter").catch(() => {});
      await page
        .getByLabel(CHAT_INPUT)
        .waitFor({ state: "visible", timeout: 10_000 })
        .catch(() => {});
      await page.waitForTimeout(1500);
      log.saw(`Reopened chat after reload shows:\n${(await chatText(page)).slice(0, 900)}`);
    }
    await log.shot("after-reload");
  }

  log.write({
    finalUrl: page.url(),
    clicksToFindChat: clicks,
    unhandledBackendCalls: backend.unhandled,
  });

  expect(page.url()).toContain("/app");
});
