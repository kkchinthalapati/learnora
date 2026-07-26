import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const ui = readFileSync(join(root, "js", "ui.js"), "utf8");
const main = readFileSync(join(root, "js", "main.js"), "utf8");

const showToast = (() => {
  const start = ui.indexOf("  showToast(message,");
  assert.ok(start !== -1, "showToast not found in js/ui.js");
  const rest = ui.slice(start);
  return rest.slice(0, rest.indexOf("\n  },") + 4);
})();

test("toasts reach screen readers", async (t) => {
  await t.test("the container ships in the markup", () => {
    // A live region has to be in the DOM and observed before content lands in
    // it. Creating it lazily on the first toast meant the first announcement
    // was routinely swallowed.
    assert.ok(
      /<div\s+id="toast-container"/.test(html),
      "#toast-container must exist at page load, not be created on first use"
    );
  });

  await t.test("the shipped container is a polite live region", () => {
    const container = html.match(/<div\s+id="toast-container"[\s\S]*?>/)?.[0] ?? "";
    assert.match(container, /role="status"/);
    assert.match(container, /aria-live="polite"/);
  });

  await t.test("the JS fallback container is also a live region", () => {
    // Other pages (reset-password.html, verify.html) don't ship the container.
    const fallback = showToast.slice(0, showToast.indexOf("const toast ="));
    assert.ok(fallback.includes('"aria-live"'), "the created container needs aria-live");
    assert.ok(fallback.includes('"role"'), "the created container needs a role");
  });

  await t.test("errors interrupt, confirmations wait their turn", () => {
    assert.ok(
      /role"?,\s*error \? "alert" : "status"/.test(showToast),
      "error toasts should be role=alert, routine ones role=status"
    );
  });
});

test("toast text is not built through innerHTML", async (t) => {
  await t.test("the message goes in as text", () => {
    assert.ok(
      !showToast.includes("innerHTML"),
      "showToast must not assign innerHTML — use textContent"
    );
    assert.ok(/text\.textContent = message/.test(showToast), "the message should be set as text");
  });
});

test("exam details are escaped before rendering", async (t) => {
  await t.test("difficulty and status go through esc()", () => {
    // Both are read straight from the row and interpolated into innerHTML.
    // RLS scopes rows to their owner, so this is self-XSS rather than a
    // cross-user hole — but it is a free fix and the rest of the template
    // already escapes.
    assert.ok(
      /\$\{esc\(exam\.difficulty\)\}/.test(main),
      "exam.difficulty must be escaped"
    );
    assert.ok(/\$\{esc\(exam\.status\)\}/.test(main), "exam.status must be escaped");
  });

  await t.test("no unescaped exam field is left in an innerHTML template", () => {
    // Scoped to innerHTML specifically: setAttribute("aria-label", `…${exam.exam_name}`)
    // is fine, because the attribute API never parses markup.
    const sinks = main.match(/\.innerHTML\s*\+?=\s*`[\s\S]*?`;/g) || [];
    const raw = sinks.flatMap((s) => s.match(/\$\{exam\.\w+\}/g) || []);
    assert.deepStrictEqual(raw, [], `unescaped exam fields in innerHTML: ${raw.join(", ")}`);
  });
});

test("the mobile sidebar drawer is a proper disclosure", async (t) => {
  const boot = ui.slice(ui.indexOf("// 1. Mobile Sidebar Logic"));
  const block = boot.slice(0, boot.indexOf("// 2. Turbo Button Toggle"));

  await t.test("the toggle exposes its state", () => {
    assert.ok(block.includes("aria-expanded"), "the hamburger must report aria-expanded");
    assert.ok(block.includes("aria-controls"), "and point at what it controls");
  });

  await t.test("Escape closes the drawer", () => {
    // It dims the page behind it; without this the only way out was the
    // hamburger or the backdrop.
    assert.ok(/Escape/.test(block), "Escape must dismiss the mobile drawer");
    assert.ok(/menuToggle\.focus\(\)/.test(block), "focus should return to the trigger");
  });

  await t.test("every close path goes through one helper", () => {
    // The overlay click, nav-link click and Escape each used to re-implement
    // this, which is how aria-expanded would drift out of sync. Counts both
    // calls and the bare reference passed to addEventListener.
    const closes = block.match(/closeDrawer\b/g) || [];
    assert.ok(
      closes.length >= 4,
      `expected the definition plus all three close paths, saw ${closes.length}`
    );
    assert.ok(
      !/overlay\.classList\.remove\("active"\);\s*\n\s*\}\);/.test(block),
      "no close path should hand-roll the class juggling any more"
    );
  });
});
