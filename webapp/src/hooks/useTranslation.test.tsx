import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { SettingsProvider } from "../context/SettingsProvider";
import { useSettings } from "../context/settings";
import { useTranslation } from "./useTranslation";

function wrapper({ children }: { children: ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}

describe("useTranslation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("translates using the current uiLanguage", () => {
    const { result } = renderHook(
      () => ({ t: useTranslation(), settings: useSettings() }),
      { wrapper },
    );

    expect(result.current.t("nav_dashboard")).toBe("Dashboard");

    act(() => {
      result.current.settings.setSettings({ uiLanguage: "es" });
    });

    expect(result.current.t("nav_dashboard")).toBe("Tablero");
  });

  it("returns the plain English string by default", () => {
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current("btn_start")).toBe("Start");
  });
});
