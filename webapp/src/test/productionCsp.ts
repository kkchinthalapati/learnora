import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* The production Content-Security-Policy, read from vercel.json rather than
 * copied. Dev, preview and this test suite all run with no CSP at all, so a
 * URL the app puts in <img src> can work everywhere except production — which
 * is how every card image and avatar shipped blocked. */

interface VercelConfig {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

const config = JSON.parse(
  readFileSync(resolve(__dirname, "../../../vercel.json"), "utf8"),
) as VercelConfig;

/* Vercel `source` patterns are path-to-regexp: `(.*)` groups pass through as
 * regex, `:name*` / `:name` are segments. */
function sourceRegExp(source: string): RegExp {
  const pattern = source
    .replace(/:[A-Za-z]+\*/g, ".*")
    .replace(/:[A-Za-z]+/g, "[^/]+");
  return new RegExp(`^${pattern}$`);
}

/** Every CSP that can govern the React app's document in production.
 *
 *  The app is served from every path rewritten to /app/index.html. On Vercel
 *  the later rule wins for a repeated header key, so /app/<route> gets the
 *  "/app/(.*)" policy while /app and /terms match only "/(.*)" — and an SPA
 *  keeps its first document's policy for every route after. So each policy
 *  that matches any of those paths has to admit what the app renders. */
export function appCsps(): { source: string; policy: string }[] {
  const appPaths = config.rewrites
    .filter((r) => r.destination === "/app/index.html")
    .map((r) => r.source.replace(/:[A-Za-z]+\*/g, "decks/deck-1"));

  return config.headers.flatMap((rule) => {
    const policy = rule.headers.find(
      (h) => h.key.toLowerCase() === "content-security-policy",
    )?.value;
    const servesApp = appPaths.some((p) => sourceRegExp(rule.source).test(p));
    return policy && servesApp ? [{ source: rule.source, policy }] : [];
  });
}

/* Stands in for the deployed origin; only 'self' cares what it is. */
const APP_ORIGIN = "https://app.test";

/** Would `policy` let an <img> load `url`? */
export function imgSrcAllows(policy: string, url: string): boolean {
  const directives = new Map(
    policy
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name.toLowerCase(), sources]),
  );
  const sources = directives.get("img-src") ?? directives.get("default-src") ?? [];
  const target = new URL(url, APP_ORIGIN);
  return sources.some((source) => sourceMatches(source, target));
}

/* The subset of CSP source matching vercel.json uses: 'self', scheme-sources
 * (`data:`), and host-sources with an optional `*.` wildcard, port and path —
 * a path ending in "/" matches as a prefix, any other path exactly. Other
 * keywords never admit a URL. */
function sourceMatches(source: string, target: URL): boolean {
  if (source === "'self'") return target.origin === APP_ORIGIN;
  if (source.startsWith("'")) return false;
  if (/^[a-z][a-z0-9+.-]*:$/i.test(source)) {
    return target.protocol === source.toLowerCase();
  }

  const match =
    /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?(\/.*)?$/i.exec(
      source,
    );
  if (!match) return false;
  const [, scheme, wildcard, host, port, path] = match;

  if (scheme && `${scheme.toLowerCase()}:` !== target.protocol) return false;
  const hostname = target.hostname.toLowerCase();
  const wanted = host.toLowerCase();
  if (wildcard ? !hostname.endsWith(`.${wanted}`) : hostname !== wanted) {
    return false;
  }
  if (port && port !== "*" && port !== target.port) return false;
  if (!path) return true;
  const targetPath = decodeURIComponent(target.pathname);
  return path.endsWith("/") ? targetPath.startsWith(path) : targetPath === path;
}
