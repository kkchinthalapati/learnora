import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "../../test/render";
import { server } from "../../test/mocks/server";
import { mockAuthSession } from "../../test/mockSession";
import { SUPABASE_URL } from "../../lib/supabase";
import { CUSTOM_THEME_KEY } from "../../lib/appearance";
import { Storage } from "../../lib/storage";
import { AppearanceTab } from "./AppearanceTab";

/* Accent presets and the custom colour studio are Pro-gated (customAppearance
   in lib/entitlements.ts); everything this file exercises lives behind that
   gate, so every test here renders as an entitled Pro account. Gating itself
   is covered separately, in "keeps the colour controls behind the Pro gate
   for a free account" below. */
function serveProfile(pro: boolean) {
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/profiles`, () =>
      HttpResponse.json(
        pro
          ? [
              {
                plan: "pro",
                plan_status: "active",
                plan_renews_at: null,
                plan_cancel_at_period_end: false,
              },
            ]
          : [],
      ),
    ),
  );
}

describe("AppearanceTab", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = "";
    document.body.removeAttribute("style");
    for (const attr of [
      "data-theme-color",
      "data-sidebar-style",
      "data-bg-texture",
      "data-font-family",
      "data-font-size",
    ]) {
      document.body.removeAttribute(attr);
    }
    mockAuthSession("user-1");
    serveProfile(true);
  });

  it("keeps the colour controls behind the Pro gate for a free account", async () => {
    serveProfile(false);
    renderWithProviders(<AppearanceTab />);

    expect(
      await screen.findByRole("button", { name: /see what pro adds/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Pacific Deep")).toBeNull();
  });

  /* Every remaining test exercises accent/custom-colour controls, which sit
     behind the Pro gate and so behind the entitlements query's first
     resolution — waiting for the swatch grid to appear is what stands in for
     "the gate has opened" before a test starts clicking. */
  async function renderTab() {
    renderWithProviders(<AppearanceTab />);
    return screen.findByRole("group", { name: "Colour presets" });
  }

  it("marks the stored selection as pressed on mount", async () => {
    Storage.set("learnora_mode", "light");
    Storage.set("learnora_accent", "ocean");
    await renderTab();

    expect(screen.getByRole("button", { name: /Light Mode/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Pacific Deep/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Dark Mode/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("applies a mode change to the body immediately", async () => {
    const user = userEvent.setup();
    await renderTab();
    expect(document.body.classList.contains("dark-theme")).toBe(true);

    await user.click(screen.getByRole("button", { name: /Light Mode/ }));

    expect(document.body.classList.contains("dark-theme")).toBe(false);
  });

  it("applies a preset to the body and renames the live preview badge", async () => {
    const user = userEvent.setup();
    await renderTab();
    // Swatch card name + live preview badge.
    expect(screen.getAllByText("Scholar Teal")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /Neon Velvet/ }));

    expect(document.body.getAttribute("data-theme-color")).toBe("cyberpunk");
    // Once in the swatch card, once in the preview badge.
    expect(screen.getAllByText("Neon Velvet")).toHaveLength(2);
  });

  it("offers all thirteen curated presets", async () => {
    const group = await renderTab();
    expect(group.querySelectorAll("button")).toHaveLength(13);
  });

  it("applies font, scale, sidebar and background choices to the body", async () => {
    const user = userEvent.setup();
    await renderTab();

    await user.click(screen.getByRole("button", { name: /JetBrains Mono/ }));
    await user.click(screen.getByRole("button", { name: /Compact/ }));
    await user.click(screen.getByRole("button", { name: /Solid Canvas/ }));
    await user.click(screen.getByRole("button", { name: /Liquid Mesh/ }));

    expect(document.body.getAttribute("data-font-family")).toBe("mono");
    expect(document.body.getAttribute("data-font-size")).toBe("sm");
    expect(document.body.getAttribute("data-sidebar-style")).toBe("solid");
    expect(document.body.getAttribute("data-bg-texture")).toBe("mesh");
  });

  it("does not persist a change until Save Appearance is pressed", async () => {
    const user = userEvent.setup();
    await renderTab();

    await user.click(screen.getByRole("button", { name: /Pacific Deep/ }));
    expect(Storage.get<string>("learnora_accent")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Save Appearance" }));

    expect(Storage.get<string>("learnora_accent")).toBe("ocean");
    expect(await screen.findByText("Appearance saved.")).toBeInTheDocument();
  });

  it("writes every appearance key on save", async () => {
    const user = userEvent.setup();
    await renderTab();

    await user.click(screen.getByRole("button", { name: /Light Mode/ }));
    await user.click(screen.getByRole("button", { name: /Inter UI/ }));
    await user.click(screen.getByRole("button", { name: "Save Appearance" }));

    expect(Storage.get<string>("learnora_mode")).toBe("light");
    expect(Storage.get<string>("learnora_theme")).toBe("light");
    expect(Storage.get<string>("learnora_font")).toBe("inter");
    expect(Storage.get<string>("learnora_sidebar")).toBe("glass");
    expect(Storage.get<string>("learnora_bg")).toBe("none");
    expect(Storage.get<string>("learnora_size")).toBe("md");
  });

  it("restores every default and drops the custom stops on reset", async () => {
    const user = userEvent.setup();
    Storage.set("learnora_accent", "ruby");
    Storage.set("learnora_font", "mono");
    Storage.set(CUSTOM_THEME_KEY, { colors: ["#123456"], intensity: 10 });
    await renderTab();

    await user.click(screen.getByRole("button", { name: "Reset Defaults" }));

    expect(Storage.get<string>("learnora_accent")).toBe("default");
    expect(Storage.get<string>("learnora_font")).toBe("jakarta");
    expect(localStorage.getItem(CUSTOM_THEME_KEY)).toBeNull();
    expect(document.body.getAttribute("data-theme-color")).toBe("default");
    expect(
      await screen.findByText("Appearance settings reset to defaults."),
    ).toBeInTheDocument();
  });

  it("switches the accent to custom as soon as the studio is touched", async () => {
    const user = userEvent.setup();
    await renderTab();
    expect(document.body.getAttribute("data-theme-color")).toBe("default");

    await user.click(screen.getByRole("button", { name: /^Add Colour/ }));

    expect(document.body.getAttribute("data-theme-color")).toBe("custom");
    // The studio's own field label, plus the live preview badge following it.
    expect(screen.getAllByText("Custom Colours")).toHaveLength(2);
  });

  it("deselects the preset that was active before the studio took over", async () => {
    const user = userEvent.setup();
    await renderTab();
    const scholar = screen.getByRole("button", { name: /Scholar Teal/ });
    expect(scholar).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /^Add Colour/ }));

    expect(scholar).toHaveAttribute("aria-pressed", "false");
  });
});
