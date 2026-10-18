import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
const require = createRequire("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/package.json");
const { chromium } = require("playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const times = process.argv.slice(2).map(Number);
const out = path.join(HERE, "prev");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on("console", (m) => { if (["error", "warning"].includes(m.type())) console.log(m.type().toUpperCase(), m.text().slice(0, 200)); });
p.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
console.log("goto"); await p.goto(pathToFileURL(path.join(HERE, "ad.html")).href);
console.log("wait ready"); await p.waitForFunction(() => window.AD_READY === true, null, { timeout: 20000 }).catch(() => console.log("AD_READY never set"));
console.log("fonts"); await p.evaluate(() => document.fonts.ready); console.log("fonts ok");
await p.waitForTimeout(800);
for (const t of times) {
  await p.evaluate((x) => { window.TL.time(x, false); }, t);
  await p.waitForTimeout(60);
  await p.screenshot({ path: path.join(out, `t${String(t).replace(".", "_")}.jpg`), type: "jpeg", quality: 85 });
}
await b.close();
