// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

/* public/sw.js, run for real in a sandbox with an in-memory Cache API.
 *
 * The rules pinned here are the ones a mistake would turn into a leak or a
 * broken app: the worker only ever stores this app's own static files and
 * its HTML shell (never an API response, never another origin); a version
 * bump drops old caches; an offline start boots the latest shell; and push
 * still works. The full offline journey runs in tests/offline (Playwright). */

const ORIGIN = "https://learnora.test";
const SW_SOURCE = readFileSync(resolve(__dirname, "../../public/sw.js"), "utf8");

type Handler = (event: Record<string, unknown>) => void;

function loadWorker({ online = true, existingCaches = [] as string[] } = {}) {
  const handlers: Record<string, Handler> = {};
  const stores = new Map<string, Map<string, Response>>();
  for (const name of existingCaches) stores.set(name, new Map());
  const fetched: string[] = [];
  const key = (req: Request | string) => new URL(typeof req === "string" ? req : req.url, ORIGIN).href;

  const openStore = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (req: Request | string) => store.get(key(req))?.clone(),
      put: async (req: Request | string, res: Response) => void store.set(key(req), res),
      keys: async () => [...store.keys()].map((url) => new Request(url)),
      delete: async (req: Request | string) => store.delete(key(req)),
    };
  };
  const caches = {
    open: async (name: string) => openStore(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (req: Request | string) => {
      for (const store of stores.values()) {
        const hit = store.get(key(req));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  const showNotification = vi.fn();
  const self = {
    location: new URL(`${ORIGIN}/app/sw.js`),
    registration: { scope: `${ORIGIN}/app/`, showNotification },
    addEventListener: (type: string, fn: Handler) => void (handlers[type] = fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => []), openWindow: vi.fn() },
  };
  const fetchImpl = async (req: Request | string) => {
    const url = key(req);
    fetched.push(url);
    if (!online) throw new TypeError("Failed to fetch");
    return new Response(`body of ${url}`, { status: 200 });
  };

  vm.runInContext(
    SW_SOURCE,
    vm.createContext({ self, caches, fetch: fetchImpl, Request, Response, URL, console, Promise }),
  );

  const dispatch = async (type: string, extra: Record<string, unknown> = {}) => {
    const pending: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    handlers[type]({
      ...extra,
      waitUntil: (p: Promise<unknown>) => void pending.push(p),
      respondWith: (p: Promise<Response>) => void (responded = p),
    });
    await Promise.all(pending);
    return responded;
  };

  return { stores, fetched, dispatch, showNotification };
}

const cachedUrls = (stores: Map<string, Map<string, Response>>, name: string) =>
  [...(stores.get(name)?.keys() ?? [])].sort();

describe("sw.js", () => {
  it("caches only this app's own static files when asked (CACHE_URLS)", async () => {
    const { stores, dispatch } = loadWorker();
    await dispatch("message", {
      data: {
        type: "CACHE_URLS",
        urls: [
          `${ORIGIN}/app/assets/ReviewView-abc123.js`,
          `${ORIGIN}/app/assets/index-def456.css`,
          `${ORIGIN}/app/learnora.jpg`,
          "https://mlvgqwqiynpwpwzqufdf.supabase.co/rest/v1/flashcards?select=*",
          "https://evil.example/app/assets/x.js",
          `${ORIGIN}/app/rest/v1/flashcards`,
          `${ORIGIN}/app/review/deck-1`,
          `${ORIGIN}/elsewhere/assets/x.js`,
          "not a url at all",
        ],
      },
    });

    expect(cachedUrls(stores, "learnora-assets-v4")).toEqual([
      `${ORIGIN}/app/assets/ReviewView-abc123.js`,
      `${ORIGIN}/app/assets/index-def456.css`,
      `${ORIGIN}/app/learnora.jpg`,
    ]);
    // …and the shell, under its one canonical key.
    expect(cachedUrls(stores, "learnora-shell-v4")).toEqual([`${ORIGIN}/app/index.html`]);
  });

  it("drops caches from older versions on activate", async () => {
    const { stores, dispatch } = loadWorker({
      existingCaches: ["learnora-shell-v3", "learnora-assets-v3", "learnora-assets-v4"],
    });
    await dispatch("activate");
    expect([...stores.keys()]).toEqual(["learnora-assets-v4"]);
  });

  it("never touches another origin's requests (the Supabase API included)", async () => {
    const { dispatch } = loadWorker();
    const responded = await dispatch("fetch", {
      request: new Request("https://mlvgqwqiynpwpwzqufdf.supabase.co/rest/v1/flashcards"),
    });
    expect(responded).toBeUndefined();
  });

  it("keeps the latest shell from an online navigation and boots it offline", async () => {
    const online = loadWorker();
    const nav = (url: string) =>
      ({ url, method: "GET", mode: "navigate" }) as unknown as Request;
    const res = await online.dispatch("fetch", { request: nav(`${ORIGIN}/app/library`) });
    await (await res)!.text();
    await new Promise((r) => setTimeout(r, 0));
    expect(cachedUrls(online.stores, "learnora-shell-v4")).toEqual([`${ORIGIN}/app/index.html`]);

    const offline = loadWorker({ online: false });
    await offline.dispatch("install"); // offline install caches nothing, and doesn't throw
    const shell = offline.stores.get("learnora-shell-v4")!;
    shell.set(`${ORIGIN}/app/index.html`, new Response("latest shell", { status: 200 }));
    const fallback = await offline.dispatch("fetch", { request: nav(`${ORIGIN}/app/review/deck-9`) });
    expect(await (await fallback)!.text()).toBe("latest shell");
  });

  it("caps the asset cache, dropping the least recently fetched", async () => {
    const { stores, dispatch } = loadWorker();
    const urls = Array.from({ length: 305 }, (_, i) => `${ORIGIN}/app/assets/chunk-${String(i).padStart(3, "0")}.js`);
    await dispatch("message", { data: { type: "CACHE_URLS", urls } });
    const kept = cachedUrls(stores, "learnora-assets-v4");
    expect(kept).toHaveLength(300);
    expect(kept[0]).toBe(`${ORIGIN}/app/assets/chunk-005.js`);
  });

  it("still shows push notifications and honours SKIP_WAITING", async () => {
    const { dispatch, showNotification } = loadWorker();
    await dispatch("push", {
      data: { json: () => ({ title: "Cards due", body: "12 cards", url: "/app/review/daily-drill" }) },
    });
    expect(showNotification).toHaveBeenCalledWith("Cards due", expect.objectContaining({ body: "12 cards" }));
    await expect(dispatch("message", { data: { type: "SKIP_WAITING" } })).resolves.toBeUndefined();
  });
});
