import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { SessionCompletePanel } from "./SessionCompletePanel";
import type { QuickCheckResult } from "../../components/quickcheck/QuickCheck";
import type { LocalSession } from "../../lib/localSessions";

/* The check itself is covered in QuickCheck.test.tsx; what this file is about
 * is where the student can go once it has a result, so the check is reduced
 * to a button that hands one back. */
const result = vi.hoisted(() => ({ current: null as QuickCheckResult | null }));
vi.mock("../../components/quickcheck/QuickCheck", () => ({
  QuickCheck: ({ onDone }: { onDone: (r: QuickCheckResult) => void }) => (
    <button type="button" onClick={() => onDone(result.current!)}>
      finish the check
    </button>
  ),
}));

const session = {
  id: 7,
  timestamp: "Today",
  minutes: 45,
  task: "Enzymes",
} as LocalSession;

async function runCheck(r: QuickCheckResult) {
  result.current = r;
  renderWithAuth(
    <SessionCompletePanel session={session} onClose={() => {}} />,
    { session: fakeSession() },
    { withRouter: true },
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Start quick check" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "finish the check" }),
  );
}

describe("SessionCompletePanel", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  /* The result used to be a score and a "Done" button — the student was told
     they got 1/4 and given nowhere to take that. */
  it("leads with the topic that slipped, into the tool that repairs it", async () => {
    await runCheck({
      correct: 1,
      total: 4,
      score: 0.25,
      saved: true,
      missed: ["Denaturation", "Active site"],
    });
    expect(screen.getByText(/1\/4 correct/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Work on Denaturation" }),
    ).toHaveAttribute("href", "/solver?topic=Denaturation");
  });

  it("asks a clean sheet to explain the topic rather than congratulating it and stopping", async () => {
    await runCheck({ correct: 4, total: 4, score: 1, saved: true, missed: [] });
    expect(
      screen.getByRole("link", { name: /Explain Enzymes in your own words/ }),
    ).toHaveAttribute("href", "/feynman?topic=Enzymes");
    expect(screen.queryByRole("link", { name: /Work on/ })).toBeNull();
  });
});
