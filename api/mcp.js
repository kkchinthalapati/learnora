const { publicProductInfo } = require("./_site-content");

const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2025-03-26", "2025-06-18", "2025-11-25", "2026-07-28"]);
const TOOL = {
  name: "get_learnora_product_information",
  title: "Get Learnora product information",
  description: "Returns public Learnora product, documentation, API, and MCP links. It never returns student account or study data.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

function sendJson(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(body));
}

function responseFor(message) {
  const id = message.id;
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: message.params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "learnora", title: "Learnora public information", version: "1.0.0" },
        instructions: "Use this server for public Learnora product information. It cannot access student accounts or private study data.",
      },
    };
  }
  if (message.method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: [TOOL] } };
  if (message.method === "tools/call" && message.params?.name === TOOL.name) {
    const info = publicProductInfo();
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
        structuredContent: info,
      },
    };
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unsupported MCP method: ${message.method}` } };
}

module.exports = (req, res) => {
  const origin = req.headers?.origin;
  if (origin && origin !== "https://learnora-app.vercel.app") {
    return sendJson(res, 403, { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Origin is not allowed." } });
  }
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendJson(res, 405, { error: "Use POST with a JSON-RPC 2.0 MCP request." });
  }
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || req.body.jsonrpc !== "2.0" || typeof req.body.method !== "string") {
    return sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC 2.0 request." } });
  }
  if (req.body.method === "initialize" && req.body.params?.protocolVersion && !SUPPORTED_PROTOCOL_VERSIONS.has(req.body.params.protocolVersion)) {
    return sendJson(res, 400, { jsonrpc: "2.0", id: req.body.id ?? null, error: { code: -32602, message: "Unsupported MCP protocol version.", data: { supported: [...SUPPORTED_PROTOCOL_VERSIONS] } } });
  }
  if (!("id" in req.body)) return res.status(202).end();
  return sendJson(res, 200, responseFor(req.body));
};
