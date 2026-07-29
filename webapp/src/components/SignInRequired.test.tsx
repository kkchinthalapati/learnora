import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignInRequired } from "./SignInRequired";

describe("SignInRequired", () => {
  it("explains what happened and links back to the vanilla app", () => {
    render(<SignInRequired />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in required" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("does not navigate on its own", () => {
    // An automatic redirect would loop forever wherever "/" is served by this
    // app rather than the vanilla one — notably the dev server.
    const { container } = render(<SignInRequired />);
    expect(container.querySelector("meta[http-equiv=refresh]")).toBeNull();
    expect(window.location.pathname).toBe("/");
  });
});
