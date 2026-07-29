import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Icon } from "./Icon";
import { Skeleton } from "./Skeleton";
import { ICON_NAMES } from "./icons";

describe("Icon", () => {
  it("renders every icon in the registry", () => {
    const { container } = render(
      <>
        {ICON_NAMES.map((name) => (
          <Icon key={name} name={name} />
        ))}
      </>,
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(ICON_NAMES.length);
    // Every icon should actually draw something — a typo in the registry
    // would otherwise render an empty 24x24 box.
    svgs.forEach((svg) => expect(svg.children.length).toBeGreaterThan(0));
  });

  it("is decorative unless given a label", () => {
    const { container, rerender } = render(<Icon name="trash" />);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    rerender(<Icon name="trash" label="Delete" />);
    expect(screen.getByRole("img", { name: "Delete" })).toBeInTheDocument();
  });
});

describe("Button", () => {
  it("defaults to type=button so it can't accidentally submit a form", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Just a button</Button>
      </form>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("EmptyState", () => {
  it("shows a title, message and actions", () => {
    render(
      <EmptyState
        title="No subjects yet"
        message="Create one to get started"
        icon="folder"
      >
        <Button>Create subject</Button>
      </EmptyState>,
    );
    expect(screen.getByText("No subjects yet")).toBeInTheDocument();
    expect(screen.getByText("Create one to get started")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create subject" }),
    ).toBeInTheDocument();
  });

  it("renders the compact variant as a single line", () => {
    render(<EmptyState size="sm" message="Nothing due today" />);
    expect(screen.getByText("Nothing due today")).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("is hidden from screen readers unless it carries the loading label", () => {
    const { container, rerender } = render(<Skeleton />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");

    rerender(<Skeleton label="Loading subjects" />);
    expect(
      screen.getByRole("status", { name: "Loading subjects" }),
    ).toBeInTheDocument();
  });
});
