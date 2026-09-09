import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* Every destination the app offers must resolve to a route, and every route
 * should be reachable from somewhere.
 *
 * This is the guard the route table did not have. Before it, `/premortem` could
 * become a redirect while three live CTAs went on pointing at it, an entire
 * view directory could be orphaned with its tests still passing, and the same
 * tool could answer to three different URLs with navigation split across two of
 * them — none of it visible to a test suite that only asked "does /debugger
 * render something".
 *
 * Static analysis rather than a render crawl: it is the only way to see every
 * link in the app, including ones behind states a test would have to set up.
 */

const SRC = join(import.meta.dirname, ".");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "test" || entry === "dev") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (
      /\.tsx?$/.test(entry) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      acc.push(full);
    }
  }
  return acc;
}

/** `export const LOGIN_PATH = "/login"` across the tree, so routes declared as
 *  `path={LOGIN_PATH}` resolve to the string they actually carry. */
function pathConstants(files: string[]): Map<string, string> {
  const constants = new Map<string, string>();
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(
      /export const ([A-Z][A-Z0-9_]*)\s*=\s*"(\/[^"]*)"/g,
    )) {
      constants.set(m[1], m[2]);
    }
  }
  return constants;
}

/** Route paths declared in routes.tsx, e.g. `/quiz/:quizId`. */
function declaredRoutes(constants: Map<string, string>): string[] {
  const src = readFileSync(join(SRC, "routes.tsx"), "utf8");
  return [...src.matchAll(/path=(?:"([^"]+)"|\{([A-Za-z][A-Za-z0-9_]*)\})/g)]
    .map((m) => m[1] ?? constants.get(m[2]))
    .filter((p): p is string => !!p);
}

/** Does `target` match a declared route pattern? */
function isRoutable(target: string, routes: string[]): boolean {
  const path = target.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  return routes.some((route) => {
    if (route === "*") return false;
    const pattern = route
      .split("/")
      .map((seg) => (seg.startsWith(":") ? "[^/]+" : escapeRegex(seg)))
      .join("/");
    return new RegExp(`^${pattern || "/"}$`).test(path);
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* Link targets written as string literals. Template literals with an
   interpolated id (`/quiz/${id}`) are normalised to a `:param` segment so they
   can be matched against the route table. */
function linkTargets(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const found = new Set<string>();

  for (const m of src.matchAll(/\b(?:to|path)=["'](\/[^"']*)["']/g)) {
    found.add(m[1]);
  }
  for (const m of src.matchAll(/navigate\(\s*["'](\/[^"']*)["']/g)) {
    found.add(m[1]);
  }
  for (const m of src.matchAll(/navigate\(\s*`(\/[^`]*)`/g)) {
    found.add(m[1].replace(/\$\{[^}]*\}/g, "x"));
  }
  for (const m of src.matchAll(/\bto=\{\s*`(\/[^`]*)`\s*\}/g)) {
    found.add(m[1].replace(/\$\{[^}]*\}/g, "x"));
  }
  return [...found];
}

const FILES = sourceFiles(SRC);
const ROUTES = declaredRoutes(pathConstants(FILES));

describe("route integrity", () => {
  it("declares the canonical tool routes", () => {
    for (const route of [
      "/study",
      "/solver",
      "/feynman",
      "/viva",
      "/exam-detective",
    ]) {
      expect(ROUTES).toContain(route);
    }
  });

  /* The aliases stay as redirects for old bookmarks, but nothing in the app
     may send a student to one — that is how /solver and /debugger ended up
     with navigation split between them, in the same component. */
  it("no navigation targets a legacy alias", () => {
    const aliases = [
      "/debugger",
      "/sparring",
      "/ai-tutor",
      "/premortem",
      "/exam-traps",
      "/study-lab",
      "/notebooks",
    ];
    const offenders: string[] = [];

    for (const file of FILES) {
      if (file.endsWith("routes.tsx")) continue;
      for (const target of linkTargets(file)) {
        const path = target.split(/[?#]/)[0].replace(/\/$/, "");
        if (aliases.includes(path)) {
          offenders.push(`${file.replace(SRC, "")} -> ${target}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("every link target resolves to a declared route", () => {
    /* Root-relative hrefs to static pages served outside the SPA. */
    const external = ["/terms.html", "/llms.txt", "/privacy.html"];
    const unroutable: string[] = [];

    for (const file of FILES) {
      if (file.endsWith("routes.tsx")) continue;
      for (const target of linkTargets(file)) {
        if (external.includes(target)) continue;
        if (!isRoutable(target, ROUTES)) {
          unroutable.push(`${file.replace(SRC, "")} -> ${target}`);
        }
      }
    }

    expect(unroutable).toEqual([]);
  });
  /* Reachability. The rail listed 11 of ~45 routes, and /tasks, /exams,
     /my-week, /trajectory and /exam-detective could be reached only by typing
     a URL or opening the command palette — the section sub-navs that led to
     them are invisible until you are already on one of their pages. */
  it("offers every primary destination in the sidebar", () => {
    const sidebar = readFileSync(
      join(SRC, "components", "Sidebar.tsx"),
      "utf8",
    );
    const offered = new Set(
      [...sidebar.matchAll(/\bto:\s*"(\/[^"]*)"/g)].map((m) => m[1]),
    );

    for (const destination of [
      "/",
      "/library",
      "/plan",
      "/my-week",
      "/tasks",
      "/exams",
      "/timer",
      "/analytics",
      "/trajectory",
      "/study",
      "/solver",
      "/feynman",
      "/viva",
      "/exam-detective",
      "/room",
      "/friends",
      "/settings",
    ]) {
      expect([...offered]).toContain(destination);
    }
  });
});
