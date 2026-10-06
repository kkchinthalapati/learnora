#!/usr/bin/env node
// Learnora tutor evals: hint ladders, explanations, the question checker and
// the misconception labeller, against evals/fixtures.json (100 prompts).
//
// Not part of any test suite and never run in CI. You run it, with your own
// key, read from the environment only:
//
//   GEMINI_API_KEY=...    node evals/run.mjs --provider gemini
//   OPENAI_API_KEY=...    node evals/run.mjs --provider openai
//   ANTHROPIC_API_KEY=... node evals/run.mjs --provider anthropic
//
// Options:
//   --provider gemini|openai|anthropic   (default: gemini)
//   --model <name>                       (or EVAL_MODEL; defaults below match the app's)
//   --only hint_step|explanation|quiz_question|misconception_match
//   --limit <n>                          first n fixtures after filtering
//   --concurrency <n>                    parallel requests (default 3)
//   --dry-run                            print prompts, call nothing
//
// Prints a pass/fail table and writes evals/results/<timestamp>.json
// (git-ignored). Exit code 1 if anything failed.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { grade, promptFor } from "./grade.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

// The app's own defaults (supabase/functions/learnora-ai/index.ts).
const PROVIDERS = {
  gemini: { keyEnv: "GEMINI_API_KEY", model: "gemini-3.6-flash" },
  openai: { keyEnv: "OPENAI_API_KEY", model: "gpt-4o-mini" },
  anthropic: { keyEnv: "ANTHROPIC_API_KEY", model: "claude-3-5-haiku-20241022" },
};

async function call(provider, model, key, { system, user }) {
  const signal = AbortSignal.timeout(60_000);
  if (provider === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      },
    );
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  }
  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json())?.choices?.[0]?.message?.content ?? "";
  }
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        temperature: 0.2,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json())?.content?.map((c) => c.text ?? "").join("") ?? "";
  }
  throw new Error(`unknown provider ${provider}`);
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function main() {
  const provider = String(arg("provider", "gemini"));
  const spec = PROVIDERS[provider];
  if (!spec) throw new Error(`--provider must be one of ${Object.keys(PROVIDERS).join(", ")}`);
  const model = String(arg("model", process.env.EVAL_MODEL || spec.model));
  const only = arg("only", null);
  const limit = Number(arg("limit", 0)) || 0;
  const dry = arg("dry-run", false) === true;

  let fixtures = JSON.parse(readFileSync(join(here, "fixtures.json"), "utf8")).fixtures;
  if (only) fixtures = fixtures.filter((f) => f.type === only);
  if (limit) fixtures = fixtures.slice(0, limit);

  if (dry) {
    for (const f of fixtures) {
      const p = promptFor(f);
      console.log(`\n=== ${f.id} (${f.type}) ===\n${p.system ? `[system]\n${p.system}\n\n` : ""}${p.user}`);
    }
    return;
  }

  const key = process.env[spec.keyEnv];
  if (!key) throw new Error(`Set ${spec.keyEnv} in the environment (it is never read from a file).`);

  console.log(`Running ${fixtures.length} evals on ${provider}/${model}…`);
  const results = await pool(fixtures, Number(arg("concurrency", 3)) || 3, async (f) => {
    const started = Date.now();
    try {
      const reply = await call(provider, model, key, promptFor(f));
      return { id: f.id, type: f.type, subject: f.subject, level: f.level, ...grade(f, reply), ms: Date.now() - started, reply };
    } catch (err) {
      return { id: f.id, type: f.type, subject: f.subject, level: f.level, pass: false, reason: `error: ${err.message}`, ms: Date.now() - started };
    }
  });

  const width = Math.max(...results.map((r) => r.id.length), 4);
  console.log(`\n${"id".padEnd(width)}  result  reason`);
  for (const r of results) console.log(`${r.id.padEnd(width)}  ${r.pass ? "PASS  " : "FAIL  "}  ${r.reason}`);

  const byType = {};
  for (const r of results) {
    byType[r.type] ??= { pass: 0, total: 0 };
    byType[r.type].total += 1;
    if (r.pass) byType[r.type].pass += 1;
  }
  console.log("\nSummary");
  for (const [type, s] of Object.entries(byType)) console.log(`  ${type.padEnd(20)} ${s.pass}/${s.total}`);
  const passed = results.filter((r) => r.pass).length;
  console.log(`  ${"total".padEnd(20)} ${passed}/${results.length}`);

  const dir = join(here, "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${provider}.json`);
  writeFileSync(file, JSON.stringify({ provider, model, byType, results }, null, 2));
  console.log(`\nWrote ${file}`);
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 2;
});
