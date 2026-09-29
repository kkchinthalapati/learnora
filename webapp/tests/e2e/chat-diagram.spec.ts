import { test, expect, loginAs } from "./support/fixtures";

/* A tutor reply with a ```mermaid fence, drawn by the real library in a real
 * browser — the part the unit tests have to stub, because jsdom cannot lay
 * out an SVG. Also checks the library is fetched only once a diagram needs
 * it, and that a broken diagram falls back to its source. */

const GOOD = [
  "Here's the water cycle as a loop:",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[Evaporation] --> B[Condensation]",
  "  B --> C[Precipitation]",
  "  C --> D[Collection]",
  "  D --> A",
  "```",
  "",
  "Each stage feeds the next.",
].join("\n");

const BROKEN = "Try this:\n\n```mermaid\nflowchart LR\n  A[Start] --> \n```\n";

test("draws a mermaid diagram from a tutor reply, and falls back when it cannot", async ({ page, backend }) => {
  const mermaidRequests: string[] = [];
  page.on("request", (req) => {
    // The library (a pre-bundled dep in dev), not the small component module.
    if (/\/deps\/(?:mermaid|dompurify)/.test(req.url())) mermaidRequests.push(req.url());
  });

  await loginAs(page);
  await page.getByRole("button", { name: "Ask AI" }).click();
  const panel = page.getByRole("region", { name: "Learnora AI chat" });
  await expect(panel).toBeVisible();
  // Lazy: nothing of mermaid's has been fetched for a chat with no diagram.
  expect(mermaidRequests).toEqual([]);

  backend.aiReply = () => GOOD;
  const input = panel.getByLabel("AI chat input");
  await input.fill("show me the water cycle");
  await input.press("Enter");

  const diagram = panel.getByRole("img", { name: /A flowchart/ });
  await expect(diagram).toBeVisible({ timeout: 20_000 });
  expect(mermaidRequests.length).toBeGreaterThan(0);
  // Decoded as an image — a real drawing, not a broken-image placeholder.
  const size = await diagram.evaluate((el) => ({
    w: (el as HTMLImageElement).naturalWidth,
    h: (el as HTMLImageElement).naturalHeight,
    src: (el as HTMLImageElement).src,
  }));
  expect(size.w).toBeGreaterThan(200);
  expect(size.h).toBeGreaterThan(20);
  expect(size.src).toMatch(/^blob:/);
  await expect(panel.getByText("Each stage feeds the next.")).toBeVisible();
  // Nothing from the model's SVG was put into the page itself.
  expect(await panel.locator("svg foreignObject, svg style").count()).toBe(0);

  const shots = process.env.SCREENSHOT_DIR;
  if (shots) await panel.screenshot({ path: `${shots}/chat-diagram-dark.png` });

  backend.aiReply = () => BROKEN;
  await input.fill("another one");
  await input.press("Enter");
  await expect(panel.getByRole("note")).toContainText("Couldn't draw this diagram");
  await expect(panel.locator("pre code").last()).toContainText("A[Start] -->");

  if (shots) {
    await page.evaluate(() => document.body.classList.remove("dark-theme"));
    // The diagram redraws in the light theme.
    await expect(diagram).toBeVisible();
    await page.waitForTimeout(500);
    await diagram.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: `${shots}/chat-diagram-light.png` });
  }
});
