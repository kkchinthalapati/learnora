import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/render";
import { Button } from "../components/Button";
import { useToast } from "./toast";

function Harness() {
  const { showToast, notifyFetchError } = useToast();
  return (
    <>
      <Button onClick={() => showToast("Subject saved")}>Save</Button>
      <Button onClick={() => showToast("Save failed", { error: true })}>
        Fail
      </Button>
      <Button onClick={() => notifyFetchError("subjects")}>Fetch error</Button>
      <Button
        onClick={() =>
          showToast("Task deleted", {
            actionLabel: "Undo",
            onAction: () => showToast("Restored"),
          })
        }
      >
        Delete
      </Button>
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("toasts", () => {
  it("announces routine confirmations politely", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    const toast = screen.getByText("Subject saved").closest("[role]")!;
    expect(toast).toHaveAttribute("role", "status");
    expect(screen.getByTestId("toast-container")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("gives failures role=alert so they interrupt", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: "Fail" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
  });

  it("formats fetch failures the way the vanilla app does", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: "Fetch error" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load your subjects. Check your connection.",
    );
  });

  it("auto-dismisses after the default 6s", () => {
    vi.useFakeTimers();
    renderWithProviders(<Harness />);

    // fireEvent rather than userEvent: userEvent's own internal delays fight
    // with fake timers, and this test only cares about the dismiss timer.
    act(() => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(screen.getByText("Subject saved")).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(5999));
    expect(screen.getByText("Subject saved")).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(1));
    expect(screen.queryByText("Subject saved")).not.toBeInTheDocument();
  });

  it("runs the action and dismisses when the action button is used", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.queryByText("Task deleted")).not.toBeInTheDocument();
    expect(screen.getByText("Restored")).toBeInTheDocument();
  });

  it("stacks multiple toasts", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Fail" }));

    expect(screen.getByTestId("toast-container").children).toHaveLength(2);
  });
});
