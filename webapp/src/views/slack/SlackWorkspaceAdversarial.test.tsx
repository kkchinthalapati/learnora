import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { SlackWorkspaceView } from "./SlackWorkspaceView";
import { fakeSession, renderWithAuth } from "../../test/auth";
import {
  resetStore,
  getChannelMessages,
  getThreadReplies,
} from "../../lib/slack/slackStore";

function renderSlackView(initialPath = "/slack") {
  return renderWithAuth(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/slack" element={<SlackWorkspaceView />} />
        <Route path="/slack/:channelId" element={<SlackWorkspaceView />} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession({ id: "karthik", email: "kk.chinthalapati@gmail.com" }) },
  );
}

describe("Adversarial Milestone 2 Probes", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("Probe 1: Thread Side Panel & Parent Message Pinning", () => {
    it("pins the exact parent message with all attributes and omits nested thread reply actions", async () => {
      const user = userEvent.setup();
      renderSlackView("/slack/general");

      // Locate all "Reply in thread" buttons in general channel
      const replyButtons = screen.getAllByRole("button", { name: "Reply in thread" });
      expect(replyButtons.length).toBeGreaterThan(0);

      // Open thread on message 1 (Karthik's welcome message)
      await user.click(replyButtons[0]);

      const threadPanel = screen.getByRole("complementary", { name: /Thread in #general/i });
      expect(threadPanel).toBeInTheDocument();

      // The thread panel header
      expect(within(threadPanel).getByRole("heading", { level: 3, name: "Thread" })).toBeInTheDocument();
      expect(within(threadPanel).getByText("#general")).toBeInTheDocument();

      // Pinned parent card should contain the exact root message content
      const pinnedText = "Welcome to our personal founders' Slack! 🚀";
      expect(within(threadPanel).getByText(new RegExp(pinnedText, "i"))).toBeInTheDocument();

      // Pinned root message author header
      expect(within(threadPanel).getByText("Karthik")).toBeInTheDocument();
      expect(within(threadPanel).getByText("Founder")).toBeInTheDocument();

      // Pinned root message reactions should be present
      expect(within(threadPanel).getByRole("button", { name: /🚀 2 reactions/i })).toBeInTheDocument();
      expect(within(threadPanel).getByRole("button", { name: /🔥 1 reactions/i })).toBeInTheDocument();

      // Pinned root message MUST NOT have a nested "Reply in thread" action button
      const pinnedCard = threadPanel.querySelector("[class*='threadPinnedRootCard']");
      expect(pinnedCard).not.toBeNull();
      if (pinnedCard) {
        const nestedReplyBtn = within(pinnedCard as HTMLElement).queryByRole("button", {
          name: "Reply in thread",
        });
        expect(nestedReplyBtn).toBeNull();
      }
    });

    it("switches pinned parent cleanly when clicking Reply in thread on a different message", async () => {
      const user = userEvent.setup();
      renderSlackView("/slack/general");

      const replyButtons = screen.getAllByRole("button", { name: "Reply in thread" });
      expect(replyButtons.length).toBeGreaterThanOrEqual(2);

      // Open message 1
      await user.click(replyButtons[0]);
      let threadPanel = screen.getByRole("complementary", { name: /Thread in #general/i });
      expect(within(threadPanel).getByText(/Welcome to our personal founders' Slack/i)).toBeInTheDocument();

      // Click reply on message 2 (Nirav's message) in the main channel feed
      await user.click(replyButtons[1]);
      threadPanel = screen.getByRole("complementary", { name: /Thread in #general/i });

      // Pinned message should now be Nirav's message
      expect(within(threadPanel).getByText(/Great to have this up/i)).toBeInTheDocument();
      expect(within(threadPanel).queryByText(/Welcome to our personal founders' Slack/i)).toBeNull();
    });

    it("closes thread panel when close button is clicked", async () => {
      const user = userEvent.setup();
      renderSlackView("/slack/general");

      const replyButtons = screen.getAllByRole("button", { name: "Reply in thread" });
      await user.click(replyButtons[0]);

      expect(screen.getByRole("complementary", { name: /Thread in #general/i })).toBeInTheDocument();

      const closeBtn = screen.getByRole("button", { name: "Close thread" });
      await user.click(closeBtn);

      expect(screen.queryByRole("complementary", { name: /Thread in #general/i })).toBeNull();
    });
  });

  describe("Probe 2: Thread Reply Isolation & No Leakage into Channel Feed", () => {
    it("posts reply strictly inside thread panel stream and does NOT leak into main channel feed", async () => {
      const user = userEvent.setup();
      renderSlackView("/slack/general");

      // Open thread on message 1
      const replyButtons = screen.getAllByRole("button", { name: "Reply in thread" });
      await user.click(replyButtons[0]);

      const threadPanel = screen.getByRole("complementary", { name: /Thread in #general/i });
      const mainFeed = screen.getByRole("main").querySelector("[class*='mainFeed']");
      expect(mainFeed).not.toBeNull();

      const uniqueReplyText = "ISOLATED_THREAD_REPLY_STRESS_99812";

      // Type and send in thread composer
      const threadComposer = within(threadPanel).getByPlaceholderText("Reply in thread...");
      await user.type(threadComposer, `${uniqueReplyText}{enter}`);

      // 1. Reply must be present inside thread panel
      expect(within(threadPanel).getByText(uniqueReplyText)).toBeInTheDocument();

      // 2. Reply MUST NOT leak into main feed container
      if (mainFeed) {
        expect(within(mainFeed as HTMLElement).queryByText(uniqueReplyText)).toBeNull();
      }

      // 3. Verify in store state
      const channelMessages = getChannelMessages("general");
      const foundInChannel = channelMessages.some((m) => m.content === uniqueReplyText);
      expect(foundInChannel).toBe(false);

      const threadReplies = getThreadReplies("msg-gen-1");
      const foundInThread = threadReplies.some((m) => m.content === uniqueReplyText);
      expect(foundInThread).toBe(true);

      // 4. Verify parent message reply indicator is updated
      expect(screen.getAllByText(/1 reply/i).length).toBeGreaterThanOrEqual(1);
    });

    it("keeps replies separated across multiple threads", async () => {
      const user = userEvent.setup();
      renderSlackView("/slack/general");

      const replyButtons = screen.getAllByRole("button", { name: "Reply in thread" });

      // Post in thread 1
      await user.click(replyButtons[0]);
      let threadPanel = screen.getByRole("complementary", { name: /Thread in #general/i });
      const threadComposer1 = within(threadPanel).getByPlaceholderText("Reply in thread...");
      await user.type(threadComposer1, "Reply_For_Thread_1{enter}");
      expect(within(threadPanel).getByText("Reply_For_Thread_1")).toBeInTheDocument();

      // Open thread 2
      await user.click(replyButtons[1]);
      threadPanel = screen.getByRole("complementary", { name: /Thread in #general/i });
      const threadComposer2 = within(threadPanel).getByPlaceholderText("Reply in thread...");
      await user.type(threadComposer2, "Reply_For_Thread_2{enter}");

      // In thread 2, Reply_For_Thread_2 is visible, Reply_For_Thread_1 is NOT visible
      expect(within(threadPanel).getByText("Reply_For_Thread_2")).toBeInTheDocument();
      expect(within(threadPanel).queryByText("Reply_For_Thread_1")).toBeNull();

      // Switch back to thread 1
      await user.click(replyButtons[0]);
      threadPanel = screen.getByRole("complementary", { name: /Thread in #general/i });
      expect(within(threadPanel).getByText("Reply_For_Thread_1")).toBeInTheDocument();
      expect(within(threadPanel).queryByText("Reply_For_Thread_2")).toBeNull();
    });
  });

  describe("Probe 3: Emoji Reactions Toggle & Immediate DOM Reactivity", () => {
    it("toggles reaction off when active user clicks an existing chip, removing chip if count is 0", async () => {
      const user = userEvent.setup();
      renderSlackView("/slack/general");

      // msg-gen-1 has "🔥 1" by karthik (current user)
      const fireChip = screen.getByRole("button", { name: "🔥 1 reactions" });
      expect(fireChip).toBeInTheDocument();

      // Click to toggle off
      await user.click(fireChip);

      // Count is now 0 so chip must be removed from DOM immediately
      expect(screen.queryByRole("button", { name: "🔥 1 reactions" })).toBeNull();
      const el = screen.queryByText("🔥");
      if (el) {
        console.log("MATCHED FIRE ELEMENT:", el.outerHTML, "PARENT:", el.parentElement?.outerHTML);
      }
      expect(screen.queryByRole("button", { name: /🔥/i })).toBeNull();
    });

    it("increments and decrements reaction counts accurately on existing multi-user reaction chips", async () => {
      const user = userEvent.setup();
      renderSlackView("/slack/general");

      // msg-gen-1 has "🚀 2" (by nirav, agent-k) - karthik has NOT reacted yet
      const rocketChip = screen.getByRole("button", { name: "🚀 2 reactions" });
      expect(rocketChip).toBeInTheDocument();

      // Click to add reaction for karthik
      await user.click(rocketChip);

      // Count should immediately become 3
      const rocketChipActive = screen.getByRole("button", { name: "🚀 3 reactions" });
      expect(rocketChipActive).toBeInTheDocument();

      // Click again to remove reaction for karthik
      await user.click(rocketChipActive);

      // Count should immediately return to 2
      expect(screen.getByRole("button", { name: "🚀 2 reactions" })).toBeInTheDocument();
    });

    it("handles rapid sequential reaction clicks deterministically without desync", async () => {
      const user = userEvent.setup();
      renderSlackView("/slack/general");

      const rocketChip = screen.getByRole("button", { name: "🚀 2 reactions" });

      // 4 rapid toggles: 2 -> 3 -> 2 -> 3 -> 2
      await user.click(rocketChip);
      expect(screen.getByRole("button", { name: "🚀 3 reactions" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "🚀 3 reactions" }));
      expect(screen.getByRole("button", { name: "🚀 2 reactions" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "🚀 2 reactions" }));
      expect(screen.getByRole("button", { name: "🚀 3 reactions" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "🚀 3 reactions" }));
      expect(screen.getByRole("button", { name: "🚀 2 reactions" })).toBeInTheDocument();
    });

    it("adds a new reaction from the EmojiPicker and renders it immediately in DOM", async () => {
      const user = userEvent.setup();
      renderSlackView("/slack/general");

      // Open emoji picker on message 2 (which has 💯 2)
      const addReactionButtons = screen.getAllByRole("button", { name: "Add reaction" });
      await user.click(addReactionButtons[0]);

      // Popover should be open
      expect(screen.getByRole("dialog", { name: "Reaction picker" })).toBeInTheDocument();

      // Pick "🎉"
      const partyEmoji = screen.getByRole("button", { name: "React with 🎉" });
      await user.click(partyEmoji);

      // Popover should close
      expect(screen.queryByRole("dialog", { name: "Reaction picker" })).toBeNull();

      // 🎉 1 should appear immediately
      expect(screen.getByRole("button", { name: "🎉 1 reactions" })).toBeInTheDocument();
    });

    it("reacts to pinned parent message inside thread panel and synchronizes with main feed", async () => {
      const user = userEvent.setup();
      renderSlackView("/slack/general");

      // Open thread on message 1
      const replyButtons = screen.getAllByRole("button", { name: "Reply in thread" });
      await user.click(replyButtons[0]);

      const threadPanel = screen.getByRole("complementary", { name: /Thread in #general/i });
      const pinnedCard = threadPanel.querySelector("[class*='threadPinnedRootCard']");
      expect(pinnedCard).not.toBeNull();

      // Find "🚀 2 reactions" inside pinnedCard
      const rocketInThread = within(pinnedCard as HTMLElement).getByRole("button", {
        name: "🚀 2 reactions",
      });
      await user.click(rocketInThread);

      // Both pinnedCard and main feed should now show "🚀 3 reactions"
      const allRocket3 = screen.getAllByRole("button", { name: "🚀 3 reactions" });
      expect(allRocket3.length).toBe(2); // One in main feed, one in pinned card
    });
  });

  describe("Probe 4: Theme Switching & Body Class / Layout Stability", () => {
    it("toggles body.dark-theme class and theme toggle button icon between dark and light", async () => {
      const user = userEvent.setup();
      renderSlackView("/slack");

      const themeToggle = screen.getByRole("button", { name: "Toggle theme" });
      expect(themeToggle).toBeInTheDocument();

      const initialHasDark = document.body.classList.contains("dark-theme");

      // Click to toggle
      await user.click(themeToggle);

      // Class on body must have flipped
      const flippedHasDark = document.body.classList.contains("dark-theme");
      expect(flippedHasDark).toBe(!initialHasDark);

      // Click again to toggle back
      await user.click(themeToggle);
      expect(document.body.classList.contains("dark-theme")).toBe(initialHasDark);
    });

    it("maintains structural layout integrity across theme switches", async () => {
      const user = userEvent.setup();
      renderSlackView("/slack/general");

      const workspace = screen.getByRole("main", { name: "Founders Slack Workspace" });
      expect(workspace).toBeInTheDocument();

      const rail = screen.getByRole("navigation", { name: "Workspaces" });
      expect(rail).toBeInTheDocument();

      const sidebar = workspace.querySelector("[class*='sidebar']");
      expect(sidebar).toBeInTheDocument();

      const mainFeed = workspace.querySelector("[class*='mainFeed']");
      expect(mainFeed).toBeInTheDocument();

      // Toggle theme to light
      const themeToggle = screen.getByRole("button", { name: "Toggle theme" });
      await user.click(themeToggle);

      // Workspace remains intact
      expect(workspace).toBeInTheDocument();
      expect(rail).toBeInTheDocument();
      expect(sidebar).toBeInTheDocument();
      expect(mainFeed).toBeInTheDocument();

      // Open thread in light theme
      const replyButtons = screen.getAllByRole("button", { name: "Reply in thread" });
      await user.click(replyButtons[0]);

      const threadPanel = screen.getByRole("complementary", { name: /Thread in #general/i });
      expect(threadPanel).toBeInTheDocument();

      // Toggle back to dark theme with thread panel open
      await user.click(themeToggle);

      // Both mainFeed and threadPanel remain intact
      expect(threadPanel).toBeInTheDocument();
      expect(mainFeed).toBeInTheDocument();
    });
  });
});
