import { useEffect, useState } from "react";
import styles from "./markdown.module.css";

/* A ```mermaid fence in a tutor reply, drawn as a diagram.
 *
 * HOW THE MODEL'S DIAGRAM REACHES THE SCREEN, AND WHY IT CANNOT RUN ANYTHING
 *
 *  1. Mermaid parses the source with `securityLevel: "strict"` — labels are
 *     encoded, `click` callbacks are disabled — and any `%%{init}%%`
 *     directive is stripped first, so a reply cannot reconfigure it.
 *     `htmlLabels: false` makes every label plain SVG <text>, so the output
 *     needs no HTML at all.
 *  2. The SVG it returns is sanitised by DOMPurify with the SVG profile
 *     only: no HTML, no <foreignObject>, no scripts, no event handlers, no
 *     javascript: URLs.
 *  3. The sanitised SVG is serialised and shown through an <img> from a
 *     blob: URL. An SVG loaded as an image is rendered in the browser's
 *     secure static mode: it cannot run script or fetch anything, whatever
 *     step 2 missed. Nothing here ever uses innerHTML or
 *     dangerouslySetInnerHTML.
 *
 * Step 3 is also what makes it work at all in production. The app's CSP for
 * /app/* has `style-src 'self'` with no 'unsafe-inline', which blocks the
 * <style> element mermaid embeds in its SVG if that SVG is inserted into
 * the page. Inside an image it is the image's own stylesheet.
 *
 * Mermaid is several hundred KB and pulls in diagram-specific chunks, so it
 * is imported on demand — the same split-point pattern as KaTeX in
 * Math.tsx. Nothing is fetched until a reply actually contains a diagram.
 *
 * A diagram that will not parse falls back to its source in a code block
 * with a short note, so the student still gets what the tutor wrote. */

type Renderer = {
  mermaid: typeof import("mermaid").default;
  purify: typeof import("dompurify").default;
};

let rendererPromise: Promise<Renderer> | null = null;

function loadRenderer(): Promise<Renderer> {
  rendererPromise ??= Promise.all([import("mermaid"), import("dompurify")]).then(
    ([m, p]) => ({ mermaid: m.default, purify: p.default }),
  );
  /* A failed chunk load must not be cached forever — the next diagram
     retries it. */
  rendererPromise.catch(() => {
    rendererPromise = null;
  });
  return rendererPromise;
}

/** Longer than any diagram the tutor is asked for; past it, show the source. */
export const MAX_DIAGRAM_CHARS = 4000;

/** `%%{init: …}%%` lines let a diagram rewrite mermaid's config. */
const INIT_DIRECTIVE = /%%\{[\s\S]*?\}%%/g;

let renderSeq = 0;

/** Tracks the app theme, which lives as a class on <body> (lib/appearance.ts). */
function useDarkTheme(): boolean {
  const read = () =>
    typeof document !== "undefined" &&
    document.body.classList.contains("dark-theme");
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return dark;
}

type Rendered =
  | { status: "loading" }
  | { status: "ready"; url: string; width: number; height: number; kind: string }
  | { status: "failed" };

/* Finished drawings, by theme and source. markdownToReact keys its nodes
   afresh on every render, so a chat re-render (every keystroke in the
   composer) remounts this component; without the cache each remount would
   re-run mermaid and flash "Drawing diagram…". Object URLs live as long as
   their entry, and the oldest is dropped past the cap. */
const MAX_CACHED = 40;
type Settled = Exclude<Rendered, { status: "loading" }>;
const cache = new Map<string, Settled>();
/* Renders in flight, so a remount before the first one settles shares it. */
const inFlight = new Map<string, Promise<Settled>>();

function remember(key: string, value: Settled) {
  cache.set(key, value);
  while (cache.size > MAX_CACHED) {
    const [oldestKey, oldest] = cache.entries().next().value!;
    if (oldest.status === "ready") URL.revokeObjectURL(oldest.url);
    cache.delete(oldestKey);
  }
}

/** Mermaid source → sanitised SVG markup, ready to become an image. Throws
 *  on anything that does not parse. */
