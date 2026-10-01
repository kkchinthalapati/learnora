import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./test/mocks/server";
import { SUPABASE_URL } from "./lib/supabase";
import { mockAuthSession } from "./test/mockSession";
import { flashcardsApi } from "./api/flashcards";
import { profileApi } from "./api/profile";
import { appCsps, imgSrcAllows } from "./test/productionCsp";

/* Card images (signed URLs, private `card-media` bucket) and avatars (public
 * URLs, `avatars` bucket) are Supabase Storage URLs that go straight into
 * <img src>. With img-src at `'self' data: blob:` production blocked every
 * one of them, while dev and this suite — which run with no CSP — never
 * noticed. These pin both halves: the URLs the app really builds are admitted
 * by every policy that can serve the app, and img-src hasn't been widened
 * past this project's storage objects. avatar_url is user-writable and shown
 * to other people, so a policy that admitted any host would turn it into a
 * view-tracking pixel. */
describe("production CSP img-src (vercel.json)", () => {
  const policies = appCsps();

  function expectAdmittedEverywhere(url: string) {
    for (const { source, policy } of policies) {
      expect(imgSrcAllows(policy, url), `"${source}" admits ${url}`).toBe(true);
    }
  }

  beforeEach(() => {
    mockAuthSession("user-1");
  });

  it("covers the root rule as well as /app/(.*)", () => {
    /* /app and /terms are rewritten to the app but only match "/(.*)", so
       a fix applied to the /app/(.*) policy alone still breaks there. */
    expect(policies.map((p) => p.source)).toEqual(
      expect.arrayContaining(["/(.*)", "/app/(.*)"]),
    );
  });

  it("admits the signed URL a card image is shown from", async () => {
    server.use(
      http.post(
        `${SUPABASE_URL}/storage/v1/object/sign/card-media/:path*`,
        /* Storage answers with a path relative to /storage/v1. */
        () =>
          HttpResponse.json({
            signedURL: "/object/sign/card-media/user-1/diagram.png?token=t",
          }),
      ),
    );

    const url = await flashcardsApi.getImageUrl("user-1/diagram.png");

    expect(new URL(url).pathname).toBe(
      "/storage/v1/object/sign/card-media/user-1/diagram.png",
    );
    expectAdmittedEverywhere(url);
  });

  it("admits the public URL an uploaded avatar is shown from", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/storage/v1/object/avatars/:path*`, () =>
        HttpResponse.json({ Key: "avatars/user-1/avatar.png" }),
      ),
    );

    const url = await profileApi.uploadAvatar(
      new File(["x"], "me.png", { type: "image/png" }),
    );

    expect(new URL(url).pathname).toBe(
      "/storage/v1/object/public/avatars/user-1/avatar.png",
    );
    expectAdmittedEverywhere(url);
  });

  it("would have caught the policy that blocked them", () => {
    expect(
      imgSrcAllows(
        "default-src 'self'; img-src 'self' data: blob:",
        `${SUPABASE_URL}/storage/v1/object/public/avatars/user-1/avatar.png`,
      ),
    ).toBe(false);
  });

  it.each([
    ["an OAuth provider's picture", "https://lh3.googleusercontent.com/a/photo"],
    ["a user-set tracking pixel", "https://tracker.example/pixel.gif"],
    [
      "another Supabase project's storage",
      "https://someoneelse.supabase.co/storage/v1/object/public/avatars/x.png",
    ],
    ["an edge function on this project", `${SUPABASE_URL}/functions/v1/learnora-ai`],
    ["the REST API on this project", `${SUPABASE_URL}/rest/v1/profiles`],
  ])("still blocks %s", (_label, url) => {
    for (const { source, policy } of policies) {
      expect(imgSrcAllows(policy, url), `"${source}" blocks ${url}`).toBe(false);
    }
  });
});
