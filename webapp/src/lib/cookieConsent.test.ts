import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_EVENT,
  readCookieConsent,
  reopenCookieChoice,
  writeCookieConsent,
} from "./cookieConsent";

afterEach(() => {
  document.cookie = "learnora_cookie_consent=; Max-Age=0; Path=/";
});

describe("cookie consent", () => {
  it("reads only its own cookie and only known values", () => {
    expect(readCookieConsent("a=1; learnora_cookie_consent=all; b=2")).toBe(
      "all",
    );
    expect(readCookieConsent("learnora_cookie_consent=essential")).toBe(
      "essential",
    );
    expect(readCookieConsent("learnora_cookie_consent=yes")).toBeNull();
    expect(readCookieConsent("other=all")).toBeNull();
  });

  it("writes the choice, announces it, and can be asked again", () => {
    const heard = vi.fn();
    window.addEventListener(CONSENT_EVENT, heard);
    writeCookieConsent("essential");
    expect(readCookieConsent()).toBe("essential");
    reopenCookieChoice();
    expect(readCookieConsent()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);
    window.removeEventListener(CONSENT_EVENT, heard);
  });
});
