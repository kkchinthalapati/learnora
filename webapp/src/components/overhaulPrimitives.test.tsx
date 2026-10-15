import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ListRow, ListRows } from "./ListRow";
import { ProgressRing } from "./ProgressRing";
import { Tabs, TabPanel, useTabIds } from "./Tabs";

/* The shared parts added by the 2026-10 overhaul (webapp/DESIGN.md 0.4). */

function TabsHarness() {
  const [value, setValue] = useState<"a" | "b" | "c">("a");
  const idBase = useTabIds();
  return (
    <>
      <Tabs
        items={[
          { value: "a", label: "Notes" },
          { value: "b", label: "Cards", count: 3 },
          { value: "c", label: "Quiz" },
        ]}
        value={value}
        onChange={setValue}
        label="Parts"
        idBase={idBase}
      />
      <TabPanel idBase={idBase} value={value}>
        Panel {value}
      </TabPanel>
    </>
  );
}

describe("Tabs", () => {
  it("is one tab stop, with arrows, Home and End moving the selection", async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);

    await user.tab();
    expect(tabs[0]).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Cards/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel b");

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Quiz" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Quiz" })).toHaveAttribute("aria-selected", "true");
  });

  it("names the panel from its tab", () => {
    render(<TabsHarness />);
    expect(screen.getByRole("tabpanel", { name: "Notes" })).toBeInTheDocument();
  });
});

describe("ProgressRing", () => {
  it("says what it counts", () => {
    render(<ProgressRing value={0.4} label="12 of 30 cards practised" center="12" />);
    expect(screen.getByRole("img", { name: "12 of 30 cards practised" })).toBeInTheDocument();
  });

  it("draws only the track when there is nothing to count", () => {
    const { container } = render(<ProgressRing value={null} label="No cards yet" />);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });
});

describe("ListRow", () => {
  it("links the row and keeps its trailing control outside the link", () => {
    render(
      <MemoryRouter>
        <ListRows label="Lessons">
          <ListRow title="Enzymes" meta="Biology" to="/lessons/m-1" trailing={<button type="button">Menu</button>} />
        </ListRows>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: /Enzymes/ });
    expect(link).toHaveAttribute("href", "/lessons/m-1");
    expect(link).not.toContainElement(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("list", { name: "Lessons" })).toBeInTheDocument();
  });
});
