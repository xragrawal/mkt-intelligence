/**
 * Facebook Login & Cookie Capture
 *
 * Launches a headed browser, prompts user to log in to Facebook,
 * and captures session cookies for later use.
 *
 * Usage:
 *   npx tsx lib/facebook/loginFacebookAndSaveCookies.ts
 *   or: npm run facebook:login
 */

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { saveCookiesToFile } from "./cookies.js";

// Register stealth plugin
puppeteer.use(StealthPlugin());

const LOGIN_URL = "https://www.facebook.com/login";
const MAX_LOGIN_ATTEMPTS = 150; // ~5 minutes at 2s intervals
const CHECK_INTERVAL = 2000; // 2 seconds

async function loginAndCaptureCookies() {
  let browser;

  try {
    console.log("🔐 Launching Facebook login browser...\n");

    // Launch browser (headed, not headless, so user can see/interact)
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    browser = await puppeteer.launch({
      headless: false,
      executablePath: execPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1280,900",
      ],
    });

    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Set viewport
    await page.setViewport({ width: 1280, height: 900 });

    console.log(`📍 Navigating to ${LOGIN_URL}`);
    console.log("ℹ️  Please log in in the browser window that opens...\n");

    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

    // Wait for login success (poll every 2 seconds)
    let loggedIn = false;
    let attempts = 0;

    while (!loggedIn && attempts < MAX_LOGIN_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL));
      attempts++;

      const currentUrl = page.url();

      // Check URL — logged in if we're on facebook.com and NOT on login/checkpoint pages
      const isLoggedInByUrl =
        currentUrl.includes("facebook.com") &&
        !currentUrl.includes("/login") &&
        !currentUrl.includes("/checkpoint") &&
        !currentUrl.includes("/recover") &&
        !currentUrl.includes("/two_step_verification");

      if (isLoggedInByUrl) {
        loggedIn = true;
        console.log("✓ Login URL detected");
        break;
      }

      // Check for c_user cookie as backup
      const cookies = await page.cookies();
      const cUserCookie = cookies.find((c: any) => c.name === "c_user");
      if (cUserCookie && cUserCookie.value) {
        loggedIn = true;
        console.log("✓ c_user cookie detected");
        break;
      }

      // Warn if checkpoint/challenge page detected
      if (currentUrl.includes("/checkpoint")) {
        console.log(
          "⏳ Facebook checkpoint detected — please complete the verification in the browser window"
        );
        console.log("   Continuing to poll (up to 5 minutes)...\n");
      }

      if (attempts % 10 === 0) {
        console.log(`  Polling... (${Math.round((attempts * CHECK_INTERVAL) / 1000)}s)`);
      }
    }

    if (!loggedIn) {
      throw new Error(
        `Login timeout after ${(attempts * CHECK_INTERVAL) / 1000}s. Please try again.`
      );
    }

    // Wait a bit for page to settle
    console.log("\n⏳ Settling session...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Capture all cookies
    console.log("📸 Capturing cookies...");
    const allCookies = await page.cookies();

    if (allCookies.length === 0) {
      throw new Error("No cookies captured from Facebook");
    }

    // Verify c_user is present
    const cUser = allCookies.find((c: any) => c.name === "c_user");
    if (!cUser || !cUser.value) {
      throw new Error("c_user cookie not found in captured cookies");
    }

    console.log(`✓ Captured ${allCookies.length} cookies`);
    console.log(`✓ c_user: ${cUser.value.slice(0, 6)}...${cUser.value.slice(-4)}`);

    // Check for secondary session cookies
    const hasXs = allCookies.some((c: any) => c.name === "xs" && c.value?.length > 0);
    const hasDater = allCookies.some(
      (c: any) => c.name === "datr" && c.value?.length > 0
    );
    const hasSb = allCookies.some((c: any) => c.name === "sb" && c.value?.length > 0);

    if (!(hasXs || hasDater || hasSb)) {
      console.warn(
        "⚠️  Warning: Secondary session cookies (xs, datr, sb) not found. Session may not persist."
      );
    }

    // Save cookies
    console.log("\n💾 Saving cookies...");
    saveCookiesToFile(allCookies);

    console.log("✨ Login successful! Cookies saved.");
    console.log(`\nNext steps:`);
    console.log(`1. Run: npm run facebook:server`);
    console.log(`2. Use the Facebook checkbox in the app to collect posts\n`);

    // Keep browser open for a few more seconds so user can see success
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error: any) {
    console.error("\n❌ Login failed:", error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

loginAndCaptureCookies();
