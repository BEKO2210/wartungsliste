#!/usr/bin/env node
/**
 * Automated smoke tests for Wartungsliste (Playwright).
 * Run from repo root: npm test
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/") urlPath = "/index.html";
      const filePath = join(ROOT, urlPath.replace(/^\//, ""));
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const data = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const { server, base } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const results = [];

  // 1) No console errors on load
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  results.push({
    name: "keine Console-Errors",
    ok: errors.length === 0,
    detail: errors.slice(0, 5).join(" | ") || "ok",
  });

  // 2) localStorage persistence
  await page.evaluate(() => {
    const inp = document.getElementById("inp-schicht");
    inp.value = "TEST-SCHICHT- Persistenz";
    updateMetaFromInputs();
    persistState();
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const schicht = await page.evaluate(() => document.getElementById("inp-schicht").value);
  results.push({
    name: "localStorage-Persistenz",
    ok: schicht === "TEST-SCHICHT- Persistenz",
    detail: `schicht=${JSON.stringify(schicht)}`,
  });

  // 3) Export / Import roundtrip
  const exported = await page.evaluate(() => {
    const payload = {
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      app: "wartungsliste",
      data: getAppState(),
    };
    return JSON.stringify(payload);
  });
  await page.evaluate(() => {
    document.getElementById("inp-schicht").value = "ANDERS";
    updateMetaFromInputs();
    persistState();
  });
  const afterChange = await page.evaluate(() => document.getElementById("inp-schicht").value);
  assert(afterChange === "ANDERS", "precondition failed");

  await page.evaluate((json) => {
    const parsed = JSON.parse(json);
    const file = new File([json], "t.json", { type: "application/json" });
    // call importer with a faux File via FileReader path
    importStateJson(file);
  }, exported);
  await page.waitForTimeout(400);
  const afterImport = await page.evaluate(() => document.getElementById("inp-schicht").value);
  results.push({
    name: "Export/Import-Roundtrip",
    ok: afterImport === "TEST-SCHICHT- Persistenz",
    detail: `afterImport=${JSON.stringify(afterImport)}`,
  });

  // Invalid import shows toast (best-effort)
  await page.evaluate(() => {
    const file = new File(["{not-json"], "bad.json", { type: "application/json" });
    importStateJson(file);
  });
  await page.waitForTimeout(300);
  const toast = await page.evaluate(() => document.getElementById("app-toast").textContent || "");
  results.push({
    name: "Import-Validierung (Fehlertoast)",
    ok: /fehlgeschlagen|ungültig|Import/i.test(toast),
    detail: toast.slice(0, 120),
  });

  await browser.close();
  server.close();

  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL";
    if (!r.ok) failed++;
    console.log(`${mark}  ${r.name} — ${r.detail}`);
  }
  if (failed) {
    console.error(`\n${failed} Test(s) fehlgeschlagen.`);
    process.exit(1);
  }
  console.log(`\nAlle ${results.length} Tests bestanden.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
