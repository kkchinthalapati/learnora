import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import { loadSettings } from "../../lib/settings";
import { NotificationsTab } from "./NotificationsTab";

/* jsdom has no Notification API, so each permission state is installed
 * explicitly. `delete` + reassign rather than vi.stubGlobal so the
 * "unsupported" branch — the `!("Notification" in window)` check — can be
 * exercised too. */
function setNotificationPermission(permission: NotificationPermission | null) {
  if (permission === null) {
    Reflect.deleteProperty(window, "Notification");
    return;
  }
  Object.defineProperty(window, "Notification", {
    configurable: true,
    writable: true,
    value: Object.assign(function () {}, {
      permission,
      requestPermission: vi.fn().mockResolvedValue("granted"),
    }),
  });
}

describe("NotificationsTab", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "Notification");
    vi.restoreAllMocks();
  });

  it("offers the permission prompt while it is still undecided", () => {
    setNotificationPermission("default");
    renderWithProviders(<NotificationsTab />);

    expect(screen.getByText("Not enabled yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enable Browser Notifications" }),
    ).toBeInTheDocument();
  });

  it("hides the prompt once permission is granted", () => {
    setNotificationPermission("granted");
    renderWithProviders(<NotificationsTab />);

    expect(screen.getByText("✓ Enabled")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enable Browser Notifications" }),
    ).toBeNull();
  });

  it("explains a denied permission without offering a dead button", () => {
    setNotificationPermission("denied");
    renderWithProviders(<NotificationsTab />);

    expect(
      screen.getByText("Denied. Please enable in your browser settings."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enable Browser Notifications" }),
    ).toBeNull();
  });

  it("says so when the browser has no Notification API at all", () => {
    setNotificationPermission(null);
    renderWithProviders(<NotificationsTab />);

    expect(
      screen.getByText("Your browser does not support notifications."),
    ).toBeInTheDocument();
  });

  it("re-reads the permission after the prompt resolves", async () => {
    const user = userEvent.setup();
    setNotificationPermission("default");
    renderWithProviders(<NotificationsTab />);

    const notification = window.Notification as unknown as {
      permission: NotificationPermission;
      requestPermission: () => Promise<NotificationPermission>;
    };
    notification.requestPermission = vi.fn().mockImplementation(async () => {
      notification.permission = "granted";
      return "granted";
    });

    await user.click(
      screen.getByRole("button", { name: "Enable Browser Notifications" }),
    );

    expect(await screen.findByText("✓ Enabled")).toBeInTheDocument();
  });

  it("names both toggles for assistive tech", () => {
    setNotificationPermission("granted");
    renderWithProviders(<NotificationsTab />);

    /* The vanilla wrapped each checkbox in an empty <label class="toggle-
       switch">, so neither had an accessible name. */
    expect(
      screen.getByRole("switch", { name: "Flashcard Due Reminders" }),
    ).toBeChecked();
    expect(screen.getByRole("switch", { name: "Timer Alerts" })).toBeChecked();
  });

  it("persists each toggle immediately, with no save button", async () => {
    const user = userEvent.setup();
    setNotificationPermission("granted");
    renderWithProviders(<NotificationsTab />);

    await user.click(
      screen.getByRole("switch", { name: "Flashcard Due Reminders" }),
    );

    await waitFor(() =>
      expect(loadSettings().notifyStudyReminders).toBe(false),
    );
    expect(loadSettings().notifyTimerAlerts).toBe(true);
  });

  it("keeps both toggles independent when flipped in turn", async () => {
    const user = userEvent.setup();
    setNotificationPermission("granted");
    renderWithProviders(<NotificationsTab />);

    await user.click(
      screen.getByRole("switch", { name: "Flashcard Due Reminders" }),
    );
    await user.click(screen.getByRole("switch", { name: "Timer Alerts" }));

    await waitFor(() =>
      expect(loadSettings()).toMatchObject({
        notifyStudyReminders: false,
        notifyTimerAlerts: false,
      }),
    );
  });
});
