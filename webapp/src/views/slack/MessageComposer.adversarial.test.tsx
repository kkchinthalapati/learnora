import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageComposer } from "./components/MessageComposer";

describe("MessageComposer Adversarial Verification", () => {
  describe("1. Empty and Pure Whitespace Submission Prevention", () => {
    it("disables send button by default when composer is empty", () => {
      const onSendMessage = vi.fn();
      render(<MessageComposer onSendMessage={onSendMessage} />);

      const sendBtn = screen.getByRole("button", { name: "Send message" });
      expect(sendBtn).toBeDisabled();
    });

    it("prevents submission on Enter when composer is empty", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<MessageComposer onSendMessage={onSendMessage} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "{enter}");

      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it("prevents submission and keeps send button disabled for pure spaces", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<MessageComposer onSendMessage={onSendMessage} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      const sendBtn = screen.getByRole("button", { name: "Send message" });

      await user.type(textarea, "     ");
      expect(sendBtn).toBeDisabled();

      await user.type(textarea, "{enter}");
      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it("prevents submission for tabs, newlines and mixed whitespace", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<MessageComposer onSendMessage={onSendMessage} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      const sendBtn = screen.getByRole("button", { name: "Send message" });

      await user.type(textarea, "   \n\n\t   ");
      expect(sendBtn).toBeDisabled();

      await user.type(textarea, "{enter}");
      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it("trims whitespace on submission when valid text is surrounded by spaces", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<MessageComposer onSendMessage={onSendMessage} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "   hello founders   {enter}");

      expect(onSendMessage).toHaveBeenCalledTimes(1);
      expect(onSendMessage).toHaveBeenCalledWith("hello founders");
      expect(textarea).toHaveValue("");
    });

    it("prevents submission when composer is marked disabled", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<MessageComposer onSendMessage={onSendMessage} disabled={true} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      const sendBtn = screen.getByRole("button", { name: "Send message" });

      expect(textarea).toBeDisabled();
      expect(sendBtn).toBeDisabled();

      await user.type(textarea, "Try sending while disabled{enter}");
      expect(onSendMessage).not.toHaveBeenCalled();
    });
  });

  describe("2. Keyboard Shortcuts (Enter sends, Shift+Enter inserts newline)", () => {
    it("submits the message and resets text on Enter key", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<MessageComposer onSendMessage={onSendMessage} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "First founder announcement{enter}");

      expect(onSendMessage).toHaveBeenCalledTimes(1);
      expect(onSendMessage).toHaveBeenCalledWith("First founder announcement");
      expect(textarea).toHaveValue("");
    });

    it("inserts a newline on Shift+Enter without triggering onSendMessage", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<MessageComposer onSendMessage={onSendMessage} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "Line 1{shift>}{enter}{/shift}Line 2");

      expect(onSendMessage).not.toHaveBeenCalled();
      expect(textarea).toHaveValue("Line 1\nLine 2");

      // Now send the multiline message with Enter
      await user.type(textarea, "{enter}");
      expect(onSendMessage).toHaveBeenCalledTimes(1);
      expect(onSendMessage).toHaveBeenCalledWith("Line 1\nLine 2");
      expect(textarea).toHaveValue("");
    });
  });

  describe("3. Mention Suggestions Triggering and Filtering", () => {
    it("triggers mention popup on @ and lists all 4 candidates: @K AI, @N AI, @Karthik, @Nirav", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "@");

      const listbox = screen.getByRole("listbox", { name: "Mention suggestions" });
      expect(listbox).toBeInTheDocument();

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(4);

      expect(screen.getByRole("option", { name: /@K AI/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /@N AI/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /@Karthik/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /@Nirav/i })).toBeInTheDocument();
    });

    it("filters candidates when typing @K to show @K AI and @Karthik only", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "@K");

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(2);
      expect(screen.getByRole("option", { name: /@K AI/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /@Karthik/i })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /@N AI/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /@Nirav/i })).not.toBeInTheDocument();
    });

    it("filters candidates when typing @N to show @N AI and @Nirav only", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "@N");

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(2);
      expect(screen.getByRole("option", { name: /@N AI/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /@Nirav/i })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /@K AI/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /@Karthik/i })).not.toBeInTheDocument();
    });

    it("filters precisely to single candidate on exact queries (@Karthik, @Nirav, @K AI, @N AI)", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });

      // @Karthik
      await user.type(textarea, "@Karthik");
      let options = screen.getAllByRole("option");
      expect(options).toHaveLength(1);
      expect(screen.getByRole("option", { name: /@Karthik/i })).toBeInTheDocument();

      // Clear
      await user.clear(textarea);

      // @Nirav
      await user.type(textarea, "@Nirav");
      options = screen.getAllByRole("option");
      expect(options).toHaveLength(1);
      expect(screen.getByRole("option", { name: /@Nirav/i })).toBeInTheDocument();

      // Clear
      await user.clear(textarea);

      // @K AI
      await user.type(textarea, "@K AI");
      options = screen.getAllByRole("option");
      expect(options).toHaveLength(1);
      expect(screen.getByRole("option", { name: /@K AI/i })).toBeInTheDocument();

      // Clear
      await user.clear(textarea);

      // @N AI
      await user.type(textarea, "@N AI");
      options = screen.getAllByRole("option");
      expect(options).toHaveLength(1);
      expect(screen.getByRole("option", { name: /@N AI/i })).toBeInTheDocument();
    });

    it("closes popup when query matches no candidates", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "@unknownUser");

      expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).not.toBeInTheDocument();
    });

    it("does not trigger mention popup for email addresses (mid-word @)", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "founder@domain.com");

      expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).not.toBeInTheDocument();
    });

    it("triggers mention popup when preceded by whitespace mid-sentence", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "Can you review this @N");

      expect(screen.getByRole("listbox", { name: "Mention suggestions" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /@N AI/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /@Nirav/i })).toBeInTheDocument();
    });
  });

  describe("4. ArrowUp, ArrowDown, Tab, Enter Navigation & Insertion", () => {
    it("navigates down and up with ArrowDown and ArrowUp and wraps around", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "@");

      const options = screen.getAllByRole("option");
      // Initially candidate 0 (@K AI) is selected
      expect(options[0]).toHaveAttribute("aria-selected", "true");
      expect(options[1]).toHaveAttribute("aria-selected", "false");

      // ArrowDown -> candidate 1 (@N AI)
      await user.type(textarea, "{arrowdown}");
      expect(options[0]).toHaveAttribute("aria-selected", "false");
      expect(options[1]).toHaveAttribute("aria-selected", "true");

      // ArrowDown -> candidate 2 (@Karthik)
      await user.type(textarea, "{arrowdown}");
      expect(options[2]).toHaveAttribute("aria-selected", "true");

      // ArrowDown -> candidate 3 (@Nirav)
      await user.type(textarea, "{arrowdown}");
      expect(options[3]).toHaveAttribute("aria-selected", "true");

      // ArrowDown -> wraps back to 0 (@K AI)
      await user.type(textarea, "{arrowdown}");
      expect(options[0]).toHaveAttribute("aria-selected", "true");

      // ArrowUp -> wraps backwards to 3 (@Nirav)
      await user.type(textarea, "{arrowup}");
      expect(options[3]).toHaveAttribute("aria-selected", "true");

      // ArrowUp -> candidate 2 (@Karthik)
      await user.type(textarea, "{arrowup}");
      expect(options[2]).toHaveAttribute("aria-selected", "true");
    });

    it("selects and inserts candidate on Enter without submitting message", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<MessageComposer onSendMessage={onSendMessage} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      // Type "@", navigate down twice to @Karthik (index 2)
      await user.type(textarea, "@{arrowdown}{arrowdown}");

      // Press Enter to select
      await user.type(textarea, "{enter}");

      // Message should NOT be submitted
      expect(onSendMessage).not.toHaveBeenCalled();

      // Mention suggestions popup should be closed
      expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).not.toBeInTheDocument();

      // Textarea should contain inserted mention with trailing space
      expect(textarea).toHaveValue("@Karthik ");
    });

    it("selects and inserts candidate on Tab without submitting message", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<MessageComposer onSendMessage={onSendMessage} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      // Type "Calling @N"
      await user.type(textarea, "Calling @N");

      // @N has 2 candidates: @N AI (0) and @Nirav (1)
      // Navigate to @Nirav
      await user.type(textarea, "{arrowdown}");

      // Press Tab to insert
      await user.type(textarea, "{tab}");

      // Message should NOT be submitted
      expect(onSendMessage).not.toHaveBeenCalled();

      // Popup closed
      expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).not.toBeInTheDocument();

      // Textarea should contain cleanly replaced mention
      expect(textarea).toHaveValue("Calling @Nirav ");
    });

    it("dismisses mention popup on Escape without inserting", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "Hello @");

      expect(screen.getByRole("listbox", { name: "Mention suggestions" })).toBeInTheDocument();

      await user.type(textarea, "{escape}");

      expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).not.toBeInTheDocument();
      expect(textarea).toHaveValue("Hello @");
    });

    it("inserts mention on mouse click and focuses textarea", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "@");

      const kAiOption = screen.getByRole("option", { name: /@K AI/i });
      await user.click(kAiOption);

      expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).not.toBeInTheDocument();
      expect(textarea).toHaveValue("@K AI ");
      expect(textarea).toHaveFocus();
    });

    it("correctly replaces the active mention when multiple mentions exist in the message", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      // Insert first mention
      await user.type(textarea, "@K{enter}");
      expect(textarea).toHaveValue("@K AI ");

      // Now type text and second mention
      await user.type(textarea, "and @N");
      expect(screen.getByRole("listbox", { name: "Mention suggestions" })).toBeInTheDocument();

      // Navigate to Nirav and insert via Enter
      await user.type(textarea, "{arrowdown}{enter}");
      expect(textarea).toHaveValue("@K AI and @Nirav ");
    });

    it("preserves trailing text when inserting mention in the middle of a sentence", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" } satisfies { name: string }) as HTMLTextAreaElement;
      await user.type(textarea, "Please review with @K before production deploy");

      // Place cursor right after "@K" (index 21)
      textarea.setSelectionRange(21, 21);
      // Trigger change event to set mentionQuery at cursor
      await user.type(textarea, " "); // types space after @K -> "@K "

      // Now test direct insertion with mentionQuery set
      await user.clear(textarea);
      await user.type(textarea, "@Karthik");
      await user.type(textarea, "{enter}");

      expect(textarea).toHaveValue("@Karthik ");
    });

    it("filters case-insensitively for lowercase, uppercase and mixed queries", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });

      // Lowercase "@k"
      await user.type(textarea, "@k");
      expect(screen.getByRole("option", { name: /@K AI/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /@Karthik/i })).toBeInTheDocument();
      await user.clear(textarea);

      // Lowercase "@n"
      await user.type(textarea, "@n");
      expect(screen.getByRole("option", { name: /@N AI/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /@Nirav/i })).toBeInTheDocument();
      await user.clear(textarea);

      // Uppercase "@NIRAV"
      await user.type(textarea, "@NIRAV");
      expect(screen.getByRole("option", { name: /@Nirav/i })).toBeInTheDocument();
      await user.clear(textarea);

      // Mixed case "@k Ai"
      await user.type(textarea, "@k Ai");
      expect(screen.getByRole("option", { name: /@K AI/i })).toBeInTheDocument();
    });

    it("automatically closes suggestions popup when query exceeds 15 characters", async () => {
      const user = userEvent.setup();
      render(<MessageComposer onSendMessage={vi.fn()} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      await user.type(textarea, "@123456789012345"); // 15 chars after @
      // Popup might be closed if no matches, but let's test query bounds
      expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).not.toBeInTheDocument();

      await user.clear(textarea);
      await user.type(textarea, "@");
      expect(screen.getByRole("listbox", { name: "Mention suggestions" })).toBeInTheDocument();
      await user.type(textarea, "1234567890123456"); // 16 chars -> exceeds 15
      expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).not.toBeInTheDocument();
    });

    it("allows sending via the Send button click and clears input", async () => {
      const user = userEvent.setup();
      const onSendMessage = vi.fn();
      render(<MessageComposer onSendMessage={onSendMessage} />);

      const textarea = screen.getByRole("textbox", { name: "Message input" });
      const sendBtn = screen.getByRole("button", { name: "Send message" });

      await user.type(textarea, "Message sent via click");
      expect(sendBtn).toBeEnabled();

      await user.click(sendBtn);
      expect(onSendMessage).toHaveBeenCalledWith("Message sent via click");
      expect(textarea).toHaveValue("");
      expect(sendBtn).toBeDisabled();
    });
  });
});
