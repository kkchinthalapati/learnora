import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* A translated label used to be written straight into innerHTML, which deleted
   every element nested inside the target. Two nav links carry live children —
   the flashcards due-count badge and the AI status dot — and applyTranslations()
   runs during boot, so both were destroyed before anything could ever populate
   them. These tests pin the behaviour that replaced it. */

/* Minimal element stand-in: enough DOM surface for setLabelText, and it records
   child order so we can assert the badge survives in the right place. */
class FakeNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this._text = "";
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(value) {
    this._text = value;
    this.children = [];
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

// ui.js wires up document-level listeners at import time.
global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => new FakeNode("div"),
  body: { classList: { contains: () => false, toggle: () => {} }, style: {}, setAttribute: () => {} },
};
global.window = {
  addEventListener: () => {},
  matchMedia: null,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};
global.localStorage = global.window.localStorage;

const { setLabelText } = await import("../js/ui.js");

test("setLabelText keeps nested elements alive", async (t) => {
  await t.test("preserves a child badge across a re-label", () => {
    const link = new FakeNode("a");
    const badge = new FakeNode("span");
    badge.id = "nav-flashcards-badge";
    badge.textContent = "3";
    link.appendChild(badge);

    setLabelText(link, "🗂️ Flashcards");

    assert.strictEqual(link.children.length, 1);
    assert.strictEqual(link.children[0], badge, "the same badge node must survive");
    assert.strictEqual(badge.textContent, "3", "badge content is untouched");
  });

  await t.test("replaces the label text rather than appending to it", () => {
    const link = new FakeNode("a");
    link.textContent = "🤖 Old Label";

    setLabelText(link, "🤖 New Label");
    setLabelText(link, "🤖 Newer Label");

    assert.strictEqual(link.textContent, "🤖 Newer Label");
  });

  await t.test("the label lands before the children, not after", () => {
    const link = new FakeNode("a");
    const dot = new FakeNode("span");
    dot.textContent = "•";
    link.appendChild(dot);

    setLabelText(link, "AI");

    assert.strictEqual(link.textContent, "AI•");
  });

  await t.test("survives repeated re-labelling without duplicating children", () => {
    const link = new FakeNode("a");
    link.appendChild(new FakeNode("span"));

    for (let i = 0; i < 5; i++) setLabelText(link, `Label ${i}`);

    assert.strictEqual(link.children.length, 1, "children must not accumulate");
  });

  await t.test("handles an element with no children", () => {
    const el = new FakeNode("span");
    setLabelText(el, "Plain");
    assert.strictEqual(el.textContent, "Plain");
  });
});

test("markup never reaches a translated label", async (t) => {
  const i18n = readFileSync(join(root, "i18n.js"), "utf8");

  await t.test("no translation string contains HTML", () => {
    // setLabelText assigns via textContent, so a translation carrying markup
    // would silently render as literal angle brackets. Catch it at the source.
    const withMarkup = i18n.match(/:\s*"[^"]*<[a-zA-Z/][^"]*"/g) || [];
    assert.deepStrictEqual(withMarkup, [], "translations must stay plain text");
  });

  await t.test("applyTranslations no longer writes innerHTML", () => {
    const ui = readFileSync(join(root, "js", "ui.js"), "utf8");
    const applyTranslations = ui.slice(ui.indexOf("applyTranslations()"));
    const body = applyTranslations.slice(0, applyTranslations.indexOf("\n  },"));
    assert.ok(
      !body.includes("innerHTML"),
      "applyTranslations must not assign innerHTML — it deletes nested badges"
    );
  });
});

test("nav labels match the current branding", async (t) => {
  const i18n = readFileSync(join(root, "i18n.js"), "utf8");
  const html = readFileSync(join(root, "index.html"), "utf8");

  await t.test("the AI nav key no longer says Turbo", () => {
    // The product was renamed; the markup said "Learnora AI" while every
    // locale still said "Turbo AI", so booting the app reverted the label.
    assert.ok(!/nav_ai:\s*"[^"]*Turbo/.test(i18n), "nav_ai must not mention Turbo");
  });

  await t.test("markup and translation agree on the English label", () => {
    const fromHtml = html.match(/data-i18n="nav_ai"[^>]*>\s*([^\n<]+)/)?.[1].trim();
    const fromI18n = i18n.match(/nav_ai:\s*"([^"]+)"/)?.[1].trim();
    assert.strictEqual(fromHtml, fromI18n, "the HTML fallback and en locale must match");
  });
});
