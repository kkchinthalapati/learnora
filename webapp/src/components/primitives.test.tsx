import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";
import { Card } from "./Card";
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

describe("Card", () => {
  it("renders a div root with the panel variant and md padding by default", () => {
    render(<Card data-testid="card">content</Card>);
    const card = screen.getByTestId("card");
    expect(card.tagName).toBe("DIV");
    expect(card.className).toMatch(/_panel_/);
    expect(card.className).toMatch(/_padding-md_/);
    expect(card.className).toMatch(/_radius-lg_/);
  });

  it("switches recipe and default radius together for the elevated variant", () => {
    render(
      <Card variant="elevated" data-testid="card">
        content
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toMatch(/_elevated_/);
    expect(card.className).toMatch(/_radius-xl_/);
  });

  it("lets an explicit radius override the variant's default", () => {
    render(
      <Card variant="elevated" radius="lg" data-testid="card">
        content
      </Card>,
    );
    expect(screen.getByTestId("card").className).toMatch(/_radius-lg_/);
  });

  it("combines a caller's className with its own generated classes", () => {
    render(
      <Card className="examCard" data-testid="card">
        content
      </Card>,
    );
    expect(screen.getByTestId("card").className).toContain("examCard");
  });

  it("only adds the hover-elevation class when opted in", () => {
    const { rerender } = render(<Card data-testid="card">content</Card>);
    expect(screen.getByTestId("card").className).not.toMatch(/hoverElevation/);

    rerender(
      <Card hoverElevation data-testid="card">
        content
      </Card>,
    );
    expect(screen.getByTestId("card").className).toMatch(/hoverElevation/);
  });

  it("forwards arbitrary div props like aria-busy", () => {
    render(<Card aria-busy="true">content</Card>);
    expect(screen.getByText("content").closest("div")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("renders a section root when asked, keeping the aria-labelledby landmark", () => {
    render(
      <>
        <h3 id="card-heading">Profile</h3>
        <Card as="section" aria-labelledby="card-heading">
          content
        </Card>
      </>,
    );
    const region = screen.getByRole("region", { name: "Profile" });
    expect(region.tagName).toBe("SECTION");
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
