import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/render";
import { Button } from "../components/Button";
import { useDialog } from "./dialog";

function Harness({ onResult }: { onResult: (value: unknown) => void }) {
  const { confirm, promptText } = useDialog();
  return (
    <>
      <Button
        onClick={async () =>
          onResult(
            await confirm("Delete this subject?", {
              title: "Delete subject",
              confirmText: "Delete",
              danger: true,
            }),
          )
        }
      >
        Ask confirm
      </Button>
      <Button
        onClick={async () =>
          onResult(
            await promptText("Name your new folder", { defaultValue: "" }),
          )
        }
      >
        Ask prompt
      </Button>
    </>
  );
}

describe("confirm dialog", () => {
  it("resolves true when confirmed", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderWithProviders(<Harness onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Ask confirm" }));
    expect(
      screen.getByRole("alertdialog", { name: "Delete subject" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("resolves false when cancelled", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderWithProviders(<Harness onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Ask confirm" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("resolves false on Escape", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderWithProviders(<Harness onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Ask confirm" }));
    await user.keyboard("{Escape}");

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("focuses the confirm button so Enter is the primary path", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness onResult={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Ask confirm" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus(),
    );
  });
});

describe("prompt dialog", () => {
  it("resolves the trimmed value", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderWithProviders(<Harness onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Ask prompt" }));
    const input = screen.getByRole("textbox");
    await waitFor(() => expect(input).toHaveFocus());

    await user.type(input, "  Organic Chemistry  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith("Organic Chemistry"),
    );
  });

  it("submits on Enter from the text field", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderWithProviders(<Harness onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Ask prompt" }));
    await user.type(screen.getByRole("textbox"), "Physics{Enter}");

    await waitFor(() => expect(onResult).toHaveBeenCalledWith("Physics"));
  });

  it("refuses an empty value instead of resolving", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderWithProviders(<Harness onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Ask prompt" }));
    await user.type(screen.getByRole("textbox"), "   ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Asserted without waitFor on purpose: the error state must be applied in
    // the click itself, not deferred to an animation frame, or it never lands
    // in a background tab where rAF doesn't run.
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("resolves null when cancelled", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderWithProviders(<Harness onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Ask prompt" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
  });
});

describe("prompt dialog options", () => {
  function OptionsHarness({
    onResult,
    options,
  }: {
    onResult: (value: unknown) => void;
    options: Parameters<ReturnType<typeof useDialog>["promptText"]>[1];
  }) {
    const { promptText } = useDialog();
    return (
      <Button
        onClick={async () => onResult(await promptText("Enter it", options))}
      >
        Ask
      </Button>
    );
  }

  /* Sign-in sends the password as typed, so the confirmation must too. */
  it("returns a password exactly as typed, spaces included", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    renderWithProviders(
      <OptionsHarness
        onResult={onResult}
        options={{ inputType: "password" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ask" }));
    const input = document.querySelector('input[type="password"]')!;
    await user.type(input, " secret pass ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(" secret pass "));
  });

  it("caps the value when a maxLength is given", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <OptionsHarness onResult={vi.fn()} options={{ maxLength: 80 }} />,
    );

    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(screen.getByRole("textbox")).toHaveAttribute("maxLength", "80");
  });
});
