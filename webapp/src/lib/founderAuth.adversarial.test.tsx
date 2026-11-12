import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { isFounder, getFounderProfile } from "./founderAuth";
import { FounderGate } from "../components/FounderGate";
import { fakeSession, renderWithAuth } from "../test/auth";
import type { AuthState } from "../context/auth";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-test",
    email: "student@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as User;
}

function LoginStub() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from;
  return (
    <main>
      <h1>Sign in</h1>
      <p data-testid="from">{from?.pathname ?? "none"}</p>
    </main>
  );
}

function HomeStub() {
  const location = useLocation();
  const state = location.state as { denied?: boolean; reason?: string } | null;
  return (
    <main>
      <h1>Student Dashboard</h1>
      {state?.denied && <p data-testid="denied-flag">denied:{state.reason}</p>}
    </main>
  );
}

function ChannelStub() {
  const location = useLocation();
  return (
    <main>
      <h1>Founders Slack Channel</h1>
      <p data-testid="channel-path">{location.pathname}</p>
    </main>
  );
}

function renderGatedRoute(
  path: string,
  authState: Partial<AuthState> = {},
  gateProps = {},
) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginStub />} />
        <Route path="/" element={<HomeStub />} />
        <Route element={<FounderGate {...gateProps} />}>
          <Route path="/slack" element={<ChannelStub />} />
          <Route path="/slack/:channelId" element={<ChannelStub />} />
        </Route>
      </Routes>
    </MemoryRouter>,
    authState,
  );
}

