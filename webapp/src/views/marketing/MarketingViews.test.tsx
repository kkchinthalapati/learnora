import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { LandingView } from "./LandingView";
import { AboutView, ContactView, DevelopersView } from "./MarketingPages";

describe("Marketing Views", () => {
  describe("LandingView", () => {
    const realLocation = window.location;
    afterEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: realLocation,
      });
    });

    it("sends an old /app/landing link to the one landing page at /", () => {
      const replace = vi.fn();
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...realLocation, replace },
      });
      const { container } = render(
        <MemoryRouter initialEntries={["/landing"]}>
          <LandingView />
        </MemoryRouter>,
      );
      expect(replace).toHaveBeenCalledWith("/");
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("AboutView", () => {
    it("renders about headline and content", () => {
      render(
        <MemoryRouter initialEntries={["/about"]}>
          <AboutView />
        </MemoryRouter>,
      );

      expect(
        screen.getByRole("heading", { name: "About Learnora" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/AI-assisted study workspace/i)).toBeInTheDocument();
    });
  });

  describe("ContactView", () => {
    it("renders contact information and email link", () => {
      render(
        <MemoryRouter initialEntries={["/contact"]}>
          <ContactView />
        </MemoryRouter>,
      );

      expect(
        screen.getByRole("heading", { name: "Contact Learnora" }),
      ).toBeInTheDocument();
      expect(screen.getByText("support@learnora.app")).toBeInTheDocument();
    });
  });

  describe("DevelopersView", () => {
    it("renders developer resources, MCP and API info", () => {
      render(
        <MemoryRouter initialEntries={["/developers"]}>
          <DevelopersView />
        </MemoryRouter>,
      );

      expect(
        screen.getByRole("heading", { name: /Learnora Developer Resources/i }),
      ).toBeInTheDocument();
      expect(screen.getByText("GET /api/product-info")).toBeInTheDocument();
      expect(screen.getByText("POST /api/mcp")).toBeInTheDocument();
    });
  });
});
