import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QUOTAS } from "./entitlements";

/* The server keeps its own copy of the daily allowances (AI_TOOL_QUOTAS in
   supabase/functions/learnora-ai/index.ts), because the function is Deno and
   shares no imports with the app. The two must agree, or the meter tells a
   student one number and the server enforces another. */
describe("free-tier allowances match the server", () => {
  it("has the same daily numbers in the app and the edge function", () => {
    const source = readFileSync(
      resolve(process.cwd(), "../supabase/functions/learnora-ai/index.ts"),
      "utf8",
    );
    const start = source.indexOf("const AI_TOOL_QUOTAS");
    const free = source.slice(source.indexOf("free: {", start), source.indexOf("},", source.indexOf("free: {", start)));
    for (const [tool, value] of Object.entries(QUOTAS.free)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      if (tool === "importedCalendars" || tool === "notebooks") continue;
      const entry = new RegExp(`(^|[\\s,{])${tool}: ${value}(?![0-9])`);
      expect(entry.test(free), `server free ${tool}`).toBe(true);
    }
  });
});
