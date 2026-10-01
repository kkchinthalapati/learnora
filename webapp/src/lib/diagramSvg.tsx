import { createElement } from "react";
import type { CSSProperties, ReactNode } from "react";

/* Turns model-authored SVG into React elements.
 *
 * WHY A PARSER AND NOT `dangerouslySetInnerHTML`: a diagram's entire source is
 * untrusted model output, and the React app deliberately contains no innerHTML
 * (see the note at the top of `markdownToReact.tsx`). Rebuilding the tree as
 * React elements against an allowlist makes safety structural rather than a
 * property of how carefully some escaping pass was ordered: a `<script>`, an
 * `onload=`, a `<foreignObject>` or an external `href` in the source has no
 * code path by which it becomes part of the rendered output — it is simply not
 * copied across.
 *
 * The allowlist covers the shapes a study diagram actually needs — geometry
 * figures, graphs and axes, flow and concept maps, Venn diagrams — and nothing
 * that loads, scripts, or navigates.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Past this the source is not a diagram, it is a payload. */
const MAX_SOURCE_LENGTH = 120_000;
/** Belt and braces against a pathological tree locking the render thread. */
const MAX_ELEMENTS = 4000;

/* Tags, keyed by their lowercased name so a model that writes `lineargradient`
   still lands on the canonical spelling React needs. Deliberately absent:
   `script`, `style`, `foreignObject`, `image`, `use`, `a`, and every
   `animate*` element — each is either a script vector, a network fetch, or a
   navigation. */
const ALLOWED_TAGS: Record<string, string> = {
  svg: "svg",
  g: "g",
  defs: "defs",
  title: "title",
  desc: "desc",
  symbol: "symbol",
  marker: "marker",
  path: "path",
  line: "line",
  polyline: "polyline",
  polygon: "polygon",
  rect: "rect",
  circle: "circle",
  ellipse: "ellipse",
  text: "text",
  tspan: "tspan",
  lineargradient: "linearGradient",
  radialgradient: "radialGradient",
  stop: "stop",
  clippath: "clipPath",
};

/* Attributes, keyed by lowercased name, valued by the React prop to set. Only
   presentation, geometry and labelling — no `href`/`xlink:href`, no `on*`, no
   `xmlns:*`. */
const ALLOWED_ATTRS: Record<string, string> = {
  // identity + layout
  id: "id",
  class: "className",
  transform: "transform",
  viewbox: "viewBox",
  preserveaspectratio: "preserveAspectRatio",
  overflow: "overflow",
  // geometry
  x: "x",
  y: "y",
  x1: "x1",
  y1: "y1",
  x2: "x2",
  y2: "y2",
  cx: "cx",
  cy: "cy",
  r: "r",
  rx: "rx",
  ry: "ry",
  fx: "fx",
  fy: "fy",
  fr: "fr",
  d: "d",
  points: "points",
  width: "width",
  height: "height",
  dx: "dx",
  dy: "dy",
  offset: "offset",
  // stroke + fill
  fill: "fill",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  stroke: "stroke",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "stroke-opacity": "strokeOpacity",
  "stroke-miterlimit": "strokeMiterlimit",
  opacity: "opacity",
  "paint-order": "paintOrder",
  "vector-effect": "vectorEffect",
  "shape-rendering": "shapeRendering",
  // text
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "font-style": "fontStyle",
  "text-anchor": "textAnchor",
  "dominant-baseline": "dominantBaseline",
  "alignment-baseline": "alignmentBaseline",
  "letter-spacing": "letterSpacing",
  "word-spacing": "wordSpacing",
  "text-decoration": "textDecoration",
  "white-space": "whiteSpace",
  textlength: "textLength",
  lengthadjust: "lengthAdjust",
  "xml:space": "xmlSpace",
  // gradients, markers, clips
  gradientunits: "gradientUnits",
  gradienttransform: "gradientTransform",
  spreadmethod: "spreadMethod",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  markerwidth: "markerWidth",
  markerheight: "markerHeight",
  markerunits: "markerUnits",
  refx: "refX",
  refy: "refY",
  orient: "orient",
  "marker-start": "markerStart",
  "marker-mid": "markerMid",
  "marker-end": "markerEnd",
  "clip-path": "clipPath",
  "clip-rule": "clipRule",
  clippathunits: "clipPathUnits",
  // accessibility
  role: "role",
  "aria-label": "aria-label",
  "aria-hidden": "aria-hidden",
  // handled specially (parsed into an object) but listed so it passes the gate
  style: "style",
};

/** `url(#localId)` is a same-document reference and is fine; anything else a
 *  `url()` could point at is a network fetch, and `javascript:`/`data:` in a
 *  value has no business in a diagram at all. */
