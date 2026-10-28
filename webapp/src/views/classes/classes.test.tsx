import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { MISCONCEPTION_CATALOGUE } from "../../lib/misconceptionCatalogue";
import { ClassesView } from "./ClassesView";
import { ClassMapView } from "./ClassMapView";

const state = vi.hoisted(() => ({
  memberships: [] as { class_id: string; class_name: string; share_mistakes: boolean; joined_at: string }[],
  taught: [] as { id: string; name: string; join_code: string; created_at: string }[],
  map: { counts: { joined: 0, sharing: 0 }, rows: [] as { catalogue_id: string; students: number }[] },
  join: vi.fn(),
  setShare: vi.fn(),
  leave: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../../hooks/useClasses", () => ({
  useMemberships: () => ({ data: state.memberships, isPending: false, isError: false }),
  useTaughtClasses: () => ({ data: state.taught, isPending: false, isError: false }),
  useClassMap: () => ({ data: state.map, isPending: false, isError: false }),
  useClassActions: () => ({
    join: { mutateAsync: state.join, isPending: false },
    setShare: { mutate: state.setShare },
    leave: { mutate: state.leave },
    create: { mutateAsync: state.create, isPending: false, isError: false },
    remove: { mutate: state.remove },
  }),
}));

function renderAt(path: string) {
  return renderWithAuth(
    <Routes>
      <Route path="/classes" element={<ClassesView />} />
      <Route path="/classes/:classId" element={<ClassMapView />} />
    </Routes>,
    { session: fakeSession() },
    { initialEntries: [path] },
  );
}

const [first, second] = MISCONCEPTION_CATALOGUE;

beforeEach(() => {
  mockAuthSession("user-1");
  vi.clearAllMocks();
  localStorage.setItem("learnora:flag:classMap", "true");
  state.memberships = [];
  state.taught = [];
  state.map = { counts: { joined: 0, sharing: 0 }, rows: [] };
});

describe("classes, as a student", () => {
  it("stays closed while the flag is off", () => {
    localStorage.setItem("learnora:flag:classMap", "false");
    renderAt("/classes");
    expect(screen.getByText("Classes aren’t open yet")).toBeInTheDocument();
    expect(screen.queryByLabelText("Class code")).not.toBeInTheDocument();
  });

  it("joins by code, says sharing is still off, and checks the code before sending", async () => {
    state.join.mockResolvedValueOnce({ class_id: "c1", class_name: "10B Biology" });
    renderAt("/classes");
    await userEvent.type(screen.getByLabelText("Class code"), "ab12");
    await userEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(screen.getByText("A class code is 8 letters and numbers.")).toBeInTheDocument();
    expect(state.join).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText("Class code"));
    await userEvent.type(screen.getByLabelText("Class code"), "ab12 cd34");
    await userEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(state.join).toHaveBeenCalledWith("AB12CD34");
    expect(await screen.findByText("You’ve joined 10B Biology. Sharing is off until you turn it on.")).toBeInTheDocument();
  });

  it("says when no class has the code", async () => {
    state.join.mockResolvedValueOnce(null);
    renderAt("/classes");
    await userEvent.type(screen.getByLabelText("Class code"), "ZZZZ9999");
    await userEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(await screen.findByText("No class has that code.")).toBeInTheDocument();
  });

  it("explains exactly what a teacher can see, beside a sharing switch that is the student's own", async () => {
    state.memberships = [{ class_id: "c1", class_name: "10B Biology", share_mistakes: false, joined_at: "" }];
    renderAt("/classes");
    expect(screen.getByText(/never see your name, anything you wrote, or anything at all until at least 5 students share/)).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Classes you’re in" });
    const toggle = within(list).getByRole("switch", { name: "Share my mistakes" });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(state.setShare).toHaveBeenCalledWith({ classId: "c1", share: true });
    await userEvent.click(within(list).getByRole("button", { name: "Leave" }));
    expect(state.leave).toHaveBeenCalledWith("c1");
  });
});

describe("classes, as a teacher", () => {
  it("creates a class and lists its join code and map", async () => {
    state.create.mockResolvedValueOnce({});
    state.taught = [{ id: "t1", name: "10B Biology", join_code: "AB12CD34", created_at: "" }];
    renderAt("/classes");
    await userEvent.type(screen.getByLabelText("Class name"), "11A Chemistry");
    await userEvent.click(screen.getByRole("button", { name: "Create class" }));
    expect(state.create).toHaveBeenCalledWith("11A Chemistry");
    const list = screen.getByRole("list", { name: "Classes you teach" });
    expect(within(list).getByText("AB12CD34")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "10B Biology" })).toHaveAttribute("href", "/classes/t1");
  });

  it("shows nothing about mix-ups until enough students share", () => {
    state.taught = [{ id: "t1", name: "10B Biology", join_code: "AB12CD34", created_at: "" }];
    state.map = { counts: { joined: 9, sharing: 3 }, rows: [{ catalogue_id: first.id, students: 3 }] };
    renderAt("/classes/t1");
    expect(screen.getByRole("heading", { level: 1, name: "10B Biology" })).toBeInTheDocument();
    expect(screen.getByText("9 joined, 3 sharing. Join code AB12CD34.")).toBeInTheDocument();
    expect(screen.getByText(/The map appears once at least 5 students share\. 2 more need to turn sharing on\./)).toBeInTheDocument();
    expect(screen.queryByText(first.concept)).not.toBeInTheDocument();
  });

  it("shows counts and the catalogue's re-teach once they do, and nothing about any one student", () => {
    state.taught = [{ id: "t1", name: "10B Biology", join_code: "AB12CD34", created_at: "" }];
    state.map = {
      counts: { joined: 12, sharing: 7 },
      rows: [
        { catalogue_id: first.id, students: 4 },
        { catalogue_id: second.id, students: 2 },
      ],
    };
    renderAt("/classes/t1");
    expect(screen.getByRole("heading", { name: first.concept })).toBeInTheDocument();
    expect(screen.getByText("4 of the 7 students sharing")).toBeInTheDocument();
    expect(screen.getByText(`“${first.belief}”`)).toBeInTheDocument();
    expect(screen.getAllByText("Re-teach it in five minutes")).toHaveLength(2);
    expect(screen.getByText(first.remediation)).toBeInTheDocument();
    expect(screen.getByText(/Counts only\. You don’t see who holds a mix-up/)).toBeInTheDocument();
  });

  it("won't show a map for a class this account doesn't teach", () => {
    state.taught = [];
    renderAt("/classes/someone-elses");
    expect(screen.getByText("This isn’t one of your classes")).toBeInTheDocument();
  });
});
