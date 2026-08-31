import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfflineBanner } from "./OfflineBanner";
import * as offlineSync from "../lib/offlineSync";

vi.mock("../lib/offlineSync", () => ({
  useOnlineStatus: vi.fn(),
}));

describe("OfflineBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when online, not syncing, and queue is empty", () => {
    vi.mocked(offlineSync.useOnlineStatus).mockReturnValue({
      isOnline: true,
      queueSize: 0,
      isSyncing: false,
      syncNow: vi.fn(),
    });

    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("shows offline message when disconnected", () => {
    vi.mocked(offlineSync.useOnlineStatus).mockReturnValue({
      isOnline: false,
      queueSize: 2,
      isSyncing: false,
      syncNow: vi.fn(),
    });

    render(<OfflineBanner />);
    expect(
      screen.getByText(
        "You're offline. Your work is saved and will sync when you reconnect.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeInTheDocument();
  });

  it("shows syncing message when active sync is in progress", () => {
    vi.mocked(offlineSync.useOnlineStatus).mockReturnValue({
      isOnline: true,
      queueSize: 3,
      isSyncing: true,
      syncNow: vi.fn(),
    });

    render(<OfflineBanner />);
    expect(
      screen.getByText("Syncing 3 saved changes…"),
    ).toBeInTheDocument();
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
  });

  it("triggers syncNow when Sync Now button is clicked", async () => {
    const syncNowMock = vi.fn().mockResolvedValue({ processed: 1, failed: 0, remaining: 0 });
    const user = userEvent.setup();

    vi.mocked(offlineSync.useOnlineStatus).mockReturnValue({
      isOnline: true,
      queueSize: 1,
      isSyncing: false,
      syncNow: syncNowMock,
    });

    render(<OfflineBanner />);
    const btn = screen.getByRole("button", { name: "Sync now" });
    await user.click(btn);

    expect(syncNowMock).toHaveBeenCalled();
  });
});
