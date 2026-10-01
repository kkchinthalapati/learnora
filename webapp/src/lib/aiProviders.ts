/* The AI providers a student's request may be sent to — what the sign-up
 * consent, the first-use consent dialog, Settings ▸ Privacy and the privacy
 * policy tell students.
 *
 * These screens used to name only Anthropic and Google while the edge
 * function's fallback chain reached Cerebras, Groq, GitHub Models and
 * Mistral as well. The edge function now refuses any provider not listed in
 * supabase/functions/_shared/providerPolicy.js, and
 * tests/provider-disclosure.test.js requires this list to match it id for
 * id, so the two cannot drift apart again. */

export interface AiProviderDisclosure {
  id: string;
  /** What the student will recognise: the company. */
  company: string;
  /** The service or model family, for the policy's detail. */
  service: string;
  /** Primary handles most requests; backup is only reached when a primary
   *  provider is down or out of capacity. */
  role: "primary" | "backup";
}

export const AI_PROVIDERS: readonly AiProviderDisclosure[] = [
  { id: "gemini", company: "Google", service: "Gemini", role: "primary" },
  { id: "anthropic", company: "Anthropic", service: "Claude", role: "primary" },
  { id: "cerebras", company: "Cerebras", service: "Cerebras Inference (open models)", role: "backup" },
  { id: "groq", company: "Groq", service: "GroqCloud (open models)", role: "backup" },
  { id: "cloudflare", company: "Cloudflare", service: "Workers AI (open models)", role: "backup" },
  { id: "github-models", company: "GitHub (Microsoft)", service: "GitHub Models", role: "backup" },
  { id: "openrouter", company: "OpenRouter", service: "OpenRouter (open models)", role: "backup" },
  { id: "nvidia", company: "NVIDIA", service: "NVIDIA NIM (open models)", role: "backup" },
  { id: "openai", company: "OpenAI", service: "OpenAI API", role: "backup" },
];

const companies = (role: AiProviderDisclosure["role"]) =>
  AI_PROVIDERS.filter((p) => p.role === role).map((p) => p.company);

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Google (Gemini) and Anthropic (Claude)". */
export const PRIMARY_PROVIDERS_TEXT = list(
  AI_PROVIDERS.filter((p) => p.role === "primary").map((p) => `${p.company} (${p.service})`),
);

/** "Cerebras, Groq, Cloudflare, …". */
export const BACKUP_PROVIDERS_TEXT = list(companies("backup"));

/** One sentence for a consent prompt: names the main providers and says
 *  plainly that backups exist, without a nine-company list in a checkbox. */
export const AI_PROVIDERS_SHORT = `${PRIMARY_PROVIDERS_TEXT}, or a backup provider listed in the Privacy Policy when those are unavailable`;
