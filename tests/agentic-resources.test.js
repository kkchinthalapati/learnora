const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const content = require(path.join(root, "api", "_site-content"));
const home = require(path.join(root, "api", "home"));
const notFound = require(path.join(root, "api", "not-found"));
const mcp = require(path.join(root, "api", "mcp"));
const productInfo = require(path.join(root, "api", "public-product-info"));

function response() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.setHeader("Content-Type", "application/json; charset=utf-8"); this.body = JSON.stringify(body); return this; },
    end(body = "") { this.body = body; return this; },
  };
}

test("homepage negotiates a Markdown representation and varies on Accept", () => {
  const res = response();
  home({ headers: { accept: "text/markdown" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "text/markdown; charset=utf-8");
  assert.equal(res.headers.vary, "Accept, Accept-Encoding");
  assert.match(res.body, /^# Learnora/m);
  assert.match(res.body, /\/api\/mcp/);
  assert.match(res.body, /\.well-known\/mcp/);
});

test("homepage HTML is server-rendered, semantic, and machine-identifiable", () => {
  const res = response();
  home({ headers: { accept: "text/html" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
  assert.match(res.body, /<html lang="en">/);
  assert.match(res.body, /<h1>.*<\/h1>/s);
  assert.match(res.body, /<h2[^>]*>/);
  assert.ok(res.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length > 500);
  assert.match(res.body, /rel="canonical"/);
  assert.match(res.body, /property="og:type" content="website"/);
  assert.match(res.body, /property="og:image"/);
  assert.match(res.body, /application\/ld\+json/);
  assert.match(res.body, /"SoftwareApplication"/);
  assert.match(res.body, /"Organization"/);
  assert.match(res.body, /"contactPoint"/);
  assert.match(res.body, /"PostalAddress"/);
});

test("a non-existent route has a real 404 and a Markdown recovery body", () => {
  const res = response();
  notFound({ headers: { accept: "text/markdown" } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.headers["content-type"], "text/markdown; charset=utf-8");
  assert.equal(res.headers.vary, "Accept, Accept-Encoding");
  assert.match(res.body, /^# 404 — Page not found/m);
  assert.match(res.body, /sitemap\.xml/);
  assert.match(res.body, /llms\.txt/);
});

test("MCP endpoint supports initialization, tool discovery, and the public-info tool", () => {
  for (const [body, expected] of [
    [{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2026-07-28" } }, "initialize"],
    [{ jsonrpc: "2.0", id: 2, method: "tools/list" }, "tools/list"],
    [{ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_learnora_product_information", arguments: {} } }, "tools/call"],
  ]) {
    const res = response();
    mcp({ method: "POST", body }, res);
    const payload = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(payload.jsonrpc, "2.0");
    assert.equal(payload.id, body.id);
    if (expected === "initialize") {
      assert.equal(payload.result.serverInfo.name, "learnora");
      assert.equal(payload.result.protocolVersion, "2026-07-28");
    }
    if (expected === "tools/list") assert.equal(payload.result.tools[0].name, "get_learnora_product_information");
    if (expected === "tools/call") assert.equal(payload.result.structuredContent.name, "Learnora");
  }
});

test("MCP endpoint handles CORS preflight, rejects GET, and validates Origin", () => {
  const preflight = response();
  mcp({ method: "OPTIONS" }, preflight);
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers["access-control-allow-methods"], "POST, OPTIONS");
  assert.equal(preflight.headers.vary, "Origin");

  const get = response();
  mcp({ method: "GET" }, get);
  assert.equal(get.statusCode, 405);
  assert.equal(get.headers.allow, "POST, OPTIONS");

  const forbidden = response();
  mcp({ method: "POST", headers: { origin: "https://untrusted.example" }, body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } }, forbidden);
  assert.equal(forbidden.statusCode, 403);
});

test("public discovery files have valid, cross-linked content", () => {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const sitemap = read("sitemap.xml");
  const llms = read("llms.txt");
  const openapi = JSON.parse(read("openapi.json"));

  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.equal((sitemap.match(/<url>/g) || []).length, 7);
  assert.match(sitemap, /<lastmod>2026-08-22<\/lastmod>/);
  assert.match(llms, /## When to use Learnora/);
  assert.match(llms, /\.well-known\/mcp/);
  assert.equal(openapi.openapi, "3.1.0");
  assert.ok(openapi.paths["/api/product-info"]);
  const discovery = JSON.parse(read(".well-known/mcp"));
  assert.equal(content.publicProductInfo().mcp, "https://learnora-app.vercel.app/api/mcp");
  assert.equal(discovery.endpoint, content.publicProductInfo().mcp);
});

test("trust pages contain substantive content and the build copies every public resource", () => {
  const textOnly = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  for (const file of ["about.html", "contact.html", "privacy.html"]) assert.ok(textOnly(file).length > 500, `${file} should contain 500+ characters of readable text`);

  const build = fs.readFileSync(path.join(root, "scripts", "build.sh"), "utf8");
  const copiedPaths = build.match(/VANILLA_PATHS=\(([\s\S]*?)\)/)?.[1] ?? "";
  assert.doesNotMatch(copiedPaths, /^\s+index\.html$/m, "the legacy root shell must not bypass the server-rendered homepage rewrite");
  for (const file of ["public.css", "about.html", "contact.html", "privacy.html", "developers.html", "llms.txt", "openapi.json", "sitemap.xml", "robots.txt"]) assert.match(build, new RegExp(`\\b${file.replace(".", "\\.")}\\b`));
  assert.match(build, /\.well-known/);
});

test("public product-info endpoint returns the documented JSON payload", () => {
  const res = response();
  productInfo({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).developerDocumentation, "https://learnora-app.vercel.app/developers");
});
