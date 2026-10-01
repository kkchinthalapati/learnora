import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resetLifeContextCache, useLifeContext } from "./useLifeContext";
import {
  LIFE_CONTEXT_CHANGED_EVENT,
  LIFE_CONTEXT_KEY,
  loadLifeContext,
} from "../lib/lifeContext";

/* Two surfaces read this — the dashboard timeline and the My week editor —
 * and they have to agree the instant one of them writes. These tests are about
 * that guarantee, not about the context's contents (lifeContext.test.ts owns
 * those). */

function Probe({ id }: { id: string }) {
  const { context, update } = useLifeContext();
  return (
    <div>
      <span data-testid={`wake-${id}`}>{context.wakeTime}</span>
      <button type="button" onClick={() => update({ wakeTime: "05:15" })}>
        set {id}
      </button>
    </div>
  );
}

describe("useLifeContext", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLifeContextCache();
  });

  afterEach(() => {
    resetLifeContextCache();
  });

  it("reads what is in storage on first render", () => {
    localStorage.setItem(
      LIFE_CONTEXT_KEY,
      JSON.stringify({ version: 1, wakeTime: "06:45" }),
    );
    resetLifeContextCache();
    render(<Probe id="a" />);
    expect(screen.getByTestId("wake-a")).toHaveTextContent("06:45");
  });

  it("normalises a corrupt stored value instead of rendering it", () => {
    localStorage.setItem(LIFE_CONTEXT_KEY, "{not json");
    resetLifeContextCache();
    render(<Probe id="a" />);
    expect(screen.getByTestId("wake-a")).toHaveTextContent("07:30");
  });

  it("writes through to storage", async () => {
    const user = userEvent.setup();
    render(<Probe id="a" />);

    await user.click(screen.getByRole("button", { name: "set a" }));

    expect(loadLifeContext().wakeTime).toBe("05:15");
    expect(screen.getByTestId("wake-a")).toHaveTextContent("05:15");
  });

  it("repaints every mounted surface on a write, not just the one that wrote", async () => {
    /* The whole reason this is a store rather than a `useState` per view: the
       dashboard timeline must not keep showing yesterday's week because the
       edit happened in a different component. */
    const user = userEvent.setup();
    render(
      <>
        <Probe id="a" />
        <Probe id="b" />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "set a" }));

    expect(screen.getByTestId("wake-a")).toHaveTextContent("05:15");
    expect(screen.getByTestId("wake-b")).toHaveTextContent("05:15");
  });

  it("picks up an edit made in another tab", () => {
    /* A custom event only reaches this tab; `storage` only reaches the others.
       Both are wired, so an edit is never stranded on the tab that made it. */
    render(<Probe id="a" />);

    localStorage.setItem(
      LIFE_CONTEXT_KEY,
      JSON.stringify({ version: 1, wakeTime: "04:00" }),
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: LIFE_CONTEXT_KEY }),
      );
    });

    expect(screen.getByTestId("wake-a")).toHaveTextContent("04:00");
  });

  it("stops listening once unmounted", () => {
    const { unmount } = render(<Probe id="a" />);
    unmount();
    /* No assertion beyond "this does not throw": a subscription left behind
       would call into an unmounted store and React would warn. */
    act(() => {
      window.dispatchEvent(new Event(LIFE_CONTEXT_CHANGED_EVENT));
    });
    expect(screen.queryByTestId("wake-a")).toBeNull();
  });
});
