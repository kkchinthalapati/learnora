/* Deterministic frame renderer: seeks the GSAP master timeline to t = i / FPS and screenshots the 1080x1920 stage. */
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
const require = createRequire("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/package.json");
const { chromium } = require("playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPS = 60, DURATION = 29.0;
const OUT = path.join(HERE, "frames");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
p.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
await p.goto(pathToFileURL(path.join(HERE, "ad.html")).href);
await p.waitForFunction(() => window.AD_READY === true, null, { timeout: 30000 });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1200);

const n = Math.round(DURATION * FPS);
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const t = i / FPS;
  await p.evaluate((x) => { window.TL.time(x, false); }, t);
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const buf = await p.screenshot({ type: "jpeg", quality: 94 });
  fs.writeFileSync(path.join(OUT, `f${String(i).padStart(5, "0")}.jpg`), buf);
  if (i % 60 === 0) console.log(`frame ${i}/${n}  t=${t.toFixed(2)}s  elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await b.close();
console.log("DONE", n, "frames in", ((Date.now() - t0) / 1000).toFixed(0), "s");
