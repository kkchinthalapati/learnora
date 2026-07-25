import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const main = readFileSync(join(root, "js", "main.js"), "utf8");

/* bindUploadHub() reaches into the Upload & Generate markup by id. These tests
   pin the contract between the two halves — the kind of drift that already bit
   once, when the file picker's accept list quietly excluded audio formats the
   upload path knew how to handle. */

// The body of bindUploadHub, so assertions can't be satisfied by unrelated code.
const hub = (() => {
  const start = main.indexOf("function bindUploadHub()");
  assert.ok(start !== -1, "bindUploadHub not found in js/main.js");
  const rest = main.slice(start);
  return rest.slice(0, rest.indexOf("\n}\n") + 2);
})();

test("the upload dropzone is a real control", async (t) => {
  const dropzone = html.match(/<div id="upload-dropzone"[^>]*>/)?.[0] ?? "";

  await t.test("the markup advertises a click affordance", () => {
    assert.ok(dropzone.includes("cursor-pointer"), "still styled as clickable");
  });

  await t.test("something is actually bound to that click", () => {
    // The dropzone read "or click to browse files" and was styled
    // cursor-pointer, but only the Browse button had a listener.
    assert.ok(
      /dropzone\.addEventListener\(\s*['"]click['"]/.test(hub),
      "dropzone needs a click listener or the copy is lying"
    );
  });

  await t.test("keyboard users still have a real control", () => {
    // The dropzone stays a plain region on purpose: it contains the Browse
    // Files button, and nesting role="button" around another button hides the
    // inner control from assistive tech. So the button must remain a button.
    assert.ok(
      !/role="button"/.test(dropzone),
      "the dropzone must not become an interactive role around a real button"
    );
    assert.ok(
      /<button[^>]*id="btn-browse-files"[^>]*>/.test(html),
      "the keyboard-accessible Browse Files button must still exist"
    );
  });

  await t.test("the Browse button does not double-open the picker", () => {
    // It sits inside the dropzone, so its click bubbles to the new handler.
    const browse = hub.slice(hub.indexOf('$("btn-browse-files")'));
    assert.ok(
      browse.slice(0, 300).includes("stopPropagation"),
      "the inner button must stop the click reaching the dropzone"
    );
  });
});

test("the file picker accepts everything the upload path handles", async (t) => {
  const accept = html.match(/id="hub-file-upload"[^>]*accept="([^"]+)"/)?.[1] ?? "";
  const audioExts = hub.match(/AUDIO_EXTS\s*=\s*\[([^\]]+)\]/)?.[1] ?? "";

  await t.test("AUDIO_EXTS is where the test expects it", () => {
    assert.ok(audioExts, "AUDIO_EXTS not found in bindUploadHub");
  });

  await t.test("every audio extension is offered by the picker", () => {
    const exts = audioExts.match(/'([a-z0-9]+)'/g).map((s) => s.replace(/'/g, ""));
    const offered = accept.split(",").map((s) => s.trim().replace(/^\./, ""));
    const missing = exts.filter((e) => !offered.includes(e));
    assert.deepStrictEqual(
      missing,
      [],
      `the picker filters out formats the code classifies as audio: ${missing.join(", ")}`
    );
  });
});

test("Raw Text gets a multi-line field", async (t) => {
  await t.test("the textarea exists", () => {
    assert.ok(
      /<textarea id="upload-raw-text"/.test(html),
      "pasting notes into a one-line input is unusable"
    );
  });

  await t.test("its label is wired to whichever field is showing", () => {
    assert.ok(html.includes('id="upload-link-label"'), "the label needs an id to be retargeted");
    assert.ok(
      /linkLabel\.setAttribute\(\s*['"]for['"]/.test(hub),
      "the label's `for` must follow the visible field"
    );
  });

  await t.test("both entry fields are cleared after a successful upload", () => {
    // Only the link field used to be reset, so pasted text was re-submitted
    // with the next upload.
    assert.ok(/linkField\.value = ""/.test(hub), "link field must be cleared");
    assert.ok(/textField\.value = ""/.test(hub), "textarea must be cleared");
  });
});

test("submitted input is validated", async (t) => {
  await t.test("whitespace-only text is rejected", () => {
    // `if (!urlOrText)` passed a field holding only spaces, creating an empty
    // material that the AI step then failed on.
    assert.ok(
      /activeTextEntry\(\)\?\.value \|\| ""\)\.trim\(\)/.test(hub),
      "the link/text value must be trimmed before the empty check"
    );
  });

  await t.test("a missing material-type selection cannot throw", () => {
    const checked = hub.match(/material-type"\]:checked'\)(\??)\./);
    assert.strictEqual(checked?.[1], "?", "the :checked lookup must be optional-chained");
  });

  await t.test("the material-type radio lookup is null-guarded", () => {
    assert.ok(
      !/querySelector\(`input\[name="material-type"\]\[value="\$\{[^}]+\}"\]`\)\.checked/.test(hub),
      "a radio lookup is dereferenced without a null check"
    );
  });
});
