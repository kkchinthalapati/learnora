import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { REMINDER_OFFER_KEY, ReminderOffer } from "./ReminderOffer";

const push = vi.hoisted(() => ({
  status: "unsubscribed" as string,
  pending: false,
  error: null as string | null,
  enable: vi.fn(),
}));
vi.mock("../../hooks/usePush", () => ({ usePush: () => push }));
vi.mock("../../lib/push", () => ({ isPushSupported: () => true }));

const PREFS = `${SUPABASE_URL}/rest/v1/email_notification_prefs`;
const LEAD = "Your osmosis cards come back tomorrow.";

describe("ReminderOffer", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
    push.status = "unsubscribed";
    push.error = null;
    push.enable.mockReset();
    vi.stubGlobal("Notification", { permission: "default" });
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "test-vapid-key");
    vi.stubEnv("VITE_EMAIL_REMINDERS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("offers push with what comes back, and confirms once the device is subscribed", async () => {
    push.enable.mockImplementation(() => {
      push.status = "subscribed";
    });
    const user = userEvent.setup();
    const { rerender } = render(<ReminderOffer lead={LEAD} />);
    expect(screen.getByText(/Your osmosis cards come back tomorrow\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Email me" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remind me on this device" }));
    expect(push.enable).toHaveBeenCalledWith("test-vapid-key");
    rerender(<ReminderOffer lead={LEAD} />);
    expect(await screen.findByText("Reminders are on for this device.")).toBeInTheDocument();
  });

  it("shows nothing on a device that already has reminders, or where they were refused", () => {
    push.status = "subscribed";
    const { container, unmount } = render(<ReminderOffer lead={LEAD} />);
    expect(container).toBeEmptyDOMElement();
    unmount();

    push.status = "unsubscribed";
    vi.stubGlobal("Notification", { permission: "denied" });
    expect(render(<ReminderOffer lead={LEAD} />).container).toBeEmptyDOMElement();
  });

  it("takes no for an answer for a fortnight", async () => {
    const user = userEvent.setup();
    const { container } = render(<ReminderOffer lead={LEAD} />);
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(container).toBeEmptyDOMElement();
    const until = JSON.parse(localStorage.getItem(REMINDER_OFFER_KEY) ?? "0") as number;
    expect(until - Date.now()).toBeGreaterThan(13 * 86_400_000);
  });

  it("offers email only when sending is configured, and saving it never happens on read", async () => {
    vi.stubEnv("VITE_EMAIL_REMINDERS", "true");
    const writes: unknown[] = [];
    server.use(
      http.get(PREFS, () => HttpResponse.json(null)),
      http.post(PREFS, async ({ request }) => {
        writes.push(await request.json());
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    render(<ReminderOffer lead={LEAD} />);
    await user.click(await screen.findByRole("button", { name: "Email me" }));
    expect(await screen.findByText("We'll email you.")).toBeInTheDocument();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ user_id: "user-1", notify_flashcards_due: true });
  });

  it("stays out of the way when email reminders are already on", async () => {
    vi.stubEnv("VITE_EMAIL_REMINDERS", "true");
    push.status = "unsupported";
    server.use(
      http.get(PREFS, () =>
        HttpResponse.json({ notify_exams: true, notify_flashcards_due: true, notify_weekly_digest: false }),
      ),
    );
    const { container } = render(<ReminderOffer lead={LEAD} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
