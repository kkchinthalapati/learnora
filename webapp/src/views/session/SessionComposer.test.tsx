import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionComposer } from "./SessionComposer";
import {
  FakeRecognition,
  installFakeSpeech,
  uninstallFakeSpeech,
} from "../../test/fakeSpeech";

afterEach(() => uninstallFakeSpeech());

describe("SessionComposer voice", () => {
  it("offers no mic where the browser has no speech recognition", () => {
    render(<SessionComposer placeholder="Answer" onSend={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Answer by voice" })).toBeNull();
    expect(screen.getByLabelText("Your answer")).toBeEnabled();
  });

  it("says when the microphone is blocked, and typing still sends", async () => {
    installFakeSpeech();
    const onSend = vi.fn();
    render(<SessionComposer placeholder="Answer" onSend={onSend} />);

    await userEvent.click(screen.getByRole("button", { name: "Answer by voice" }));
    act(() => FakeRecognition.latest().deny());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Microphone permission was denied.*You can type your answer instead/,
    );

    await userEvent.type(screen.getByLabelText("Your answer"), "Light makes glucose");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("Light makes glucose");
  });
});
