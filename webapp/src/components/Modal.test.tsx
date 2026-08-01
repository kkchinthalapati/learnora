import { describe, expect, it } from "vitest";
import { useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/render";
import { Modal } from "./Modal";
import { Button } from "./Button";

function Harness({
  closeOnOverlayClick = false,
}: {
  closeOnOverlayClick?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete subject"
        subtitle="This can't be undone"
        closeOnOverlayClick={closeOnOverlayClick}
        footer={<Button variant="danger">Delete</Button>}
      >
        <label>
          Reason
          <input name="reason" />
        </label>
      </Modal>
    </>
  );
}

describe("Modal", () => {
  it("renders nothing until opened, then shows its title and content", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open modal" }));

    const dialog = screen.getByRole("dialog", { name: "Delete subject" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("This can't be undone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("moves focus into the dialog on open and back to the trigger on close", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open modal" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    );

    await user.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open modal" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("traps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open modal" }));

    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: "Close" });
    const del = screen.getByRole("button", { name: "Delete" });

    // Opening the modal moves focus on the next animation frame; let that
    // land before driving the keyboard, or it lands mid-test and looks like
    // the trap fired.
    await waitFor(() => expect(close).toHaveFocus());

    del.focus();
    await user.tab();
    // Past the last control, focus wraps back inside rather than escaping to
    // the page behind the overlay.
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(del).toHaveFocus();
  });

  it("locks page scroll while open and releases it on close", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    expect(document.body.style.overflow).toBe("");

    await user.click(screen.getByRole("button", { name: "Open modal" }));
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  it("ignores backdrop clicks by default and honours them when asked", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open modal" }));

    const backdrop = screen.getByRole("dialog").parentElement!;
    await user.click(backdrop);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    unmount();

    renderWithProviders(<Harness closeOnOverlayClick />);
    await user.click(screen.getByRole("button", { name: "Open modal" }));
    await user.click(screen.getByRole("dialog").parentElement!);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});

describe("Modal stacking", () => {
  function NestedHarness() {
    const [outer, setOuter] = useState(false);
    const [inner, setInner] = useState(false);
    return (
      <>
        <Button onClick={() => setOuter(true)}>Open outer</Button>
        <Modal open={outer} onClose={() => setOuter(false)} title="Outer">
          <Button onClick={() => setInner(true)}>Open inner</Button>
        </Modal>
        <Modal open={inner} onClose={() => setInner(false)} title="Inner">
          <p>Inner body</p>
        </Modal>
      </>
    );
  }

  it("Escape closes only the top-most overlay, and scroll stays locked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NestedHarness />);

    await user.click(screen.getByRole("button", { name: "Open outer" }));
    await user.click(screen.getByRole("button", { name: "Open inner" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    expect(screen.getByRole("dialog", { name: "Outer" })).toBeInTheDocument();
    // The outer modal is still open, so the page must not have been unlocked.
    expect(document.body.style.overflow).toBe("hidden");
  });
});
