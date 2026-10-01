import type { Page, Route } from "@playwright/test";
import { test, expect, loginAs } from "../e2e/support/fixtures";
import type { MockBackend, Row } from "../e2e/support/mockBackend";

/* Flashcard review with the network switched off — the whole journey, on a
 * production build (playwright.offline.config.ts):
 *
 *   1. Online, the app stores the due cards (and an image) on the device and
 *      the service worker caches the review screen.
 *   2. context.setOffline(true); the page is RELOADED — a true offline start
 *      served by the worker — and cards are reviewed from the daily drill
 *      and from a deck's own URL. Nothing is written to the backend.
 *   3. Back online, the queued reviews sync: each lands once, a card already
 *      reviewed later on "another device" keeps that newer review, and a
 *      replayed stale review changes nothing.
 *   4. Signing out wipes the device's copy of the cards.
 */

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function seed(backend: MockBackend) {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  backend.seed("folders", [{ id: "f-bio", name: "Biology", color: "#10b981", created_at: past }]);
  backend.seed("flashcard_decks", [
    { id: "deck-cells", title: "Cells", folder_id: "f-bio", created_at: past },
    { id: "deck-genes", title: "Genetics", folder_id: "f-bio", created_at: past },
  ]);
  backend.seed("flashcards", [
    { id: "card-1", deck_id: "deck-cells", front: "What makes ATP?", back: "Mitochondria", next_review_date: null, srs_interval: 0, ease_factor: 2.5, front_image_path: "11111111-1111-4111-8111-111111111111/cell.png", created_at: past },
    { id: "card-2", deck_id: "deck-cells", front: "What reads mRNA?", back: "Ribosomes", next_review_date: past, srs_interval: 1, ease_factor: 2.5, created_at: past },
    { id: "card-3", deck_id: "deck-genes", front: "What does DNA stand for?", back: "Deoxyribonucleic acid", next_review_date: null, srs_interval: 0, ease_factor: 2.5, created_at: past },
  ]);
}

/* Card images: signed-URL minting and the image bytes, which the shared mock
 * doesn't model. Registered after the backend, so it wins for these paths. */
async function serveCardImages(page: Page) {
  await page.route("**/storage/v1/object/sign/**", async (route: Route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ signedURL: "/object/sign/card-media/cell.png?token=t" }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
}

/* PostgREST's conditional update, for the one write this feature makes: the
 * shared mock treats an `or=` filter as "match everything", which would make
 * the newest-review-wins rule untestable here. Applies exactly the filter the
 * app sends — `last_reviewed_at.is.null` or `.lt.<review time>`. */
async function honourReviewOrdering(page: Page, backend: MockBackend, applied: string[]) {
  await page.route("**/rest/v1/flashcards?*", async (route: Route) => {
    const request = route.request();
    if (request.method() !== "PATCH") return route.fallback();
    const url = new URL(request.url());
    const orFilter = url.searchParams.get("or") ?? "";
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    const body = request.postDataJSON() as Row;
    backend.calls.push({ method: "PATCH", path: url.pathname + url.search, body });
    const row = backend.table("flashcards").find((r) => r.id === id);
    const limit = /last_reviewed_at\.lt\.([^,)]+)/.exec(orFilter)?.[1];
    const stored = row?.last_reviewed_at as string | null | undefined;
    const matches = !!row && (!limit || stored == null || stored < limit);
    if (matches && row) {
      Object.assign(row, body);
      applied.push(String(id));
    }
    await route.fulfill({ status: 204, body: "" });
  });
}

async function offlineSnapshotKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open("learnora-offline");
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("snapshots")) return resolve([]);
          const req = db.transaction("snapshots").objectStore("snapshots").getAllKeys();
          req.onsuccess = () => resolve(req.result.map(String));
          req.onerror = () => resolve([]);
        };
      }),
  );
}

const SUPABASE = "**/mlvgqwqiynpwpwzqufdf.supabase.co/**";
/* Playwright still fulfils routed requests under setOffline, so the backend
   is cut explicitly too: offline means the server is unreachable. */
const unreachable = (route: Route) => route.abort("internetdisconnected");

