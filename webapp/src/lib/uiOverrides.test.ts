import { beforeEach, describe, expect, it } from "vitest";
import {
  UI_OVERRIDES_KEY,
  applyUiOverrides,
  readUiOverrides,
  sanitizeUiOverrides,
  writeUiOverrides,
} from "./uiOverrides";

describe("uiOverrides", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute("style");
  });

  it("keeps only registered tokens with a hex colour", () => {
    expect(
      sanitizeUiOverrides({
        "--surface": "#AABBCC",
        "--not-a-token": "#112233",
        "--text": "red",
        "--bg": 5,
      }),
    ).toEqual({ "--surface": "#aabbcc" });
  });

  it("drops a tampered stored value on read", () => {
    localStorage.setItem(UI_OVERRIDES_KEY, JSON.stringify({ "--bg": "url(evil)" }));
    expect(readUiOverrides()).toEqual({});
  });

  it("removes the key when nothing is overridden", () => {
    writeUiOverrides({ "--bg": "#101010" });
    expect(localStorage.getItem(UI_OVERRIDES_KEY)).not.toBeNull();
    writeUiOverrides({});
    expect(localStorage.getItem(UI_OVERRIDES_KEY)).toBeNull();
  });

  it("sets overridden tokens on body and clears the rest", () => {
    applyUiOverrides({ "--bg": "#101010" });
    expect(document.body.style.getPropertyValue("--bg")).toBe("#101010");
    applyUiOverrides({});
    expect(document.body.style.getPropertyValue("--bg")).toBe("");
  });
});
