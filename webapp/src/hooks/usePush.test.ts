import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePush } from "./usePush";

/* Mock the service worker and push libraries */
vi.mock("../lib/serviceWorker");
vi.mock("../lib/push");
vi.mock("../api/push");
vi.mock("../context/toast", () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

describe("usePush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with 'checking' status when push is supported", () => {
    vi.mocked(require("../lib/push").isPushSupported).mockReturnValue(true);

    const { result } = renderHook(() => usePush());

    expect(result.current.status).toBe("checking");
  });

  it("sets status to 'unsupported' when push is not supported", () => {
    vi.mocked(require("../lib/push").isPushSupported).mockReturnValue(false);

    const { result } = renderHook(() => usePush());

    expect(result.current.status).toBe("unsupported");
  });

  it("initializes with empty subscriptions list", () => {
    vi.mocked(require("../lib/push").isPushSupported).mockReturnValue(true);

    const { result } = renderHook(() => usePush());

    expect(result.current.allSubscriptions).toEqual([]);
  });

  it("initializes with no error", () => {
    vi.mocked(require("../lib/push").isPushSupported).mockReturnValue(true);

    const { result } = renderHook(() => usePush());

    expect(result.current.error).toBeNull();
  });

  it("starts with pending=false", () => {
    vi.mocked(require("../lib/push").isPushSupported).mockReturnValue(true);

    const { result } = renderHook(() => usePush());

    expect(result.current.pending).toBe(false);
  });

  it("has a removeSubscription method", () => {
    vi.mocked(require("../lib/push").isPushSupported).mockReturnValue(true);

    const { result } = renderHook(() => usePush());

    expect(typeof result.current.removeSubscription).toBe("function");
  });

  it("has enable and disable methods", () => {
    vi.mocked(require("../lib/push").isPushSupported).mockReturnValue(true);

    const { result } = renderHook(() => usePush());

    expect(typeof result.current.enable).toBe("function");
    expect(typeof result.current.disable).toBe("function");
  });

  it("has an updatePreferences method", () => {
    vi.mocked(require("../lib/push").isPushSupported).mockReturnValue(true);

    const { result } = renderHook(() => usePush());

    expect(typeof result.current.updatePreferences).toBe("function");
  });

  it("exposes row and allSubscriptions state", () => {
    vi.mocked(require("../lib/push").isPushSupported).mockReturnValue(true);

    const { result } = renderHook(() => usePush());

    expect(result.current.row).toBeNull();
    expect(Array.isArray(result.current.allSubscriptions)).toBe(true);
  });
});
