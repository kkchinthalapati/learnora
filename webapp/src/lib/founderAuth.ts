import type { User } from "@supabase/supabase-js";

/** Default allowlisted emails for Karthik and Nirav. */
export const DEFAULT_FOUNDER_EMAILS: readonly string[] = [
  "kk.chinthalapati@gmail.com",
  "karthik@learnora.dev",
  "nirav@learnora.dev",
];

/** Allowlisted IDs across dev harnesses, SQL fixtures, and production UUIDs. */
export const FOUNDER_IDS: readonly string[] = [
  "00000000-0000-4000-8000-000000000001", // fx.USER_ID (Karthik)
  "00000000-0000-4000-8000-000000000002", // Nirav
  "00000000-0000-0000-0000-00000000000a", // SQL harness karthik
  "00000000-0000-0000-0000-00000000000b", // SQL harness nirav
  "u-karthik",
  "u-nirav",
];

export interface FounderProfile {
  id: string;
  name: "Karthik" | "Nirav";
  role: "strategy" | "operations";
  email: string;
  handle: "karthik" | "nirav";
  title: string;
}

/**
 * Returns any additional founder emails configured via environment variable.
 */
export function getEnvFounderEmails(): string[] {
  const envVal =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_FOUNDER_EMAILS;
  if (!envVal || typeof envVal !== "string") return [];
  return envVal
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Complete list of active founder emails including defaults and environment overrides.
 */
export function getFounderEmails(): string[] {
  const envEmails = getEnvFounderEmails();
  return Array.from(new Set([...DEFAULT_FOUNDER_EMAILS, ...envEmails]));
}

/**
 * Strict check verifying if the authenticated user is Karthik or Nirav.
 */
export function isFounder(user: User | null | undefined): boolean {
  if (!user) return false;

  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : undefined;
  if (email && getFounderEmails().includes(email)) {
    return true;
  }

  if (typeof user.id === "string" && FOUNDER_IDS.includes(user.id)) {
    return true;
  }

  // Development convenience: only permit dev harness when email matches the designated harness email
  const isDev = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
  if (isDev && email === "harness@learnora.dev") {
    return true;
  }

  return false;
}

/**
 * Returns the structured founder profile for an authenticated user, or null if not a founder.
 */
export function getFounderProfile(user: User | null | undefined): FounderProfile | null {
  if (!isFounder(user) || !user) return null;

  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  const rawMetaName = user.user_metadata?.full_name;
  const metaName = typeof rawMetaName === "string" ? rawMetaName.trim().toLowerCase() : "";
  const userId = typeof user.id === "string" ? user.id : "";

  const isKarthik =
    email.includes("chinthalapati") ||
    email.includes("karthik") ||
    metaName.includes("karthik") ||
    userId === "00000000-0000-4000-8000-000000000001" ||
    userId === "00000000-0000-0000-0000-00000000000a" ||
    userId === "u-karthik";

  const safeEmail = typeof user.email === "string" && user.email.trim() ? user.email.trim() : "";
  const safeId = typeof user.id === "string" && user.id ? user.id : "";

  if (isKarthik) {
    return {
      id: safeId || "u-karthik",
      name: "Karthik",
      role: "strategy",
      email: safeEmail || "kk.chinthalapati@gmail.com",
      handle: "karthik",
      title: "Co-Founder & Head of Strategy",
    };
  }

  return {
    id: safeId || "u-nirav",
    name: "Nirav",
    role: "operations",
    email: safeEmail || "nirav@learnora.dev",
    handle: "nirav",
    title: "Co-Founder & Head of Operations",
  };
}
