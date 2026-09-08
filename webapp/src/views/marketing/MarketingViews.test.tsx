import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { LandingView } from "./LandingView";
import { AboutView, ContactView, DevelopersView } from "./MarketingPages";

describe("Marketing Views", () => {
  describe("LandingView", () => {
    it("renders hero, 1-click guest timer button, and localized pricing", () => {
      render(
        <MemoryRouter initialEntries={["/landing"]}>
          <LandingView />
        </MemoryRouter>,
      );

      // Hero
      expect(
        screen.getByRole("heading", { name: /Know Your Grade/i }),
      ).toBeInTheDocument();

      // 1-Click Focus Timer button
      const timerBtn = screen.getByRole("link", {
        name: /Try 25m Focus Timer/i,
      });
      expect(timerBtn).toBeInTheDocument();
      expect(timerBtn).toHaveAttribute("href", "/timer");

      // Localized INR pricing
      expect(screen.getByText("₹0")).toBeInTheDocument();
      expect(screen.getByText("₹199")).toBeInTheDocument();
      expect(screen.getByText("₹399")).toBeInTheDocument();

      // UPI badge
      expect(screen.getByText(/Supports UPI/i)).toBeInTheDocument();
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
