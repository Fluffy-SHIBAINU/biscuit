import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 960 } });
await p.goto("file:///Users/grey/Desktop/dev/biscuit/video/assets/bill.html"); await p.screenshot({ path: "assets/bill.png" }); await b.close();
console.log("bill.png");
