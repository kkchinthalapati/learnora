import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { fakeSession, renderWithAuth } from "../../test/auth";

/* A lesson is started through the generation screen (context/generation);
   this one never finishes, so the first lesson is still being made. */
const start = vi.fn(
  () => new Promise<never>(() => {
    /* Never settles: the first lesson is still being made. */
  }),
);

vi.mock("../../context/generation", async (orig) => ({
  ...(await orig<typeof import("../../context/generation")>()),
  useGeneration: () => ({ job: null, start }),
}));

import { CaptureBar } from "./CaptureBar";

describe("CaptureBar", () => {
  /* Audit F-06: two submits in one tick made two lessons, because the guard
     was React state that had not re-rendered yet. */
  it("starts one lesson when submitted twice in the same tick", async () => {
    renderWithAuth(
      <CaptureBar initialText="photosynthesis" />,
      { session: fakeSession() },
      { initialEntries: ["/"] },
    );
    const form = screen.getByRole("textbox").closest("form");
    expect(form).not.toBeNull();

    act(() => {
      fireEvent.submit(form!);
      fireEvent.submit(form!);
    });

    expect(start).toHaveBeenCalledTimes(1);
  });
});
