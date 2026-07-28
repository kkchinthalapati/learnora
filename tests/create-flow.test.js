import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const main = readFileSync(join(root, "js", "main.js"), "utf8");
const ai = readFileSync(join(root, "js", "ai.js"), "utf8");
const ui = readFileSync(join(root, "js", "ui.js"), "utf8");
const router = readFileSync(join(root, "js", "router.js"), "utf8");
const edge = readFileSync(join(root, "supabase", "functions", "learnora-ai", "index.ts"), "utf8");

/* Creating anything used to happen through eight separate affordances backed by
   three unrelated generators. These tests pin the invariant that replaced them:
   one dialog, one pipeline, one edge contract per output type. */

/* Extracts a top-level `function name() { ... }` body by brace-matching, so an
   assertion can't be satisfied by unrelated code elsewhere in the file. The
   old upload-hub tests sliced on the first "\n}\n" and silently captured only
   a fragment, which is why all twelve of them were failing. */
function functionBody(src, signature) {
  const start = src.indexOf(signature);
  assert.ok(start !== -1, `${signature} not found`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  assert.fail(`unbalanced braces after ${signature}`);
}

const bindCreate = functionBody(main, "function bindCreate()");

test("there is exactly one way to create things", async (t) => {
  await t.test("the old per-type entry points are gone", () => {
    // Each of these was its own generate button with its own behaviour.
    for (const dead of [
      "btn-generate-quiz-standalone",
      "btn-generate-deck",
      "btn-process-material",
      "quiz-config-form",
    ]) {
      assert.ok(
        !html.includes(`id="${dead}"`),
        `${dead} still exists — creation has more than one entry point again`
      );
    }
  });

  await t.test("nothing in JS still calls the removed helpers", () => {
    for (const src of [main, ai, ui, router]) {
      assert.ok(!/UI\.showQuizConfigModal\(/.test(src), "showQuizConfigModal call survived");
      assert.ok(!/AI\.generateStudyMaterial\(/.test(src), "generateStudyMaterial call survived");
    }
  });

  await t.test("every entry point opens the same dialog", () => {
    // Sidebar, Library header and dashboard "Quiz me" are bound once at boot.
    for (const opener of ["nav-create-btn", "btn-library-create", "dash-quiz-me-btn"]) {
      assert.ok(main.includes(opener), `${opener} is not wired in main.js`);
    }
    // The folder workspace button is rebound on every folder load because its
    // handler closes over that folder's id, so it lives in the router.
    assert.ok(
      router.includes("btn-workspace-create"),
      "the folder workspace Create button is not wired in router.js"
    );

    // Whoever binds them, they must all reach the same dialog.
    const openers = [
      ...main.matchAll(/UI\.showCreateModal\(/g),
      ...router.matchAll(/UI\.showCreateModal\(/g),
    ];
    assert.ok(openers.length >= 5, `expected every entry point to call showCreateModal, saw ${openers.length}`);
  });

  await t.test("one submit handler, guarded against double-firing", () => {
    assert.ok(
      /\$\("create-form"\)\?\.addEventListener\("submit"/.test(bindCreate),
      "the dialog needs a single submit handler"
    );
    // Two overlapping generations from one click produced an error popup and
    // a working quiz simultaneously.
    assert.ok(
      /let creating = false/.test(bindCreate) && /if \(creating\) return/.test(bindCreate),
      "concurrent submits must be rejected"
    );
  });
});

test("the dropzone is a real control", async (t) => {
  const dropzone = html.match(/<div id="create-dropzone"[^>]*>/)?.[0] ?? "";

  await t.test("it advertises a click affordance", () => {
    assert.ok(dropzone.includes("cursor-pointer"), "still styled as clickable");
  });

  await t.test("something is bound to that click", () => {
    assert.ok(
      /dropzone\?\.addEventListener\("click"/.test(bindCreate),
      "the dropzone needs a click listener or the copy is lying"
    );
  });

  await t.test("keyboard users still get a real button", () => {
    // The dropzone contains the Browse button; nesting role="button" around
    // another button hides the inner control from assistive tech.
    assert.ok(
      !/role="button"/.test(dropzone),
      "the dropzone must not take an interactive role around a real button"
    );
    assert.ok(
      /<button[^>]*id="create-browse"[^>]*>/.test(html),
      "the keyboard-accessible Browse button must exist"
    );
  });

  await t.test("Browse does not double-open the picker", () => {
    const browse = bindCreate.slice(bindCreate.indexOf('$("create-browse")'));
    assert.ok(
      browse.slice(0, 300).includes("stopPropagation"),
      "the inner button must stop the click reaching the dropzone"
    );
  });
});

test("the file picker accepts everything the pipeline handles", () => {
  const accept = html.match(/id="create-file"[^>]*accept="([^"]+)"/)?.[1] ?? "";
  assert.ok(accept, "the file input needs an accept list");

  // createStudyPackage() decides audio-vs-document from this regex, so the
  // picker must offer every extension it recognises — the accept list once
  // filtered out formats the upload path already handled.
  const audioRe = ai.match(/isAudio = \/\\\.\(([^)]+)\)\$\/i/)?.[1] ?? "";
  assert.ok(audioRe, "the audio-extension test was not found in ai.js");

  const exts = audioRe.split("|");
  const offered = accept.split(",").map((s) => s.trim().replace(/^\./, ""));
  const missing = exts.filter((e) => !offered.includes(e));
  assert.deepStrictEqual(missing, [], `picker omits audio formats the code accepts: ${missing}`);
});

test("submitted input is validated before a request is spent", async (t) => {
  await t.test("a new material must have a folder", () => {
    assert.ok(
      /isNewMaterial && !folderId/.test(bindCreate),
      "filing a material with no folder must be rejected in the dialog"
    );
  });

  await t.test("whitespace-only text and links are rejected", () => {
    // A field holding only spaces used to sail through and create an empty
    // material the AI step then failed on.
    const pkg = ai.slice(ai.indexOf("async createStudyPackage(request)"));
    assert.ok(
      /const raw = \(src\.kind === "link" \? src\.url : src\.text \|\| ""\)\.trim\(\)/.test(pkg),
      "text/link input must be trimmed before the empty check"
    );
  });

  await t.test("the source radio lookup cannot throw when nothing is checked", () => {
    const lookup = bindCreate.match(/create-source"\]:checked'\)(\??)\./);
    assert.strictEqual(lookup?.[1], "?", "the :checked lookup must be optional-chained");
  });

  await t.test("oversized files are refused before base64 encoding", () => {
    assert.ok(
      /10 \* 1024 \* 1024/.test(ai),
      "the 10MB ceiling must survive in the pipeline"
    );
  });
});

test("outputs derive from one pipeline", async (t) => {
  await t.test("the wrappers delegate rather than reimplement", () => {
    for (const fn of ["async generateQuiz(", "async generateFlashcards("]) {
      const body = ai.slice(ai.indexOf(fn), ai.indexOf(fn) + 1400);
      assert.ok(
        /this\.createStudyPackage\(/.test(body),
        `${fn} must delegate to createStudyPackage, not hold its own copy`
      );
    }
  });

  await t.test("partial failures are reported, not swallowed", () => {
    const pkg = ai.slice(ai.indexOf("async createStudyPackage(request)"));
    assert.ok(/errors\.push\("flashcards"\)/.test(pkg), "a failed deck must be recorded");
    assert.ok(/errors\.push\("quiz"\)/.test(pkg), "a failed quiz must be recorded");
    // A deck that generated must not be lost because the quiz after it failed.
    assert.ok(
      /if \(outputs\.quiz\) \{\s*try \{/.test(pkg),
      "quiz generation must be independently caught"
    );
  });
});

test("the client and the edge function agree on every mode", async (t) => {
  // Flashcards used to be sent with no mode at all: deck generation silently
  // ran on the 20s chat budget with no fence-stripping, and long decks were
  // truncated mid-array.
  const modesSent = [...ai.matchAll(/mode:\s*"([a-z]+)"/g)].map((m) => m[1]);

  await t.test("each generator sends a mode", () => {
    for (const mode of ["notes", "flashcards", "quiz"]) {
      assert.ok(modesSent.includes(mode), `no request is sent with mode:"${mode}"`);
    }
  });

  await t.test("every mode the client sends is known to the edge function", () => {
    for (const mode of new Set(modesSent)) {
      assert.ok(
        edge.includes(`"${mode}"`),
        `the edge function has no branch for mode:"${mode}"`
      );
    }
  });

  await t.test("JSON modes get the long timeout and json response_format", () => {
    const jsonModes = edge.match(/const JSON_MODES = new Set\(\[([^\]]+)\]\)/)?.[1] ?? "";
    for (const mode of ["quiz", "plan", "flashcards"]) {
      assert.ok(jsonModes.includes(`"${mode}"`), `${mode} must be a JSON mode`);
    }
    // notes is long-form Markdown — slow, but must NOT get response_format.
    assert.ok(!jsonModes.includes('"notes"'), "notes must not request JSON");
    assert.ok(
      /SLOW_MODES = new Set\(\[\.\.\.JSON_MODES, "notes"\]\)/.test(edge),
      "notes still needs the longer timeout"
    );
  });

  await t.test("mode checks go through the shared helpers", () => {
    // Three call sites once hardcoded `mode === "quiz" || mode === "plan"`,
    // which is how flashcards ended up excluded from JSON cleaning.
    assert.ok(
      !/mode === "quiz" \|\| mode === "plan"/.test(edge),
      "a hardcoded mode list survived; use isJsonMode()"
    );
  });

  await t.test("the flashcard parser understands the wrapped shape", () => {
    // response_format:json_object only permits an object at the top level, so
    // those providers return {"cards":[...]} rather than a bare array.
    const parser = ai.slice(
      ai.indexOf("_extractFlashcardJSON(text)"),
      ai.indexOf("_extractPlanJSON")
    );
    assert.ok(/"cards"/.test(parser), "the parser must unwrap {\"cards\":[…]}");
  });
});

test("the Library replaces four views without breaking links", async (t) => {
  await t.test("the merged views are gone", () => {
    for (const dead of ["view-folders", "view-upload", "view-flashcards", "view-quizzes"]) {
      assert.ok(!html.includes(`id="${dead}"`), `${dead} still exists`);
    }
    assert.ok(html.includes('id="view-library"'), "the Library view must exist");
  });

  await t.test("the grid containers the router writes into still exist", () => {
    // loadFolders/loadAllFlashcards/loadAllQuizzes target these by id.
    for (const id of ["folders-container", "flashcards-grid", "quizzes-grid", "materials-grid"]) {
      assert.ok(html.includes(`id="${id}"`), `${id} is missing — its loader would no-op`);
    }
  });

  await t.test("old hashes still resolve", () => {
    const legacy = router.match(/LEGACY_ROUTES:\s*\{([^}]+)\}/)?.[1] ?? "";
    for (const old of ["folders", "upload", "flashcards", "quizzes"]) {
      assert.ok(new RegExp(`\\b${old}:`).test(legacy), `#${old} would 404 to the dashboard`);
    }
  });

  await t.test("no markup or JS still points at a removed route", () => {
    for (const [name, src] of [["index.html", html], ["main.js", main], ["router.js", router]]) {
      for (const dead of ["upload", "quizzes", "flashcards", "folders"]) {
        assert.ok(
          !new RegExp(`data-hash="${dead}"`).test(src),
          `${name} still links to the removed #${dead} route`
        );
      }
    }
  });

  await t.test("a library sub-tab still lights up the sidebar entry", () => {
    assert.ok(
      /route\.startsWith\("library"\) \? "library"/.test(router),
      "library-quizzes would leave the sidebar with no active item"
    );
  });
});

/* =========================================================================
   Polish pass — each block below pins a defect found by driving the dialog in
   a real browser, not a refactor invariant. Naming the symptom in the message
   keeps a future edit from "cleaning up" the fix and silently restoring it.
   ========================================================================= */

test("the dialog cannot fail silently", async (t) => {
  await t.test("the form opts out of native validation", () => {
    // The source panels show one at a time. A bare domain left in the hidden
    // type=url Link field made the browser refuse to submit a control it could
    // not focus: no submit event, no message, Create simply did nothing.
    const form = html.match(/<form id="create-form"[^>]*>/)?.[0] ?? "";
    assert.ok(form, "#create-form not found");
    assert.ok(
      /\bnovalidate\b/.test(form),
      "create-form lost novalidate — a stale value in a hidden panel will " +
      "block submit again with no feedback"
    );
  });

  await t.test("every source is checked before the dialog closes", () => {
    // These used to throw from inside the pipeline, which meant the dialog had
    // already closed and a full-screen spinner had already appeared.
    assert.ok(
      /const validateSource = \(kind\) =>/.test(bindCreate),
      "validateSource is gone — source errors would surface behind a spinner"
    );
    for (const kind of ["file", "text", "link", "material", "topic"]) {
      assert.ok(
        new RegExp(`kind === "${kind}"`).test(bindCreate),
        `the "${kind}" source is no longer validated up front`
      );
    }
    // Scoped to the submit listener: bindCreate also closes the dialog from the
    // Cancel handler, which sits above this and would satisfy a whole-function
    // ordering check no matter where validation ended up.
    const submitStart = bindCreate.indexOf('$("create-form")?.addEventListener("submit"');
    assert.ok(submitStart !== -1, "the submit listener was not found");
    const submitHandler = bindCreate.slice(submitStart);
    const validateIdx = submitHandler.indexOf("validateSource(kind)");
    const closeIdx = submitHandler.indexOf('ModalManager.close("create-modal")');
    assert.ok(validateIdx !== -1, "the submit handler never calls validateSource");
    assert.ok(closeIdx !== -1, "the submit handler no longer closes the dialog");
    assert.ok(
      validateIdx < closeIdx,
      "the source is validated after the dialog closes — the error would land " +
      "on a popup over a spinner instead of next to the field"
    );
  });

  await t.test("the size limit is enforced before the upload starts", () => {
    assert.ok(
      /MAX_UPLOAD_BYTES/.test(bindCreate),
      "the 10MB check no longer runs in the dialog"
    );
  });

  await t.test("links are restricted to http(s)", () => {
    assert.ok(
      /parsed\.protocol !== "http:" && parsed\.protocol !== "https:"/.test(bindCreate),
      "a javascript:/data: link would be accepted as a study source"
    );
  });

  await t.test("an error moves focus to the field it is about", () => {
    assert.ok(
      /const showError = \(msg, focusId\)/.test(bindCreate),
      "showError no longer takes a field to focus — a keyboard user has to " +
      "hunt for what the message refers to"
    );
  });
});

test("the loader tells the truth", async (t) => {
  await t.test("the pipeline reports real stages", () => {
    assert.ok(/onProgress/.test(ai), "createStudyPackage no longer reports progress");
    assert.ok(
      /const step = \(message\)/.test(ai),
      "the step() reporter is gone — the loader falls back to guessing"
    );
  });

  await t.test("the guessed script is not reinstated", () => {
    // The old list rotated on a 3s timer regardless of the run, so a
    // notes-only generation still announced that it was writing quiz questions.
    assert.ok(
      !/"Writing quiz questions\.\.\."/.test(main),
      "the hardcoded rotating message list is back"
    );
  });

  await t.test("progress overrides the rotation rather than racing it", () => {
    const setProgress = functionBody(ui, "setAIProgress(message)");
    assert.ok(
      /clearInterval/.test(setProgress),
      "setAIProgress must stop the rotation, or the timer overwrites the real stage"
    );
  });

  await t.test("the overlay is announced and takes the app out of the tab order", () => {
    const loader = html.match(/<div id="ai-loader"[^>]*>/)?.[0] ?? "";
    assert.ok(/role="status"/.test(loader), "the loader is silent to screen readers");
    assert.ok(/aria-live="polite"/.test(loader), "stage changes would not be announced");
    const setLoading = functionBody(ui, "setAILoading(isLoading, messages = [])");
    assert.ok(
      /setAttribute\("inert"/.test(setLoading) && /removeAttribute\("inert"/.test(setLoading),
      "Tab still walks into the page behind the blocking overlay"
    );
  });
});

test("Options only offers controls that can change the result", async (t) => {
  await t.test("the data-option-for hooks are actually read", () => {
    // They shipped in the markup but nothing consumed them, so a flashcards-only
    // run still showed quiz difficulty, quiz host and a question count.
    assert.ok(
      /\[data-option-for\]/.test(ui),
      "nothing reads data-option-for — the tuning fields are unconditional again"
    );
    assert.ok(
      /syncCreateOptionVisibility/.test(main),
      "toggling an output no longer updates which options are shown"
    );
  });

  await t.test("hidden options leave the tab order", () => {
    // Trailing brace keeps this off showCreateModal's earlier call site.
    const sync = functionBody(ui, "syncCreateOptionVisibility() {");
    assert.ok(
      /tabindex/.test(sync),
      "Tab still lands on sliders that are not visible"
    );
  });
});

test("the hash cannot reach Object.prototype", () => {
  // #constructor / #toString / #__proto__ all resolved to inherited members,
  // came back truthy, and sent the router to a stringified function.
  assert.ok(
    /Object\.hasOwn\(this\.LEGACY_ROUTES, hash\)/.test(router),
    "the legacy-route lookup walks the prototype chain again"
  );
});

test("dead markup stays gone", () => {
  assert.ok(
    !html.includes('id="create-material-id"'),
    "the unused create-material-id input is back — nothing ever read or wrote it"
  );
});
