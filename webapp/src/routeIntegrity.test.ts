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
  it("declares the Study hub and the Session route", () => {
    for (const route of ["/study", "/study/:sessionId"]) {
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
      "/dashboard",
      /* Session modes since the 2026-09 redesign (LegacyToolRedirect). */
      "/solver",
      "/feynman",
      "/viva",
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
    const external = ["/llms.txt", "/privacy.html"];
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
  it("offers every primary destination in the top bar, and every planner page from Plan", () => {
    const linksIn = (...parts: string[]) =>
      new Set(
        [...readFileSync(join(SRC, ...parts), "utf8").matchAll(/\b(?:to|path)(?::\s*|=)"(\/[^"]*)"/g)].map(
          (m) => m[1],
        ),
      );
    /* The top bar: Home · Subjects · Plan · Progress, the timer, and the
       profile menu's Settings and community links (webapp/DESIGN.md 0.2). */
    const topBar = linksIn("components", "TopBar.tsx");
    for (const destination of ["/", "/library", "/plan", "/analytics", "/timer", "/settings", "/room"]) {
      expect([...topBar]).toContain(destination);
    }
    /* The planner's pages hang off Plan's own tabs; Trajectory off Progress's. */
    const plan = linksIn("views", "plan", "PlanSectionNav.tsx");
    for (const destination of ["/plan", "/my-week", "/tasks", "/exams"]) {
      expect([...plan]).toContain(destination);
    }
    expect([...linksIn("views", "analytics", "ProgressSectionNav.tsx")]).toContain("/trajectory");
    /* A study session starts from a lesson. */
    expect(readFileSync(join(SRC, "views", "lesson", "LessonView.tsx"), "utf8")).toContain("/study?topic=");
  });

  it("every ?tab= link into Settings names a real tab", () => {
    /* Notebook Studio's "View plan" sent five limit toasts to
       /settings?tab=subscription; the Plan tab is "billing", so students
       who hit a limit landed on Account instead. */
    const settings = readFileSync(join(SRC, "views", "settings", "SettingsView.tsx"), "utf8");
    const tabsBlock = settings.slice(settings.indexOf("export const SETTINGS_TABS"));
    const tabs = new Set([...tabsBlock.matchAll(/\bid:\s*"([a-z-]+)"/g)].map((m) => m[1]));
    expect(tabs.has("billing")).toBe(true);

    const bad: string[] = [];
    for (const file of sourceFiles(SRC)) {
      for (const m of readFileSync(file, "utf8").matchAll(/\/settings\?tab=([a-z-]+)/g)) {
        if (!tabs.has(m[1])) bad.push(`${file.slice(SRC.length + 1)}: ?tab=${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