test("flashcard review works offline and syncs once, newest review winning", async ({ page, backend }) => {
  seed(backend);
  await serveCardImages(page);
  const applied: string[] = [];
  await honourReviewOrdering(page, backend, applied);

  /* ── 1. Online: the device gets ready ─────────────────────────────────── */
  await loginAs(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => offlineSnapshotKeys(page), { timeout: 30_000 })
    .toEqual([backend.user.id]);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          const assets = keys.find((k) => k.startsWith("learnora-assets-"));
          if (!assets) return false;
          const urls = (await (await caches.open(assets)).keys()).map((r) => r.url);
          return urls.some((u) => /ReviewView-[\w-]+\.js$/.test(u));
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  const writesBeforeOffline = backend.calls.filter((c) => c.method === "PATCH").length;

  /* ── 2. Offline: a cold start, then review ────────────────────────────── */
  await page.context().setOffline(true);
  await page.route(SUPABASE, unreachable);
  await page.reload();

  const banner = page.getByRole("status").filter({ hasText: "Offline" });
  await expect(banner).toContainText("Offline · flashcard review still works");
  await page.screenshot({ path: test.info().outputPath("1-offline-start.png") });
  await banner.getByRole("link", { name: "Review cards" }).click();

  await expect(page.getByRole("heading", { name: "Your due cards" })).toBeVisible();
  await expect(page.getByText("3 cards are due.")).toBeVisible();
  await page.getByRole("button", { name: "Start review" }).click();
  let sawImage = false;
  for (let i = 0; i < 3; i++) {
    const flip = page.getByRole("button", { name: "Flip card to see the answer" });
    await expect(flip).toBeVisible();
    if (await page.getByText("What makes ATP?").isVisible()) {
      // The card's image, from the device's saved copy — no signed URL offline.
      await expect(page.locator('img[src^="blob:"]').first()).toBeVisible();
      sawImage = true;
      await page.screenshot({ path: test.info().outputPath("2-offline-card-with-image.png") });
    }
    await flip.click();
    await page.getByRole("button", { name: "Good (3)" }).click();
  }
  expect(sawImage).toBe(true);
  await expect(page.getByRole("heading", { name: /^(Review|Drill) complete$/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "waiting to sync" })).toContainText(
    "Offline · 3 reviews waiting to sync",
  );
  await page.screenshot({ path: test.info().outputPath("3-offline-reviewed.png") });

  // A deck's own URL, loaded offline: the worker serves the shell, and the
  // device's copy already knows its one card was just graded.
  await page.goto("review/deck-genes");
  await expect(page.getByRole("heading", { name: "Genetics" })).toBeVisible();
  await expect(page.getByText("All caught up", { exact: true })).toBeVisible();

  // Anything else says it needs a connection instead of breaking.
  await page.goto("analytics");
  await expect(page.getByText("this page can't load anything new until you reconnect", { exact: false })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("4-offline-other-page.png") });

  expect(backend.calls.filter((c) => c.method === "PATCH").length).toBe(writesBeforeOffline);

  /* "Another device" reviews card-2 after this offline session did. */
  const card2 = backend.table("flashcards").find((r) => r.id === "card-2")!;
  const later = new Date(Date.now() + 60 * 60_000).toISOString();
  Object.assign(card2, { last_reviewed_at: later, next_review_date: "2099-01-01T00:00:00.000Z", srs_interval: 99 });

  /* ── 3. Back online: sync ─────────────────────────────────────────────── */
  await page.unroute(SUPABASE, unreachable);
  await page.context().setOffline(false);
  await page.goto("./");
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("learnora:offline_queue") ?? "[]").length), {
      timeout: 30_000,
    })
    .toBe(0);
  await expect(page.getByRole("status").filter({ hasText: "waiting to sync" })).toHaveCount(0);

  /* Three reviews, each written conditionally. A write can go out more than
     once — reconnecting mid-request loses the response and the queue retries
     — but a retry is the SAME review (same card, same stamp), and the server
     applies it once. That is the idempotency this feature promises. */
  const reviewWrites = backend.calls.filter((c) => c.method === "PATCH" && c.path.startsWith("/rest/v1/flashcards"));
  for (const write of reviewWrites) {
    expect(write.path).toContain("or=");
    expect((write.body as Row).last_reviewed_at).toEqual(expect.any(String));
  }
  const distinctReviews = new Set(
    reviewWrites.map((w) => `${new URL(w.path, "http://x").searchParams.get("id")}@${(w.body as Row).last_reviewed_at}`),
  );
  expect(distinctReviews.size).toBe(3);
  // card-1 and card-3 took their offline reviews exactly once; card-2 kept
  // the newer review from the other device.
  expect(applied.sort()).toEqual(["card-1", "card-3"]);
  const rows = Object.fromEntries(backend.table("flashcards").map((r) => [r.id, r]));
  expect(rows["card-1"].srs_interval).toBe(3);
  expect(rows["card-3"].srs_interval).toBe(3);
  expect(rows["card-2"].srs_interval).toBe(99);

  /* A replay of a review that already landed — a retry, a second tab — must
     change nothing. */
  const card1Before = { ...rows["card-1"] };
  await page.evaluate((reviewedAt) => {
    localStorage.setItem(
      "learnora:offline_queue",
      JSON.stringify([
        {
          id: "replay-1",
          type: "submitSrsReview",
          payload: { cardId: "card-1", nextReviewDate: "2030-01-01T00:00:00.000Z", interval: 42, ease: 1.3, reviewedAt },
          timestamp: Date.now(),
          retryCount: 0,
        },
      ]),
    );
    window.dispatchEvent(new Event("online"));
  }, String(card1Before.last_reviewed_at));
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("learnora:offline_queue") ?? "[]").length))
    .toBe(0);
  expect(backend.table("flashcards").find((r) => r.id === "card-1")).toMatchObject({
    srs_interval: card1Before.srs_interval,
    last_reviewed_at: card1Before.last_reviewed_at,
  });
  expect(applied.filter((id) => id === "card-1")).toHaveLength(1);

  /* ── 4. Sign-out wipes the device's copy ──────────────────────────────── */
  await page.goto("settings");
  await page.getByRole("button", { name: "Log Out" }).click();
  await expect.poll(() => offlineSnapshotKeys(page)).toEqual([]);
});
