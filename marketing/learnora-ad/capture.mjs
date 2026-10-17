import { createRequire } from "module";
import fs from "fs";
const require = createRequire("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/package.json");
const { chromium } = require("playwright");
const browser = await chromium.launch();
const mk = async (h) => { const c = await browser.newContext({ viewport: { width: 390, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); return c.newPage(); };
const U = (r) => `http://localhost:5199/app/harness.html?route=${encodeURIComponent(r)}`;
const boxes = {};
const box = async (p, name, loc) => { const b = await loc.first().boundingBox(); boxes[name] = b; };
const settle = (p, ms = 3200) => p.waitForTimeout(ms);
let p = await mk(844);
// quiz
await p.goto(U("/quiz/q-1")); await settle(p);
await box(p, "fairly", p.getByRole("button", { name: "Fairly sure" }));
await box(p, "catalysts", p.getByRole("button", { name: "Catalysts" }));
await p.screenshot({ path: "assets/quiz0.png" });
await p.getByRole("button", { name: "Fairly sure" }).click(); await p.waitForTimeout(500);
await p.screenshot({ path: "assets/quiz1.png" });
await p.getByRole("button", { name: "Catalysts" }).click(); await p.waitForTimeout(900);
await p.screenshot({ path: "assets/quiz2.png" });
// flashcard
await p.goto(U("/review/d-bio")); await settle(p);
await p.getByRole("button", { name: /start review/i }).click(); await p.waitForTimeout(900);
await p.screenshot({ path: "assets/card0.png" });
await p.getByText("Click to flip").click(); await p.waitForTimeout(1200);
await p.screenshot({ path: "assets/card1.png" });
// exams / progress / library / timer / plan
for (const [n, r] of [["exams", "/exams"], ["progress", "/analytics"], ["library", "/library"], ["timer", "/timer"], ["study", "/study"]]) {
  await p.goto(U(r)); await settle(p); await p.screenshot({ path: `assets/${n}.png` });
}
// today (tall, nav hidden) + nav strip
const t = await mk(1300);
await t.goto(U("/")); await settle(t, 4200);
await t.screenshot({ path: "assets/today_full.png" });
const navLoc = t.getByRole("navigation").last();
try { await navLoc.screenshot({ path: "assets/nav.png" }); boxes.nav = await navLoc.boundingBox(); } catch (e) { console.log("nav shot failed", String(e).slice(0,100)); }
await t.addStyleTag({ content: "nav{visibility:hidden!important}" });
await t.waitForTimeout(300);
await t.screenshot({ path: "assets/today_tall.png" });
// today normal
await p.goto(U("/")); await settle(p, 4200);
await p.screenshot({ path: "assets/today0.png" });
fs.writeFileSync("assets/boxes.json", JSON.stringify(boxes, null, 1));
console.log(boxes);
await browser.close();