async function renderDiagramSvg(
  source: string,
  dark: boolean,
): Promise<{ svg: string; width: number; height: number }> {
  const code = source.replace(INIT_DIRECTIVE, "").trim();
  if (!code || code.length > MAX_DIAGRAM_CHARS) {
    throw new Error("Diagram is empty or too long to draw.");
  }

  const { mermaid, purify } = await loadRenderer();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    // Throw instead of drawing mermaid's own "syntax error" bomb graphic.
    suppressErrorRendering: true,
  });
  await mermaid.parse(code);

  const id = `learnora-diagram-${++renderSeq}`;
  let svg: string;
  try {
    ({ svg } = await mermaid.render(id, code));
  } finally {
    // Mermaid measures text in a scratch node it can leave behind on error.
    document.getElementById(`d${id}`)?.remove();
  }

  const fragment = purify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    RETURN_DOM_FRAGMENT: true,
  });
  const root = fragment.firstElementChild;
  if (!root || root.tagName.toLowerCase() !== "svg") {
    throw new Error("Diagram did not produce an SVG.");
  }

  /* As an image, the SVG needs an intrinsic size: mermaid emits width="100%"
     and a max-width style, which mean nothing outside a page layout. */
  const [, , w, h] = (root.getAttribute("viewBox") ?? "")
    .split(/[\s,]+/)
    .map(Number);
  const width = Number.isFinite(w) && w > 0 ? Math.ceil(w) : 600;
  const height = Number.isFinite(h) && h > 0 ? Math.ceil(h) : 400;
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.removeAttribute("style");

  return { svg: new XMLSerializer().serializeToString(root), width, height };
}

function diagramKind(code: string): string {
  const first = code.replace(INIT_DIRECTIVE, "").trim().split(/\s/)[0] ?? "";
  if (/^(?:flowchart|graph)$/i.test(first)) return "flowchart";
  if (/^sequenceDiagram$/i.test(first)) return "sequence diagram";
  if (/^timeline$/i.test(first)) return "timeline";
  if (/^mindmap$/i.test(first)) return "mind map";
  return "diagram";
}

export function MermaidDiagram({ code }: { code: string }) {
  const dark = useDarkTheme();
  const key = `${dark ? "dark" : "light"}\n${code}`;
  const [rendered, setRendered] = useState<Rendered>(
    () => cache.get(key) ?? { status: "loading" },
  );

  useEffect(() => {
    const cached = cache.get(key);
    if (cached) {
      setRendered(cached);
      return;
    }
    let active = true;
    setRendered({ status: "loading" });
    let pending = inFlight.get(key);
    if (!pending) {
      pending = renderDiagramSvg(code, dark)
        .then(({ svg, width, height }): Settled => ({
          status: "ready",
          url: URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })),
          width,
          height,
          kind: diagramKind(code),
        }))
        .catch((err: unknown): Settled => {
          console.warn("[diagram] could not render", err);
          return { status: "failed" };
        })
        .then((settled) => {
          remember(key, settled);
          inFlight.delete(key);
          return settled;
        });
      inFlight.set(key, pending);
    }
    void pending.then((settled) => {
      if (active) setRendered(settled);
    });
    return () => {
      active = false;
    };
  }, [key, code, dark]);

  if (rendered.status === "failed") {
    return (
      <div className={styles.diagramFallback}>
        <p className={styles.diagramNote} role="note">
          Couldn't draw this diagram, so here is what it describes.
        </p>
        <pre className={styles.pre}>
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  if (rendered.status === "loading") {
    return (
      <p className={styles.diagramNote} role="status">
        Drawing diagram…
      </p>
    );
  }

  return (
    <figure className={styles.diagram}>
      <img
        src={rendered.url}
        width={rendered.width}
        height={rendered.height}
        alt={`A ${rendered.kind}. Its full text is under "Diagram text".`}
      />
      {/* The picture's words, for a screen reader and for copying. */}
      <details className={styles.diagramSource}>
        <summary>Diagram text</summary>
        <pre className={styles.pre}>
          <code>{code}</code>
        </pre>
      </details>
    </figure>
  );
}