describe("Adversarial Access Gating & Routing Test Harness", () => {
  // =========================================================================
  // 1. DOMAIN SPOOFING & SUBDOMAIN PROBING
  // =========================================================================
  describe("1. Domain Spoofing & Subdomain Probing", () => {
    it("rejects suffix spoofing on Karthik's gmail", () => {
      const spoofed = [
        "kk.chinthalapati@gmail.com.attacker.com",
        "kk.chinthalapati@gmail.com@attacker.com",
        "kk.chinthalapati@gmail.com.evil.org",
        "kk.chinthalapati@gmail.com.fake",
        "kk.chinthalapati@gmail.com.co",
      ];
      for (const email of spoofed) {
        expect(isFounder(makeUser({ email }))).toBe(false);
      }
    });

    it("rejects suffix spoofing on learnora.dev domain", () => {
      const spoofed = [
        "karthik@learnora.dev.fake",
        "karthik@learnora.dev.attacker.com",
        "nirav@learnora.dev.attacker.com",
        "karthik@learnora.dev.evil.io",
        "nirav@learnora.dev.co.uk",
      ];
      for (const email of spoofed) {
        expect(isFounder(makeUser({ email }))).toBe(false);
      }
    });

    it("rejects subdomain variations on learnora.dev or gmail", () => {
      const subdomains = [
        "karthik@sub.learnora.dev",
        "karthik@corp.learnora.dev",
        "nirav@staging.learnora.dev",
        "kk.chinthalapati@mail.gmail.com",
        "kk.chinthalapati@googlemail.com",
      ];
      for (const email of subdomains) {
        expect(isFounder(makeUser({ email }))).toBe(false);
      }
    });

    it("rejects prefix spoofing variations", () => {
      const prefixed = [
        "fake_kk.chinthalapati@gmail.com",
        "notkarthik@learnora.dev",
        "fake.nirav@learnora.dev",
        "iamkarthik@learnora.dev",
        "admin-nirav@learnora.dev",
      ];
      for (const email of prefixed) {
        expect(isFounder(makeUser({ email }))).toBe(false);
      }
    });

    it("rejects URL and path injection in email addresses", () => {
      const injected = [
        "kk.chinthalapati@gmail.com?admin=true",
        "karthik@learnora.dev#admin",
        "karthik@learnora.dev/admin",
        "nirav@learnora.dev%00",
      ];
      for (const email of injected) {
        expect(isFounder(makeUser({ email }))).toBe(false);
      }
    });

    it("rejects unicode / Cyrillic homoglyph lookalikes", () => {
      // Cyrillic small letter 'а' (U+0430) instead of Latin 'a'
      const homoglyph1 = "kаrthik@learnora.dev"; // cyrillic 'а'
      const homoglyph2 = "nirаv@learnora.dev"; // cyrillic 'а'
      expect(isFounder(makeUser({ email: homoglyph1 }))).toBe(false);
      expect(isFounder(makeUser({ email: homoglyph2 }))).toBe(false);
    });

    it("handles extreme whitespace and mixed case safely", () => {
      expect(isFounder(makeUser({ email: "   KK.CHINTHALAPATI@GMAIL.COM   " }))).toBe(true);
      expect(isFounder(makeUser({ email: "\tKARTHIK@LEARNORA.DEV\n" }))).toBe(true);
      expect(isFounder(makeUser({ email: "  NiRaV@LeArNoRa.DeV  " }))).toBe(true);
    });
  });

  // =========================================================================
  // 2. USER OBJECT BOUNDARY & MALFORMED INPUTS
  // =========================================================================
  describe("2. Malformed User Objects & Edge Cases", () => {
    it("handles null, undefined, and empty objects safely without throwing", () => {
      expect(isFounder(null)).toBe(false);
      expect(isFounder(undefined)).toBe(false);
      expect(isFounder({} as User)).toBe(false);
      expect(isFounder({ id: "" } as User)).toBe(false);
      expect(isFounder({ email: "" } as User)).toBe(false);
      expect(isFounder({ email: "   " } as User)).toBe(false);
    });

    it("handles user with missing ID but valid founder email", () => {
      const userWithoutId = {
        email: "karthik@learnora.dev",
      } as unknown as User;
      expect(isFounder(userWithoutId)).toBe(true);
    });

    it("handles user with missing email but valid founder ID", () => {
      const userWithoutEmail = {
        id: "u-nirav",
      } as unknown as User;
      expect(isFounder(userWithoutEmail)).toBe(true);
    });

    it("handles non-string email safely and returns false instead of throwing TypeError", () => {
      const malformedUser = {
        id: "attacker-1",
        email: true, // boolean or non-string from corrupted token/storage
      } as unknown as User;

      expect(isFounder(malformedUser)).toBe(false);
    });

    it("rejects dev bypass: user_metadata full_name does not authorise attacker in DEV", () => {
      const devAttacker = makeUser({
        email: "attacker@evil.com",
        id: "attacker-uuid",
        user_metadata: { full_name: "karthik" },
      });

      const authorizedInDev = isFounder(devAttacker);
      expect(authorizedInDev).toBe(false);
    });

    it("permits explicit dev harness account in DEV mode", () => {
      const harnessUser = makeUser({
        email: "harness@learnora.dev",
        id: "harness-uuid",
      });
      expect(isFounder(harnessUser)).toBe(true);
    });

    it("getFounderProfile returns null for unauthorized or empty users", () => {
      expect(getFounderProfile(null)).toBeNull();
      expect(getFounderProfile(undefined)).toBeNull();
      expect(getFounderProfile({} as User)).toBeNull();
      expect(getFounderProfile(makeUser({ email: "student@example.com" }))).toBeNull();
    });

    it("getFounderProfile produces correct profile for Karthik and Nirav", () => {
      const karthik = getFounderProfile(makeUser({ email: "kk.chinthalapati@gmail.com" }));
      expect(karthik?.name).toBe("Karthik");
      expect(karthik?.role).toBe("strategy");

      const nirav = getFounderProfile(makeUser({ email: "nirav@learnora.dev" }));
      expect(nirav?.name).toBe("Nirav");
      expect(nirav?.role).toBe("operations");
    });
  });

  // =========================================================================
  // 3. FOUNDERGATE BOUNDARY CONDITIONS
  // =========================================================================
  describe("3. FounderGate Boundary Conditions", () => {
    it("handles loading state without premature redirection or rendering content", () => {
      renderGatedRoute("/slack", { loading: true, session: null, user: null });

      expect(screen.getByRole("status", { name: "Loading Founder Workspace" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Student Dashboard" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Founders Slack Channel" })).not.toBeInTheDocument();
    });

    it("handles null session & null user: redirects to /login with target location in state", () => {
      renderGatedRoute("/slack/strategy", { loading: false, session: null, user: null });

      expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
      expect(screen.getByTestId("from")).toHaveTextContent("/slack/strategy");
      expect(screen.queryByRole("heading", { name: "Founders Slack Channel" })).not.toBeInTheDocument();
    });

    it("handles session exists but user is null: redirects to /login", () => {
      renderGatedRoute("/slack/tech", {
        loading: false,
        session: fakeSession(),
        user: null,
      });

      expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
      expect(screen.getByTestId("from")).toHaveTextContent("/slack/tech");
    });

    it("handles user exists but session is null: redirects to /login", () => {
      renderGatedRoute("/slack/product", {
        loading: false,
        session: null,
        user: makeUser({ email: "kk.chinthalapati@gmail.com" }),
      });

      expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
      expect(screen.getByTestId("from")).toHaveTextContent("/slack/product");
    });

    it("handles authenticated non-founder (student): redirects to / with denied flag", () => {
      const student = makeUser({ email: "student@example.com" });
      renderGatedRoute("/slack/product", {
        loading: false,
        session: fakeSession({ email: "student@example.com" }),
        user: student,
      });

      expect(screen.getByRole("heading", { level: 1, name: "Student Dashboard" })).toBeInTheDocument();
      expect(screen.getByTestId("denied-flag")).toHaveTextContent("denied:founders_only");
      expect(screen.queryByRole("heading", { name: "Founders Slack Channel" })).not.toBeInTheDocument();
    });

    it("handles authenticated attacker with spoofed email: blocked from /slack", () => {
      const attacker = makeUser({ email: "karthik@learnora.dev.attacker.com" });
      renderGatedRoute("/slack", {
        loading: false,
        session: fakeSession({ email: "karthik@learnora.dev.attacker.com" }),
        user: attacker,
      });

      expect(screen.getByRole("heading", { level: 1, name: "Student Dashboard" })).toBeInTheDocument();
      expect(screen.getByTestId("denied-flag")).toHaveTextContent("denied:founders_only");
      expect(screen.queryByRole("heading", { name: "Founders Slack Channel" })).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. DEEP LINK DIRECT ACCESS PROBING
  // =========================================================================
  describe("4. Deep Link Direct Access Probing", () => {
    const channels = ["general", "product", "strategy", "tech", "secret-roadmap", "admin-console"];

    for (const ch of channels) {
      it(`blocks unauthorized student from deep link /slack/${ch}`, () => {
        const student = makeUser({ email: "student123@school.edu" });
        renderGatedRoute(`/slack/${ch}`, {
          loading: false,
          session: fakeSession({ email: "student123@school.edu" }),
          user: student,
        });

        expect(screen.getByRole("heading", { level: 1, name: "Student Dashboard" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Founders Slack Channel" })).not.toBeInTheDocument();
      });

      it(`permits authenticated founder Nirav to deep link /slack/${ch}`, () => {
        const nirav = makeUser({ email: "nirav@learnora.dev", id: "u-nirav" });
        renderGatedRoute(`/slack/${ch}`, {
          loading: false,
          session: fakeSession({ email: "nirav@learnora.dev", id: "u-nirav" }),
          user: nirav,
        });

        expect(screen.getByRole("heading", { level: 1, name: "Founders Slack Channel" })).toBeInTheDocument();
        expect(screen.getByTestId("channel-path")).toHaveTextContent(`/slack/${ch}`);
      });
    }

    it("permits authenticated founder Karthik to deep link /slack with query and hash", () => {
      const karthik = makeUser({ email: "kk.chinthalapati@gmail.com", id: "u-karthik" });
      renderGatedRoute("/slack/strategy?filter=unread#msg-123", {
        loading: false,
        session: fakeSession({ email: "kk.chinthalapati@gmail.com", id: "u-karthik" }),
        user: karthik,
      });

      expect(screen.getByRole("heading", { level: 1, name: "Founders Slack Channel" })).toBeInTheDocument();
      expect(screen.getByTestId("channel-path")).toHaveTextContent("/slack/strategy");
    });
  });
});
