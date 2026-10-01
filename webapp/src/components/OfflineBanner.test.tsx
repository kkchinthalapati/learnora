import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { OfflineBanner, OfflinePageNotice } from "./OfflineBanner";
import * as offlineSync from "../lib/offlineSync";

vi.mock("../lib/offlineSync", () => ({
  useOnlineStatus: vi.fn(),
}));

function status(
  overrides: Partial<ReturnType<typeof offlineSync.useOnlineStatus>> = {},
) {
  vi.mocked(offlineSync.useOnlineStatus).mockReturnValue({
    isOnline: true,
    queueSize: 0,
    reviewsQueued: 0,
    isSyncing: false,
    syncNow: vi.fn(),
    ...overrides,
  });
}

function renderAt(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OfflineBanner />
    </MemoryRouter>,
  );
}

describe("OfflineBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when online, not syncing, and queue is empty", () => {
    status();
    const { container } = renderAt();
    expect(container.firstChild).toBeNull();
  });

  it("says flashcard review still works offline, and offers the way in", () => {
    status({ isOnline: false });
    renderAt("/library");

    expect(
      screen.getByText("Offline · flashcard review still works"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review cards" })).toHaveAttribute(
      "href",
      "/review/daily-drill",
    );
    /* No Sync now button while offline: pressing it can only fail, and the
       message already promises the work syncs on reconnect. */
    expect(
      screen.queryByRole("button", { name: "Sync now" }),
    ).not.toBeInTheDocument();
  });

  it("counts reviews waiting to sync while offline", () => {
    status({ isOnline: false, queueSize: 3, reviewsQueued: 3 });
    renderAt("/library");
    expect(
      screen.getByText("Offline · 3 reviews waiting to sync"),
    ).toBeInTheDocument();
  });

  it("does not offer Review cards on a review screen", () => {
    status({ isOnline: false, queueSize: 1, reviewsQueued: 1 });
    renderAt("/review/deck-1");
    expect(screen.getByText("Offline · 1 review waiting to sync")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review cards" })).not.toBeInTheDocument();
  });

  it("offers Sync now once the connection is back and changes are still queued", () => {
    status({ queueSize: 3, reviewsQueued: 2 });
    renderAt();
    expect(
      screen.getByText("2 reviews and 1 change waiting to sync"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sync now" }),
    ).toBeInTheDocument();
  });

  it("shows syncing message when active sync is in progress", () => {
    status({ queueSize: 3, isSyncing: true });
    renderAt();
    expect(screen.getByText("Syncing 3 changes…")).toBeInTheDocument();
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
  });

  it("triggers syncNow when Sync Now button is clicked", async () => {
    const syncNowMock = vi
      .fn()
      .mockResolvedValue({ processed: 1, failed: 0, remaining: 0 });
    const user = userEvent.setup();
    status({ queueSize: 1, reviewsQueued: 1, syncNow: syncNowMock });

    renderAt();
    const btn = screen.getByRole("button", { name: "Sync now" });
    await user.click(btn);

    expect(syncNowMock).toHaveBeenCalled();
  });

  describe("OfflinePageNotice", () => {
    it("explains an offline page and points to what still works", () => {
      status({ isOnline: false });
      render(
        <MemoryRouter initialEntries={["/analytics"]}>
          <OfflinePageNotice />
        </MemoryRouter>,
      );
      expect(screen.getByText(/this page can't load anything new until you reconnect/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "review your saved cards" })).toHaveAttribute(
        "href",
        "/review/daily-drill",
      );
    });

    it("stays out of the way online and on review screens", () => {
      status({ isOnline: true });
      const online = render(
        <MemoryRouter initialEntries={["/analytics"]}>
          <OfflinePageNotice />
        </MemoryRouter>,
      );
      expect(online.container.firstChild).toBeNull();
      online.unmount();

      status({ isOnline: false });
      const review = render(
        <MemoryRouter initialEntries={["/review/d-1"]}>
          <OfflinePageNotice />
        </MemoryRouter>,
      );
      expect(review.container.firstChild).toBeNull();
    });
  });
});
