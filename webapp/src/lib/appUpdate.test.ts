import { describe, expect, it, vi, afterEach } from "vitest";
import { watchForAppUpdate } from "./appUpdate";

/* The condition worth testing is the one that is easy to get subtly wrong:
 * a *waiting* worker only means "a new version is ready" when the page is
 * already controlled by an older one. On a student's first ever visit a
 * worker also ends up waiting, and prompting "Learnora has been updated" to
 * someone who just opened it for the first time would be nonsense. */
function stubServiceWorker(registration: Partial<ServiceWorkerRegistration>, controller: unknown) {
  const container = {
    ready: Promise.resolve(registration as ServiceWorkerRegistration),
    controller,
    addEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    value: container,
    configurable: true,
  });
}

const registrationWith = (waiting: unknown) =>
  ({
    waiting,
    installing: null,
    addEventListener: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  }) as unknown as ServiceWorkerRegistration;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("watchForAppUpdate", () => {
  it("announces when a worker is waiting and an older one is in control", async () => {
    stubServiceWorker(registrationWith({}), {});
    const onReady = vi.fn();
    watchForAppUpdate(onReady);
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
  });

  it("stays quiet on a first install, where nothing is controlling the page yet", async () => {
    stubServiceWorker(registrationWith({}), null);
    const onReady = vi.fn();
    watchForAppUpdate(onReady);
    await new Promise((r) => setTimeout(r, 20));
    expect(onReady).not.toHaveBeenCalled();
  });

  it("stays quiet when nothing is waiting", async () => {
    stubServiceWorker(registrationWith(null), {});
    const onReady = vi.fn();
    watchForAppUpdate(onReady);
    await new Promise((r) => setTimeout(r, 20));
    expect(onReady).not.toHaveBeenCalled();
  });

  it("does not announce after cleanup has run", async () => {
    stubServiceWorker(registrationWith({}), {});
    const onReady = vi.fn();
    watchForAppUpdate(onReady)();
    await new Promise((r) => setTimeout(r, 20));
    expect(onReady).not.toHaveBeenCalled();
  });
});
