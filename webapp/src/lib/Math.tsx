import { useEffect, useRef } from "react";
import styles from "./markdown.module.css";

/* TeX rendering for model replies.
 *
 * WHY MATHML AND NOT KATEX'S DEFAULT HTML OUTPUT: the app is served under a
 * CSP with `style-src 'self' https://fonts.googleapis.com` and deliberately no
 * `'unsafe-inline'` (vercel.json, the `/app/(.*)` policy). KaTeX's HTML output
 * carries its geometry — strut heights, vertical-align, per-glyph offsets — in
 * inline `style` attributes, and a style attribute arriving via innerHTML is
 * exactly what that policy drops. The maths would render with every strut
 * collapsed: worse than not rendering it at all, and silent. MathML puts the
 * geometry in the markup instead, so it needs no inline styles, no
 * `katex.css`, and none of the ~1MB of KaTeX web fonts. Browsers lay it out
 * natively.
 *
 * The trade is fidelity: MathML is laid out by the browser, so spacing differs
 * a little between engines where KaTeX's HTML output would be identical
 * everywhere. Relaxing the CSP to buy that back is not a trade worth making
 * silently — it would have to be a deliberate decision, so it is written down
 * here rather than taken.
 *
 * WHY THIS TOUCHES innerHTML AT ALL: `katex.render` writes into the element it
 * is given, which is a departure from markdownToReact.tsx's rule that model
 * text only ever becomes text nodes. It is sound here for a reason that does
 * not generalise — the HTML is built by KaTeX from a parsed TeX AST, not
 * passed through from the reply. Text inside it is escaped by KaTeX, and
 * `trust: false` (the default, set explicitly below) disables every command
 * that can emit raw markup or a URL: \html*, \includegraphics, \url, \href.
 * So `$<script>alert(1)</script>$` renders as the literal characters. Do not
 * set `trust` to anything else, and do not reach for this pattern for any
 * other kind of model output.
 *
 * KaTeX is loaded on demand. It is ~280KB before compression and most replies
 * contain no maths at all, so a static import would put it in the entry chunk
 * for every student on every screen. The dynamic import gives Vite a split
 * point; the chunk is fetched the first time a reply actually has an equation
 * in it, and cached for the rest of the session. */

type KatexModule = typeof import("katex");

let katexPromise: Promise<KatexModule> | null = null;

/** One in-flight load shared by every equation on the page. */
function loadKatex(): Promise<KatexModule> {
  katexPromise ??= import("katex");
  return katexPromise;
}

export function MathNode({
  tex,
  display,
}: {
  tex: string;
  /** Display maths is centred on its own line; inline sits in the sentence. */
  display: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* The raw TeX shows until KaTeX arrives, and stays if it never does — a
       student seeing `\frac{1}{2}` has strictly more than one seeing nothing.
       Set as text content rather than as React children on purpose: React must
       not own these nodes, because KaTeX replaces them wholesale and React
       would then try to reconcile against children that no longer exist. */
    el.textContent = tex;

    let cancelled = false;
    loadKatex()
      .then((katex) => {
        if (cancelled || !ref.current) return;
        katex.default.render(tex, ref.current, {
          displayMode: display,
          output: "mathml",
          /* A malformed equation renders in red rather than throwing — one bad
             expression must not take down the whole reply. */
          throwOnError: false,
          /* Never raise this. See the security note above. */
          trust: false,
          /* Models emit plenty of harmless non-strict TeX (unicode minus, a
             stray \text). Warnings would be console noise, not student-facing
             problems. */
          strict: false,
        });
      })
      .catch(() => {
        /* Offline, or the chunk failed to load. The TeX fallback is already
           on screen, so there is nothing further to do. */
      });

    return () => {
      cancelled = true;
    };
  }, [tex, display]);

  return (
    <span
      ref={ref}
      className={display ? styles.mathDisplay : styles.mathInline}
    />
  );
}