function isSafeValue(value: string): boolean {
  const lowered = value.toLowerCase();
  if (/^\s*(javascript|data|vbscript)\s*:/.test(lowered)) return false;
  if (lowered.includes("javascript:") || lowered.includes("vbscript:")) {
    return false;
  }
  if (lowered.includes("expression(")) return false;
  /* Every url() in the value must be a fragment reference. */
  for (const match of lowered.matchAll(/url\(\s*['"]?([^'")]*)/g)) {
    if (!match[1].startsWith("#")) return false;
  }
  return true;
}

const cssPropToReact = (prop: string): string =>
  prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** A `style="fill: red; stroke-width: 2"` string becomes a React style object.
 *  Declarations whose value fails `isSafeValue` are dropped individually
 *  rather than taking the whole element with them. */
function parseStyle(value: string): CSSProperties | undefined {
  const style: Record<string, string> = {};
  for (const declaration of value.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    const prop = declaration.slice(0, colon).trim().toLowerCase();
    const propValue = declaration.slice(colon + 1).trim();
    /* CSS custom properties would let a value reach a rule we never vetted. */
    if (!prop || prop.startsWith("-") || !propValue) continue;
    if (!isSafeValue(propValue)) continue;
    style[cssPropToReact(prop)] = propValue;
  }
  return Object.keys(style).length > 0 ? (style as CSSProperties) : undefined;
}

export interface DiagramParseResult {
  /** The rendered diagram, or `null` when the source was not usable. */
  node: ReactNode | null;
  /** Text of the diagram's `<title>`, for the figure's accessible name. */
  title?: string;
  /** Why nothing was rendered. Present only when `node` is null. */
  error?: string;
}

/** Pulls the `<title>` text out so the caller can name the figure without
 *  reaching back into the parsed tree. */
function readTitle(root: Element): string | undefined {
  const title = root.querySelector("title");
  const text = title?.textContent?.trim();
  return text ? text : undefined;
}

/** Some models emit `<svg width="640" height="400">` with no viewBox, which
 *  pins the drawing to 640px and refuses to scale on a phone. Synthesising the
 *  viewBox from those two numbers keeps the geometry and lets CSS size it. */
function ensureViewBox(props: Record<string, unknown>): void {
  if (typeof props.viewBox === "string" && props.viewBox.trim()) return;
  const width = parseFloat(String(props.width ?? ""));
  const height = parseFloat(String(props.height ?? ""));
  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    props.viewBox = `0 0 ${width} ${height}`;
  }
}

/**
 * Parse SVG source into a React element tree, keeping only allowlisted tags
 * and attributes.
 *
 * @param source Raw `<svg>…</svg>` markup, as written by the model.
 * @param options `className` is applied to the root; `ariaLabel` names it when
 *   the source carries no `<title>`.
 */
export function parseDiagramSvg(
  source: string,
  options: { className?: string; ariaLabel?: string } = {},
): DiagramParseResult {
  const trimmed = source.trim();

  if (!trimmed) return { node: null, error: "This diagram is empty." };
  if (trimmed.length > MAX_SOURCE_LENGTH) {
    return { node: null, error: "This diagram is too large to display." };
  }
  /* A doctype or entity declaration is the entity-expansion attack surface,
     and no legitimate inline diagram needs either. */
  if (/<!DOCTYPE|<!ENTITY/i.test(trimmed)) {
    return { node: null, error: "This diagram could not be displayed safely." };
  }
  if (!/^<svg[\s>]/i.test(trimmed)) {
    return { node: null, error: "This diagram is not valid SVG." };
  }
  if (typeof DOMParser === "undefined") {
    return { node: null, error: "This diagram cannot be displayed here." };
  }

  const doc = new DOMParser().parseFromString(trimmed, "image/svg+xml");
  const root = doc.documentElement;
  if (
    !root ||
    doc.querySelector("parsererror") ||
    root.nodeName === "parsererror"
  ) {
    return { node: null, error: "This diagram is not valid SVG." };
  }
  if (root.nodeName.toLowerCase() !== "svg") {
    return { node: null, error: "This diagram is not valid SVG." };
  }

  let budget = MAX_ELEMENTS;
  let key = 0;

  const convert = (element: Element, isRoot: boolean): ReactNode | null => {
    const tag = ALLOWED_TAGS[element.nodeName.toLowerCase()];
    /* An element outside the allowlist is dropped whole — including its
       children, since a `<foreignObject>`'s subtree is HTML, not SVG. */
    if (!tag) return null;
    if (budget-- <= 0) return null;

    const props: Record<string, unknown> = {};

    for (const attr of Array.from(element.attributes)) {
      const prop = ALLOWED_ATTRS[attr.name.toLowerCase()];
      if (!prop) continue;
      /* `style` is filtered declaration by declaration rather than as one
         value, so a single bad rule costs that rule and not the whole
         attribute — a model that writes `fill: red` next to something we
         refuse should still get its red fill. */
      if (prop === "style") {
        const style = parseStyle(attr.value);
        if (style) props.style = style;
        continue;
      }
      if (!isSafeValue(attr.value)) continue;
      props[prop] = attr.value;
    }

    const children: ReactNode[] = [];
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === TEXT_NODE) {
        const text = child.nodeValue ?? "";
        if (text.trim()) children.push(text);
      } else if (child.nodeType === ELEMENT_NODE) {
        const node = convert(child as Element, false);
        if (node) children.push(node);
      }
      /* Comments, CDATA and processing instructions are skipped. */
    }

    if (isRoot) {
      ensureViewBox(props);
      /* CSS owns the size: a fixed width attribute is what makes a diagram
         overflow a phone. */
      delete props.width;
      delete props.height;
      props.xmlns = "http://www.w3.org/2000/svg";
      props.className = options.className;
      props.role = "img";
      props.focusable = "false";
      const label = readTitle(element) ?? options.ariaLabel;
      if (label) props["aria-label"] = label;
    }

    props.key = `dg-${key++}`;
    return createElement(
      tag,
      props,
      children.length > 0 ? children : undefined,
    );
  };

  const node = convert(root, true);
  if (!node) {
    return { node: null, error: "This diagram could not be displayed." };
  }
  return { node, title: readTitle(root) };
}

/** Pulls the first `<svg>` element out of a reply or a saved artifact, fenced
 *  or not, so a caller can offer it as a file. `null` when there is none. */
export function extractSvgSource(markdown: string): string | null {
  const match = /<svg[\s>][\s\S]*?<\/svg\s*>/i.exec(markdown);
  return match ? match[0].trim() : null;
}
