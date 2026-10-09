/* Loads the webapp's TypeScript modules from a plain Node script, through
   Vite (which resolves TypeScript, extensionless imports and JSON), so the
   import rules live in one tested place: src/lib/questionBank/. */
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

export async function withModules(paths, fn) {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../..", import.meta.url)),
    logLevel: "error",
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  try {
    const mods = await Promise.all(paths.map((p) => server.ssrLoadModule(p)));
    return await fn(...mods);
  } finally {
    await server.close();
  }
}
