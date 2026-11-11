import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AppProviders } from "../test/render";
import { authValue, fakeSession } from "../test/auth";
import { mockAuthSession } from "../test/mockSession";
import { Storage } from "../lib/storage";

/* Production check 2026-11-08: "Save appearance" showed "Appearance saved."
   but a reload came back in the default mode. The provider wipes saved
   appearance when the signed-in account changes, and it read the auth
   provider's loading state (user null) as "signed out", so the session
   arriving looked like a new account signing in, on every page load. */
describe("AppearanceProvider", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    Storage.set("learnora_mode", "light");
  });
  afterEach(() => {
    Storage.remove("learnora_mode");
  });

  it("keeps the saved appearance while the session loads and arrives", () => {
    const session = fakeSession();
    const { rerender } = render(
      <AppProviders auth={authValue({ session: null, user: null, loading: true })}>
        <p>app</p>
      </AppProviders>,
    );
    rerender(
      <AppProviders auth={authValue({ session, user: session.user, loading: false })}>
        <p>app</p>
      </AppProviders>,
    );
    expect(Storage.get("learnora_mode")).toBe("light");
  });

  it("still clears it when a different account signs in", () => {
    const first = fakeSession();
    const second = fakeSession({ id: "user-2" });
    const { rerender } = render(
      <AppProviders auth={authValue({ session: first, user: first.user, loading: false })}>
        <p>app</p>
      </AppProviders>,
    );
    rerender(
      <AppProviders auth={authValue({ session: second, user: second.user, loading: false })}>
        <p>app</p>
      </AppProviders>,
    );
    expect(Storage.get("learnora_mode")).toBeNull();
  });
});
