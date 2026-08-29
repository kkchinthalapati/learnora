import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import { CUSTOM_THEME_KEY } from "../../lib/appearance";
import { Storage } from "../../lib/storage";
import { AppearanceTab } from "./AppearanceTab";

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
  });

  it("marks the stored selection as pressed on mount", () => {
    Storage.set("learnora_mode", "light");
    Storage.set("learnora_accent", "ocean");
    renderWithProviders(<AppearanceTab />);

    expect(screen.getByRole("button", { name: /Light Mode/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Deep Ocean/ })).toHaveAttribute(
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
    renderWithProviders(<AppearanceTab />);
    expect(document.body.classList.contains("dark-theme")).toBe(true);

    await user.click(screen.getByRole("button", { name: /Light Mode/ }));

    expect(document.body.classList.contains("dark-theme")).toBe(false);
  });

  it("applies a preset to the body and renames the live preview badge", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearanceTab />);
    // Swatch card name + live preview badge.
    expect(screen.getAllByText("Midnight Space")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /Cyberpunk/ }));

    expect(document.body.getAttribute("data-theme-color")).toBe("cyberpunk");
    // Once in the swatch card, once in the preview badge.
    expect(screen.getAllByText("Cyberpunk")).toHaveLength(2);
  });

  it("offers all thirteen curated presets", () => {
    renderWithProviders(<AppearanceTab />);
    const group = screen.getByRole("group", { name: "Colour presets" });
    expect(group.querySelectorAll("button")).toHaveLength(13);
  });

  it("applies font, scale, sidebar and background choices to the body", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearanceTab />);

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
    renderWithProviders(<AppearanceTab />);

    await user.click(screen.getByRole("button", { name: /Deep Ocean/ }));
    expect(Storage.get<string>("learnora_accent")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Save Appearance" }));

    expect(Storage.get<string>("learnora_accent")).toBe("ocean");
    expect(await screen.findByText("Appearance saved.")).toBeInTheDocument();
  });

  it("writes every appearance key on save", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearanceTab />);

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
    renderWithProviders(<AppearanceTab />);

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
    renderWithProviders(<AppearanceTab />);
    expect(document.body.getAttribute("data-theme-color")).toBe("default");

    await user.click(screen.getByRole("button", { name: /^Add Colour/ }));

    expect(document.body.getAttribute("data-theme-color")).toBe("custom");
    // The studio's own field label, plus the live preview badge following it.
    expect(screen.getAllByText("Custom Colours")).toHaveLength(2);
  });

  it("deselects the preset that was active before the studio took over", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearanceTab />);
    const midnight = screen.getByRole("button", { name: /Midnight Space/ });
    expect(midnight).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /^Add Colour/ }));

    expect(midnight).toHaveAttribute("aria-pressed", "false");
  });
});
