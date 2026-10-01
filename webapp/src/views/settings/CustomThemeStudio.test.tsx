import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "../../test/render";
import { server } from "../../test/mocks/server";
import { mockAuthSession } from "../../test/mockSession";
import { SUPABASE_URL } from "../../lib/supabase";
import { CUSTOM_THEME_KEY } from "../../lib/appearance";
import { Storage } from "../../lib/storage";
import { CustomThemeStudio } from "./CustomThemeStudio";

function hexInput() {
  return screen.getByRole("textbox", { name: "Hex colour value" });
}

function stops() {
  return screen.getAllByRole("button", { name: /^Edit colour/ });
}

describe("CustomThemeStudio", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute("style");
    document.body.removeAttribute("data-theme-color");
    /* The studio itself has no opinion on entitlements — it always renders —
       but AppearanceProvider only paints a custom accent onto <body> for a
       Pro account (see AppearanceProvider's `effectiveAppearance`), and one
       test below checks that paint. Mocked Pro here so this file stays about
       the studio's own behaviour rather than plan gating, which
       AppearanceTab.test.tsx already covers. */
    mockAuthSession("user-1");
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/profiles`, () =>
        HttpResponse.json([
          {
            plan: "pro",
            plan_status: "active",
            plan_renews_at: null,
            plan_cancel_at_period_end: false,
          },
        ]),
      ),
    );
  });

  it("opens on the stored stop", () => {
    Storage.set(CUSTOM_THEME_KEY, { colors: ["#FF8800"], intensity: 30 });
    renderWithProviders(<CustomThemeStudio />);

    expect(hexInput()).toHaveValue("#FF8800");
    expect(screen.getByText("30%")).toBeInTheDocument();
  });

  it("accepts a typed hex and repaints the accent", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);

    await user.clear(hexInput());
    await user.type(hexInput(), "#00FF00");

    expect(hexInput()).not.toHaveAttribute("aria-invalid");
    await waitFor(() =>
      expect(
        document.body.style.getPropertyValue("--custom-accent"),
      ).not.toBe(""),
    );
  });

  it("expands a three-digit shorthand", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);

    await user.clear(hexInput());
    await user.type(hexInput(), "#abc");
    await user.tab();

    expect(hexInput()).toHaveValue("#AABBCC");
  });

  it("flags an unparseable hex without writing it anywhere", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);

    await user.clear(hexInput());
    await user.type(hexInput(), "zzzzzz");

    expect(hexInput()).toHaveAttribute("aria-invalid", "true");
  });

  it("discards a half-typed value on blur", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);
    const before = (hexInput() as HTMLInputElement).value;

    await user.clear(hexInput());
    await user.type(hexInput(), "#12");
    await user.tab();

    expect(hexInput()).toHaveValue(before);
    expect(hexInput()).not.toHaveAttribute("aria-invalid");
  });

  it("exposes the saturation/brightness field as a slider with live text", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);
    const sv = screen.getByRole("slider", {
      name: /saturation and brightness/i,
    });
    const before = sv.getAttribute("aria-valuetext");

    sv.focus();
    await user.keyboard("{ArrowLeft}");

    expect(sv.getAttribute("aria-valuetext")).not.toBe(before);
    expect(sv.getAttribute("aria-valuetext")).toMatch(
      /^Saturation \d+%, brightness \d+%$/,
    );
  });

  it("takes a bigger saturation step when Shift is held", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);
    const sv = screen.getByRole("slider", {
      name: /saturation and brightness/i,
    });
    const read = () =>
      Number(/Saturation (\d+)%/.exec(sv.getAttribute("aria-valuetext")!)![1]);

    sv.focus();
    const start = read();
    await user.keyboard("{ArrowLeft}");
    const small = start - read();
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    const large = start - small - read();

    expect(large).toBeGreaterThan(small);
  });

  it("moves the hue slider with the arrow keys and clamps its reported value", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);
    const hue = screen.getByRole("slider", { name: "Hue" });
    expect(hue).toHaveAttribute("aria-valuemin", "0");
    expect(hue).toHaveAttribute("aria-valuemax", "359");
    const before = Number(hue.getAttribute("aria-valuenow"));

    hue.focus();
    await user.keyboard("{ArrowRight}");

    expect(Number(hue.getAttribute("aria-valuenow"))).toBe(before + 3);
  });

  it("keeps the hue when dragged to a corner where saturation is zero", async () => {
    /* The reason the picker's HSV is held apart from the hex list: converting
       #000000 back to HSV reports hue 0, which would snap the handle to red. */
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);
    const hue = screen.getByRole("slider", { name: "Hue" });
    const sv = screen.getByRole("slider", {
      name: /saturation and brightness/i,
    });

    hue.focus();
    await user.keyboard("{Shift>}{ArrowRight}{ArrowRight}{/Shift}");
    const hueAfterMove = hue.getAttribute("aria-valuenow");

    sv.focus();
    for (let i = 0; i < 12; i++)
      await user.keyboard("{Shift>}{ArrowDown}{/Shift}");

    expect(sv.getAttribute("aria-valuetext")).toContain("brightness 0%");
    expect(hue.getAttribute("aria-valuenow")).toBe(hueAfterMove);
  });

  it("adds stops up to three, then disables the button", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);
    const add = screen.getByRole("button", { name: /^Add Colour/ });
    expect(stops()).toHaveLength(1);

    await user.click(add);
    expect(stops()).toHaveLength(2);
    await user.click(add);
    expect(stops()).toHaveLength(3);
    expect(add).toBeDisabled();
  });

  it("hides the remove control while a single stop remains", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);
    expect(screen.queryByRole("button", { name: /^Remove colour/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: /^Add Colour/ }));

    expect(
      screen.getAllByRole("button", { name: /^Remove colour/ }),
    ).toHaveLength(2);
  });

  it("removes a stop and re-enables Add Colour", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);
    const add = screen.getByRole("button", { name: /^Add Colour/ });
    await user.click(add);
    await user.click(add);
    expect(add).toBeDisabled();

    await user.click(
      screen.getAllByRole("button", { name: /^Remove colour/ })[2],
    );

    expect(stops()).toHaveLength(2);
    expect(add).toBeEnabled();
  });

  it("marks exactly one stop as the one being edited", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);
    await user.click(screen.getByRole("button", { name: /^Add Colour/ }));

    // A freshly added stop becomes the active one.
    expect(stops()[1]).toHaveAttribute("aria-pressed", "true");
    expect(stops()[0]).toHaveAttribute("aria-pressed", "false");

    await user.click(stops()[0]);

    expect(stops()[0]).toHaveAttribute("aria-pressed", "true");
    expect(stops()[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("edits the selected stop, not always the first", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);
    await user.click(screen.getByRole("button", { name: /^Add Colour/ }));
    const firstColour = stops()[0].getAttribute("aria-label");

    await user.clear(hexInput());
    await user.type(hexInput(), "#010203");

    expect(stops()[0]).toHaveAttribute("aria-label", firstColour!);
    expect(stops()[1]).toHaveAttribute("aria-label", "Edit colour 2, #010203");
  });

  it("reports intensity as it moves", async () => {
    renderWithProviders(<CustomThemeStudio />);
    const slider = screen.getByLabelText("Colour Intensity");
    expect(screen.getByText("74%")).toBeInTheDocument();

    // userEvent can't drag a range input; fire the change the browser would.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    nativeSetter.call(slider, "20");
    slider.dispatchEvent(new Event("input", { bubbles: true }));

    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("Surprise Me produces a fresh, valid palette", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);

    await user.click(screen.getByRole("button", { name: "Surprise Me" }));

    const labels = stops().map((s) => s.getAttribute("aria-label")!);
    expect(labels.length).toBeGreaterThanOrEqual(1);
    expect(labels.length).toBeLessThanOrEqual(3);
    labels.forEach((l) => expect(l).toMatch(/#[0-9A-F]{6}$/));
  });

  it("Reset restores the default stop and persists it straight away", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomThemeStudio />);
    await user.click(screen.getByRole("button", { name: /^Add Colour/ }));
    await user.click(screen.getByRole("button", { name: "Surprise Me" }));

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(hexInput()).toHaveValue("#5865F2");
    expect(stops()).toHaveLength(1);
    /* Unlike every other studio edit, the vanilla's reset writes through
       immediately rather than waiting for Save Appearance. */
    expect(
      Storage.get<{ colors: string[]; intensity: number }>(CUSTOM_THEME_KEY),
    ).toEqual({ colors: ["#5865F2"], intensity: 74 });
    expect(
      await screen.findByText("Custom colours reset to the Learnora default."),
    ).toBeInTheDocument();
  });

  it("omits the eyedropper on browsers without the API", () => {
    renderWithProviders(<CustomThemeStudio />);
    // jsdom has no EyeDropper, matching every non-Chromium browser.
    expect(
      screen.queryByRole("button", { name: /Pick a colour from anywhere/ }),
    ).toBeNull();
  });
});
