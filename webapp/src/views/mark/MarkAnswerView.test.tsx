import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { AiError } from "../../api/ai";
import { markAnswerPhoto } from "../../api/aiMarkAnswer";
import { readMarking, parseMarkScheme } from "../../lib/photoMarking";
import { MarkAnswerView } from "./MarkAnswerView";

const record = vi.fn();
vi.mock("../../api/aiMarkAnswer", () => ({ markAnswerPhoto: vi.fn() }));
vi.mock("../../hooks/useMisconceptions", async (orig) => ({
  ...(await orig<typeof import("../../hooks/useMisconceptions")>()),
  useRecordMisconceptions: () => record,
}));
vi.mock("../../hooks/useFolders", () => ({
  useFolders: () => ({ data: [{ id: "f", name: "Biology" }] }),
}));
vi.mock("../../lib/studyImage", async (orig) => ({
  ...(await orig<typeof import("../../lib/studyImage")>()),
  prepareStudyImage: vi.fn(async (file: File) => ({ file, originalBytes: file.size, resized: false })),
}));

const mark = vi.mocked(markAnswerPhoto);
const SCHEME_TEXT = "Water moves by osmosis (1)\nThrough a partially permeable membrane (2)";
const scheme = parseMarkScheme(SCHEME_TEXT);

function renderAt(path = "/mark?subject=Biology") {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  return renderWithAuth(
    <Routes>
      <Route path="/mark" element={<MarkAnswerView />} />
    </Routes>,
    { session: fakeSession() },
    { initialEntries: [path] },
  );
}

async function fill({ withPhoto = true, schemeText = SCHEME_TEXT } = {}) {
  if (withPhoto) {
    await userEvent.upload(
      screen.getByLabelText("Photo of your answer"),
      new File(["x"], "answer.jpg", { type: "image/jpeg" }),
    );
  }
  if (schemeText) await userEvent.type(screen.getByLabelText("Mark scheme"), schemeText);
}

beforeEach(() => {
  mockAuthSession("user-1");
  vi.clearAllMocks();
});

describe("mark my answer", () => {
  it("reads the scheme as it's pasted and fills the subject from the link", async () => {
    renderAt();
    expect(screen.getByRole("heading", { level: 1, name: "Mark my answer" })).toBeInTheDocument();
    expect(screen.getByLabelText("Subject")).toHaveValue("Biology");
    await fill({ withPhoto: false });
    expect(screen.getByText("2 points, 3 marks")).toBeInTheDocument();
  });

  it("asks for what's missing instead of sending", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("button", { name: "Mark it" }));
    expect(screen.getByText("Add a photo of your answer.")).toBeInTheDocument();
    await fill({ schemeText: "" });
    await userEvent.click(screen.getByRole("button", { name: "Mark it" }));
    expect(screen.getByText("Paste the mark scheme, one point per line.")).toBeInTheDocument();
    expect(mark).not.toHaveBeenCalled();
  });

  it("shows each point with the student's own words, counts the score from the scheme, and files a stated belief", async () => {
    mark.mockResolvedValueOnce(
      readMarking(
        {
          points: [
            { index: 0, awarded: true, evidence: "the water moves by osmosis" },
            { index: 1, awarded: false, note: "Membrane not mentioned" },
          ],
          beliefs: [{ concept: "Osmosis", belief: "Thinks salt moves into the cell", quote: "the salt goes in" }],
        },
        scheme,
      )!,
    );
    renderAt();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Mark it" }));

    expect(await screen.findByRole("heading", { name: "1 of 3 marks" })).toBeInTheDocument();
    const points = screen.getByRole("list", { name: "Mark scheme points" });
    expect(within(points).getByText("You wrote: “the water moves by osmosis”")).toBeInTheDocument();
    expect(within(points).getByText("Membrane not mentioned")).toBeInTheDocument();
    expect(screen.getByText("Thinks salt moves into the cell")).toBeInTheDocument();
    expect(screen.getByText(/in your mistakes now/)).toBeInTheDocument();
    expect(screen.getByText(/your teacher’s marking is the one that counts/)).toBeInTheDocument();
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toHaveLength(1);
    expect(mark.mock.calls[0][1]).toEqual(scheme);
    expect(mark.mock.calls[0][3]).toBe("Biology");
  });

  it("says the score is only a floor when points weren't checked", async () => {
    mark.mockResolvedValueOnce(readMarking({ points: [{ index: 0, awarded: true, evidence: "osmosis" }] }, scheme)!);
    renderAt();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Mark it" }));
    expect(await screen.findByRole("heading", { name: "At least 1 of 3 marks" })).toBeInTheDocument();
    expect(screen.getByText(/One point wasn’t checked, so this is the lowest it could be/)).toBeInTheDocument();
  });

  it("gives no mark at all for handwriting it couldn't read, and files nothing", async () => {
    mark.mockResolvedValueOnce({ kind: "unreadable", reason: "The bottom half is blurred." });
    renderAt();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Mark it" }));
    expect(await screen.findByRole("heading", { name: "We couldn’t read enough of that to mark it" })).toBeInTheDocument();
    expect(screen.getByText("The bottom half is blurred.")).toBeInTheDocument();
    expect(screen.queryByText(/of 3 marks/)).not.toBeInTheDocument();
    expect(record).toHaveBeenCalledWith([]);
    await userEvent.click(screen.getByRole("button", { name: "Try another photo" }));
    expect(screen.getByRole("button", { name: "Mark it" })).toBeInTheDocument();
  });

  it("passes the allowance or photo-reading message through, and offers to try again", async () => {
    mark.mockRejectedValueOnce(new AiError("Reading photos needs Learnora's image model.", { retryable: false, status: 503 }));
    renderAt();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Mark it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reading photos needs Learnora's image model.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
  });

  it("says plainly when the marker failed on our side", async () => {
    mark.mockRejectedValueOnce(new AiError("boom", { retryable: true }));
    renderAt();
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Mark it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The marker didn’t answer. That’s on our side, not yours.");
  });
});
