import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { installFakeSpeech, uninstallFakeSpeech, type FakeSynth } from "../../test/fakeSpeech";
import type { PodcastScript } from "../../api/podcast";

const write = vi.fn();
vi.mock("../../api/podcast", async (orig) => ({
  ...(await orig<typeof import("../../api/podcast")>()),
  writePodcastScript: (...a: unknown[]) => write(...a),
}));

const { PodcastPlayer, RECALL_SECONDS } = await import("./PodcastPlayer");

const SCRIPT: PodcastScript = {
  title: "Why water moves",
  lines: [
    { speaker: "host", text: "Water moves by osmosis." },
    { speaker: "student", text: "Which way though?" },
    { speaker: "check", text: "Which way does water move?", answer: "Towards the concentrated side." },
    { speaker: "host", text: "That's the whole idea." },
  ],
};

const renderPlayer = (missed: string[] = []) =>
  render(<PodcastPlayer materialId="m-1" lesson="Osmosis" notes="Water moves." missed={missed} />);

describe("PodcastPlayer", () => {
  let synth: FakeSynth;
  beforeEach(() => {
    localStorage.clear();
    write.mockReset();
    synth = installFakeSpeech();
  });
  afterEach(() => {
    uninstallFakeSpeech();
    vi.useRealTimers();
  });

  it("asks before writing anything, since an episode costs allowance", () => {
    renderPlayer();
    expect(screen.getByRole("heading", { name: "Make it your episode" })).toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
  });

  it("offers every format and length, and writes the episode the student chose", async () => {
    write.mockResolvedValueOnce(SCRIPT);
    renderPlayer();
    const user = userEvent.setup();
    for (const name of [/Conversation/, /Solo lesson/, /Debate/]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
    await user.click(screen.getByRole("radio", { name: /Debate/ }));
    await user.click(screen.getByRole("radio", { name: /Deep dive/ }));
    await user.click(screen.getByRole("button", { name: "Make my episode" }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toMatchObject({ style: { format: "debate", length: "deep", recallBreaks: true } });
    expect(await screen.findByRole("heading", { name: "Why water moves" })).toBeInTheDocument();
    /* Debate names its voices. */
    expect(screen.getAllByText("Challenger").length).toBeGreaterThan(0);
  });

  it("only offers 'the parts I missed' when something was missed", async () => {
    renderPlayer();
    expect(screen.getByRole("radio", { name: "Only the parts I missed" })).toBeDisabled();
  });

  it("passes the missed parts through when that focus is chosen", async () => {
    write.mockResolvedValueOnce(SCRIPT);
    renderPlayer(["Water potential"]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Only the parts I missed" }));
    expect(screen.getByText("Mostly about: Water potential.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Make my episode" }));
    expect(write.mock.calls[0][0]).toMatchObject({ missed: ["Water potential"], style: { focus: "missed" } });
  });

  it("needs words before a custom focus can be made", async () => {
    renderPlayer();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Something specific" }));
    expect(screen.getByRole("button", { name: "Make my episode" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "What to focus on" }), "just the equations");
    expect(screen.getByRole("button", { name: "Make my episode" })).toBeEnabled();
  });

  it("pauses at a recall break, then gives the answer", async () => {
    write.mockResolvedValueOnce(SCRIPT);
    renderPlayer();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Make my episode" }));
    await screen.findByRole("heading", { name: "Why water moves" });
    /* The answer is hidden until it is given. */
    expect(screen.queryByText("Towards the concentrated side.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play" }));
    act(() => synth.finish());
    act(() => synth.finish());
    expect(synth.spoken.at(-1)).toBe("Quick check. Which way does water move?");

    vi.useFakeTimers();
    act(() => synth.finish());
    expect(screen.getByRole("status")).toHaveTextContent(`The answer comes in ${RECALL_SECONDS}s`);
    act(() => vi.advanceTimersByTime(RECALL_SECONDS * 1000));
    expect(synth.spoken.at(-1)).toBe("Towards the concentrated side.");
    vi.useRealTimers();
    expect(screen.getByText("Towards the concentrated side.")).toBeInTheDocument();
  });

  it("lets the listener skip the wait", async () => {
    write.mockResolvedValueOnce(SCRIPT);
    renderPlayer();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Make my episode" }));
    await screen.findByRole("heading", { name: "Why water moves" });
    await user.click(screen.getByRole("button", { name: "Play" }));
    act(() => synth.finish());
    act(() => synth.finish());
    act(() => synth.finish());
    await user.click(screen.getByRole("button", { name: "Show it now" }));
    expect(synth.spoken.at(-1)).toBe("Towards the concentrated side.");
  });

  it("keeps an episode for these choices, and lets the student change it", async () => {
    write.mockResolvedValueOnce(SCRIPT);
    const first = renderPlayer();
    await userEvent.setup().click(screen.getByRole("button", { name: "Make my episode" }));
    await screen.findByRole("heading", { name: "Why water moves" });
    first.unmount();

    renderPlayer();
    expect(screen.getByRole("heading", { name: "Why water moves" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Change this episode" }));
    expect(screen.getByRole("heading", { name: "Make it your episode" })).toBeInTheDocument();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("says so when the episode could not be written, and records nothing", async () => {
    write.mockRejectedValueOnce(new Error("I couldn't write the podcast just now."));
    renderPlayer();
    await userEvent.setup().click(screen.getByRole("button", { name: "Make my episode" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("couldn't write the podcast"));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
