/**
 * LinkedIn Cookie Export Script
 *
 * Launches a headed Puppeteer browser so you can manually log into LinkedIn.
 * Once logged in, cookies (including li_at) are saved to linkedin-cookies.json.
 *
 * Usage:
 *   npx tsx lib/linkedin/loginLinkedInAndSaveCookies.ts
 */

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { saveCookiesToFile } from "./cookies.js";

puppeteer.use(StealthPlugin());

const LINKEDIN_LOGIN_URL = "https://www.linkedin.com/login";
const LINKEDIN_FEED_URL = "https://www.linkedin.com/feed/";

async function main() {
  console.log("=== LinkedIn Cookie Export ===");
  console.log("A browser window will open. Please log into LinkedIn.");
  console.log("Once you see the LinkedIn feed, cookies will be saved automatically.\n");

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  const browser = await (puppeteer as any).launch({
    headless: false, // Must be headed for manual login
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1280,900",
    ],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // Navigate to LinkedIn login page
  await page.goto(LINKEDIN_LOGIN_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  console.log("Waiting for you to log in...");

  // Poll until we detect the feed page (user has logged in successfully)
  let loggedIn = false;
  const maxWaitMs = 5 * 60 * 1000; // 5 minutes
  const startTime = Date.now();

  while (!loggedIn && Date.now() - startTime < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 2000));

    const currentUrl = page.url();
    if (
      currentUrl.includes("/feed") ||
      currentUrl.includes("/mynetwork") ||
      currentUrl.includes("/messaging")
    ) {
      loggedIn = true;
    }

    // Also check for the li_at cookie directly
    const cookies = await page.cookies();
    const liAt = cookies.find((c: any) => c.name === "li_at");
    if (liAt && liAt.value) {
      loggedIn = true;
    }
  }

  if (!loggedIn) {
    console.error("Timed out waiting for login (5 minutes). Exiting.");
    await browser.close();
    process.exit(1);
  }

  // Give it a moment to settle
  await new Promise((r) => setTimeout(r, 3000));

  // Extract and save cookies
  const cookies = await page.cookies();
  saveCookiesToFile(cookies);

  // Verify li_at is present
  const liAt = cookies.find((c: any) => c.name === "li_at");
  if (liAt) {
    console.log(`\nli_at cookie found (length: ${liAt.value.length})`);
    console.log("Login successful! You can now close the browser.");
  } else {
    console.warn(
      "\nWarning: li_at cookie not found. Login may not have completed properly."
    );
  }

  console.log(`\nTotal cookies saved: ${cookies.length}`);
  console.log("You can now close this browser window.");

  // Keep browser open briefly so user can verify, then close
  await new Promise((r) => setTimeout(r, 5000));
  await browser.close();

  console.log("\nDone! Cookie file is ready for scraping.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
