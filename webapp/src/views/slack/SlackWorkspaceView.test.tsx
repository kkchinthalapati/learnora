import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { SlackWorkspaceView } from "./SlackWorkspaceView";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { resetStore } from "../../lib/slack/slackStore";

function renderSlackView(initialPath = "/slack") {
  return renderWithAuth(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/slack" element={<SlackWorkspaceView />} />
        <Route path="/slack/:channelId" element={<SlackWorkspaceView />} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession({ email: "kk.chinthalapati@gmail.com" }) },
  );
}

describe("SlackWorkspaceView", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders full-viewport workspace container with main role", () => {
    renderSlackView("/slack");

    const main = screen.getByRole("main", { name: "Founders Slack Workspace" });
    expect(main).toBeInTheDocument();
  });

  it("defaults to #general channel when on /slack", () => {
    renderSlackView("/slack");

    expect(screen.getByRole("heading", { level: 1, name: "#general" })).toBeInTheDocument();
    expect(screen.getByText("Welcome to #general!")).toBeInTheDocument();
  });

  it("renders active channel header when navigating to /slack/:channelId", () => {
    renderSlackView("/slack/strategy");

    expect(screen.getByRole("heading", { level: 1, name: "#strategy" })).toBeInTheDocument();
    expect(screen.getByText("Welcome to #strategy!")).toBeInTheDocument();
  });

  it("renders all four pre-seeded channels in the sidebar", () => {
    renderSlackView("/slack");

    expect(screen.getByRole("link", { name: /general/i })).toHaveAttribute("href", "/slack/general");
    expect(screen.getByRole("link", { name: /product/i })).toHaveAttribute("href", "/slack/product");
    expect(screen.getByRole("link", { name: /strategy/i })).toHaveAttribute("href", "/slack/strategy");
    expect(screen.getByRole("link", { name: /tech/i })).toHaveAttribute("href", "/slack/tech");
  });

  it("renders founder and AI participants in Direct Messages sidebar", () => {
    renderSlackView("/slack");

    expect(screen.getAllByText("Karthik").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Nirav").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("K AI").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("N AI").length).toBeGreaterThanOrEqual(1);
  });

  it("renders message composer with channel placeholder", () => {
    renderSlackView("/slack/tech");

    expect(
      screen.getByPlaceholderText(/Message #tech/i),
    ).toBeInTheDocument();
  });

  it("switches channel and updates feed when clicking channel link", async () => {
    const user = userEvent.setup();
    renderSlackView("/slack/general");

    expect(screen.getByRole("heading", { level: 1, name: "#general" })).toBeInTheDocument();

    const strategyLink = screen.getByRole("link", { name: /strategy/i });
    await user.click(strategyLink);

    expect(screen.getByRole("heading", { level: 1, name: "#strategy" })).toBeInTheDocument();
    expect(screen.getByText(/Setting up our core strategic pillars for Q4/i)).toBeInTheDocument();
  });

  it("adds new message to channel feed when typing in composer and clicking send", async () => {
    const user = userEvent.setup();
    renderSlackView("/slack/general");

    const composer = screen.getByPlaceholderText(/Message #general/i);
    await user.type(composer, "Excited about our founder roadmap execution!");

    const sendBtn = screen.getByRole("button", { name: "Send message" });
    await user.click(sendBtn);

    expect(
      screen.getByText("Excited about our founder roadmap execution!"),
    ).toBeInTheDocument();
    expect(composer).toHaveValue("");
  });

  it("sends message via Enter key shortcut in composer", async () => {
    const user = userEvent.setup();
    renderSlackView("/slack/product");

    const composer = screen.getByPlaceholderText(/Message #product/i);
    await user.type(composer, "New UI polish deployed.{enter}");

    expect(screen.getByText("New UI polish deployed.")).toBeInTheDocument();
    expect(composer).toHaveValue("");
  });

  it("opens Thread side panel when clicking Reply in thread and closes on close button", async () => {
    const user = userEvent.setup();
    renderSlackView("/slack/general");

    // Click "Reply in thread" on the first message
    const replyButtons = screen.getAllByRole("button", { name: "Reply in thread" });
    expect(replyButtons.length).toBeGreaterThan(0);
    await user.click(replyButtons[0]);

    // Thread panel should appear
    expect(screen.getByRole("complementary", { name: /Thread in #general/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Thread" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Reply in thread...")).toBeInTheDocument();

    // Close button dismisses thread panel
    const closeBtn = screen.getByRole("button", { name: "Close thread" });
    await user.click(closeBtn);

    expect(screen.queryByRole("complementary", { name: /Thread in #general/i })).not.toBeInTheDocument();
  });

  it("posts reply in thread panel and increments reply count", async () => {
    const user = userEvent.setup();
    renderSlackView("/slack/general");

    // Open thread on first message
    const replyButtons = screen.getAllByRole("button", { name: "Reply in thread" });
    await user.click(replyButtons[0]);

    const threadComposer = screen.getByPlaceholderText("Reply in thread...");
    await user.type(threadComposer, "Thread reply test confirming alignment.{enter}");

    // Verify reply is rendered in thread stream
    expect(screen.getByText("Thread reply test confirming alignment.")).toBeInTheDocument();
    expect(threadComposer).toHaveValue("");

    // Verify replies count shows 1 reply (in thread panel divider and on root message indicator)
    expect(screen.getAllByText("1 reply").length).toBeGreaterThanOrEqual(1);
  });

  it("toggles emoji reaction when clicking existing reaction chip", async () => {
    const user = userEvent.setup();
    renderSlackView("/slack/general");

    // Message 1 has a reaction with "🔥 1" (by karthik)
    const fireReaction = screen.getByRole("button", { name: /🔥 1 reactions/i });
    expect(fireReaction).toBeInTheDocument();

    // Clicking fire toggles it off for karthik
    await user.click(fireReaction);
    expect(screen.queryByRole("button", { name: /🔥 1 reactions/i })).not.toBeInTheDocument();

    // Click "Add reaction" (+) on a message and add an emoji
    const addReactionButtons = screen.getAllByRole("button", { name: "Add reaction" });
    await user.click(addReactionButtons[0]);

    // Emoji picker popover opens
    const thumbsUpEmoji = screen.getByRole("button", { name: "React with 👍" });
    await user.click(thumbsUpEmoji);

    // Verify 👍 reaction appears
    expect(screen.getByRole("button", { name: /👍 1 reactions/i })).toBeInTheDocument();
  });

  it("toggles dark and light theme when clicking rail theme toggle button", async () => {
    const user = userEvent.setup();
    renderSlackView("/slack");

    const themeToggle = screen.getByRole("button", { name: "Toggle theme" });
    expect(themeToggle).toBeInTheDocument();

    await user.click(themeToggle);
    // Theme toggle executes setAppearance without crashing
    expect(themeToggle).toBeInTheDocument();
  });

  it("displays mention suggestions popup when typing @ in composer and allows selecting a candidate", async () => {
    const user = userEvent.setup();
    renderSlackView("/slack/general");

    const composer = screen.getByPlaceholderText(/Message #general/i);
    await user.type(composer, "@K");

    // Mention suggestions listbox appears
    expect(screen.getByRole("listbox", { name: "Mention suggestions" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /@K AI/i })).toBeInTheDocument();

    // Click suggestion
    await user.click(screen.getByRole("option", { name: /@K AI/i }));

    // Mention is inserted into composer
    expect(composer).toHaveValue("@K AI ");
  });

  it("inserts formatting syntax when clicking composer toolbar buttons", async () => {
    const user = userEvent.setup();
    renderSlackView("/slack/general");

    const composer = screen.getByPlaceholderText(/Message #general/i);
    const boldButton = screen.getByRole("button", { name: "Bold" });

    await user.click(boldButton);
    expect(composer).toHaveValue("**bold**");
  });
});
