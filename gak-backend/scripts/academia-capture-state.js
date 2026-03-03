#!/usr/bin/env node
/**
 * One-time helper: opens SRM Academia sign-in in a real browser window (headed),
 * lets you solve captcha / session prompts, then saves Playwright storageState.
 *
 * This tool does NOT bypass captcha. It waits until you complete the challenge
 * and the portal loads, then persists session cookies/storage for headless sync.
 *
 * Usage:
 *   cd gak-backend
 *   SRM_EMAIL='...' SRM_PASSWORD='...' node scripts/academia-capture-state.js
 *
 * Output:
 *   Writes storage state to ./tmp/academia_storage_state.json by default.
 */
const path = require("path");
const fs = require("fs");

let playwright = null;
try {
  playwright = require("playwright");
} catch (_error) {
  console.error("Playwright is not installed. Run: cd gak-backend && npm i playwright && npx playwright install chromium");
  process.exit(1);
}

async function main() {
  const email = String(process.env.SRM_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.SRM_PASSWORD || "");
  const outputPath = String(process.env.ACADEMIA_STORAGE_STATE_OUT || "").trim()
    || path.join(process.cwd(), "tmp", "academia_storage_state.json");

  if (!email || !password) {
    console.error("Missing SRM_EMAIL or SRM_PASSWORD env vars.");
    process.exit(2);
  }

  const signinUrl = String(process.env.ACADEMIA_SIGNIN_URL || "https://academia.srmist.edu.in").trim();
  const allowTerminate = String(process.env.ACADEMIA_TERMINATE_SESSIONS_ON_LIMIT || "").toLowerCase() === "true";

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const browser = await playwright.chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log("Opening SRM login window...");
  await page.goto(signinUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("iframe#signinFrame", { timeout: 30000 });
  const frame = await (await page.$("iframe#signinFrame")).contentFrame();

  await frame.fill("#login_id", email);
  await frame.click("#nextbtn");
  await frame.waitForSelector("#password", { state: "visible", timeout: 60000 });
  await frame.fill("#password", password);
  await frame.click("#nextbtn");

  console.log("If you see captcha or session-limit prompts, complete them in the opened browser window.");
  console.log("Waiting for the SRM portal to load...");

  const timeoutMs = Math.max(60_000, Number(process.env.ACADEMIA_CAPTURE_TIMEOUT_MS || 5 * 60 * 1000));
  const start = Date.now();

  // Wait loop: handle session-limit interstitial, then detect portal.
  while (Date.now() - start < timeoutMs) {
    const url = String(page.url() || "");
    const title = String(await page.title().catch(() => ""));
    const bodyText = String(await page.textContent("body").catch(() => "")).toLowerCase();

    const sessionLimit = url.includes("block-sessions") || bodyText.includes("maximum concurrent sessions");
    if (sessionLimit) {
      if (!allowTerminate) {
        throw new Error(
          "Session limit exceeded. Set ACADEMIA_TERMINATE_SESSIONS_ON_LIMIT=true and re-run to auto-terminate sessions, or manually sign out from other devices."
        );
      }
      // Click terminate and continue waiting.
      await page
        .locator("button:has-text('Terminate All Sessions'), button:has-text('Terminate all sessions')")
        .first()
        .click({ timeout: 5000 })
        .catch(() => undefined);
      await page.waitForTimeout(2500);
      continue;
    }

    // Portal heuristic: login iframe is gone and page has portal-ish content.
    const hasLoginIframe = await page.locator("iframe#signinFrame").count().catch(() => 0);
    const portalLike =
      bodyText.includes("quick access")
      || bodyText.includes("welcome")
      || bodyText.includes("student profile")
      || bodyText.includes("academic reports unified");

    const looksLikeLogin =
      title.toLowerCase().includes("login")
      || bodyText.includes("forgot password")
      || bodyText.includes("sign in to access");

    if (!hasLoginIframe && portalLike && !looksLikeLogin) {
      console.log(`Portal detected at: ${url}`);
      break;
    }

    await page.waitForTimeout(1500);
  }

  await context.storageState({ path: outputPath });
  console.log(`Saved storageState to: ${outputPath}`);

  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
