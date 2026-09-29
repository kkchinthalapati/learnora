import { test, expect, loginAs } from "./support/fixtures";
import { makePng } from "./support/images";

/* Chat ▸ Generate image. The edge function's image path is covered by the
 * root tests; this proves the browser half: the chip arms image mode, the
 * send draws instead of asking, and the picture comes back through a signed
 * URL from the private bucket and actually renders. */

/* A stand-in "diagram": a white card with a filled circle. */
const DIAGRAM = makePng(320, 240, (x, y) =>
  (x - 160) ** 2 + (y - 120) ** 2 < 80 ** 2 ? [70, 140, 200] : [255, 255, 255],
);

test("draws a diagram on request and shows it from the private bucket", async ({ page, backend }) => {
  const edgeBodies: Record<string, unknown>[] = [];
  await loginAs(page);

  /* Registered after the mock backend, so these win for these two paths. */
  await page.route("**/functions/v1/learnora-ai", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    edgeBodies.push(body);
    await route.fulfill({
      json: {
        text: "Diagram: a labelled plant cell",
        alt: "Diagram: a labelled plant cell",
        imagePath: `${backend.user.id}/cell.png`,
      },
    });
  });
  await page.route("**/storage/v1/object/sign/chat-media/**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: { signedURL: `/object/sign/chat-media/${backend.user.id}/cell.png?token=t` },
      });
      return;
    }
    await route.fulfill({ body: DIAGRAM, contentType: "image/png" });
  });

  await page.getByRole("button", { name: "Ask AI" }).click();
  const panel = page.getByRole("region", { name: "Learnora AI chat" });
  await panel.getByRole("button", { name: "Generate image" }).click();
  await expect(panel.getByText(/Image mode/)).toBeVisible();
  await expect(panel.getByText(/2 left today/)).toBeVisible();

  await panel.getByLabel("AI chat input").fill("a labelled plant cell");
  await panel.getByRole("button", { name: "Draw image" }).click();

  const img = panel.getByRole("img", { name: "Diagram: a labelled plant cell" });
  await expect(img).toBeVisible();
  /* Loaded, not just present: the browser decoded the bytes behind the
     signed URL. */
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(320);
  /* Shown from a blob: URL — the production CSP's img-src does not admit
     the Supabase host, so a signed URL in `src` would be blocked. */
  await expect(img).toHaveAttribute("src", /^blob:/);
  await expect(panel.getByRole("link", { name: /Download/ })).toHaveAttribute(
    "download",
    "learnora-diagram.png",
  );
  expect(edgeBodies).toHaveLength(1);
  expect(edgeBodies[0]).toMatchObject({ mode: "image", tool: "image" });

  /* Optional evidence for a reviewer: the panel in both themes. */
  const shots = process.env.SCREENSHOT_DIR;
  if (shots) {
    await panel.screenshot({ path: `${shots}/chat-image-dark.png` });
    // The theme is one class on <body> (lib/appearance.ts).
    await page.evaluate(() => document.body.classList.remove("dark-theme"));
    await panel.screenshot({ path: `${shots}/chat-image-light.png` });
  }
});
