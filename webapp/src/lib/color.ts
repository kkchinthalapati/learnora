/* Port of js/ui.js's COLOUR helpers (:74-142).
 *
 * Every parse returns a usable value or null, so a malformed hex coming
 * back out of localStorage can never be written into a CSS variable.
 * These are pure functions with no DOM access — the custom theme studio
 * and its tests both drive them directly. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseHex(str: unknown): Rgb | null {
  if (typeof str !== "string") return null;
  const m = HEX_RE.exec(str.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const int = parseInt(h, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to2 = (n: number) =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  const seg = Math.floor(hh / 60);
  const [r1, g1, b1] = ([
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg] ?? [c, x, 0]) as [number, number, number];
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

export const hsvToHex = (h: number, s: number, v: number): string =>
  rgbToHex(hsvToRgb(h, clamp(s, 0, 1), clamp(v, 0, 1)));

export function rgbaStr({ r, g, b }: Rgb, alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(
    alpha.toFixed(3),
  )})`;
}

/* Perceptual luminance (WCAG relative luminance) — decides whether text
   sitting on the accent should be near-black or white, so a pale custom
   colour never ends up with unreadable white labels on top of it. */
export function luminance({ r, g, b }: Rgb): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
