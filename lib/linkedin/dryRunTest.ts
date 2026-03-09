/**
 * LinkedIn Scraper — Dry Run Test
 *
 * Validates the full pipeline: cookies → browser launch → session → search → extract.
 * Opens a HEADED browser so you can watch the navigation in real time.
 *
 * Usage:
 *   npx tsx lib/linkedin/dryRunTest.ts
 */

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import { loadCookiesFromFile, getCookiesPath } from "./cookies.js";

puppeteer.use(StealthPlugin());

const TEST_KEYWORD = "drone technology";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dryRun() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   LinkedIn Scraper — Dry Run Test        ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // ── Step 1: Validate cookies ──────────────────────────────────────────
  console.log("[Step 1/6] Validating cookies...");
  try {
    const cookiePath = getCookiesPath();
    console.log(`  Cookie file: ${cookiePath}`);
    const cookies = loadCookiesFromFile();
    console.log(`  Cookies loaded: ${cookies.length}`);
    const liAt = cookies.find((c) => c.name === "li_at");
    if (liAt) {
      console.log(`  li_at token: present (${liAt.value.length} chars)`);
    }
    console.log("  ✓ Cookies valid\n");
  } catch (err: any) {
    console.error(`  ✗ Cookie validation failed: ${err.message}`);
    console.error('  → Run "npm run linkedin:login" to generate fresh cookies.');
    process.exit(1);
  }

  // ── Step 2: Launch headed browser ─────────────────────────────────────
  console.log("[Step 2/6] Launching headed browser (you should see a Chrome window)...");
  let browser: Browser | null = null;

  try {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

    browser = await (puppeteer as any).launch({
      headless: false, // Always headed for dry run
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1400,900",
      ],
      defaultViewport: { width: 1400, height: 900 },
    });

    console.log("  ✓ Browser launched\n");
  } catch (err: any) {
    console.error(`  ✗ Browser launch failed: ${err.message}`);
    if (err.message.includes("Could not find Chrome")) {
      console.error("  → Set PUPPETEER_EXECUTABLE_PATH to your Chrome binary.");
    }
    process.exit(1);
  }

  const page = await browser!.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // ── Step 3: Load cookies and establish session ────────────────────────
  console.log("[Step 3/6] Setting cookies and navigating to LinkedIn...");
  try {
    const cookies = loadCookiesFromFile();
    const puppeteerCookies = cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain || ".linkedin.com",
      path: c.path || "/",
      httpOnly: c.httpOnly ?? false,
      secure: c.secure ?? true,
      sameSite: (c.sameSite as "Strict" | "Lax" | "None") || "None",
    }));

    await page.setCookie(...puppeteerCookies);
    await page.goto("https://www.linkedin.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await delay(2000);

    // Check if we're logged in (not on login page)
    const currentUrl = page.url();
    const isLoggedIn =
      currentUrl.includes("/feed") ||
      currentUrl.includes("/mynetwork") ||
      !currentUrl.includes("/login");

    if (isLoggedIn) {
      console.log(`  Current URL: ${currentUrl}`);
      console.log("  ✓ Session is active — logged into LinkedIn\n");
    } else {
      console.warn(`  ⚠ Redirected to login page: ${currentUrl}`);
      console.warn('  → Cookies may be expired. Run "npm run linkedin:login" to refresh.');
      await delay(5000);
      await browser!.close();
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`  ✗ Session setup failed: ${err.message}`);
    await browser!.close();
    process.exit(1);
  }

  // ── Step 4: Navigate to content search ────────────────────────────────
  const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(TEST_KEYWORD)}`;
  console.log(`[Step 4/6] Navigating to content search: "${TEST_KEYWORD}"...`);
  console.log(`  URL: ${searchUrl}`);

  try {
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await delay(3000);
    console.log("  ✓ Search page loaded\n");
  } catch (err: any) {
    console.error(`  ✗ Search navigation failed: ${err.message}`);
    await browser!.close();
    process.exit(1);
  }

  // ── Step 5: Scroll and extract posts ──────────────────────────────────
  console.log("[Step 5/6] Scrolling to load content (2 scrolls for dry run)...");
  for (let i = 0; i < 2; i++) {
    console.log(`  Scrolling... (${i + 1}/2)`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2000);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(500);
  console.log("  ✓ Scrolling complete\n");

  // ── Step 6: Extract and display posts ─────────────────────────────────
  console.log("[Step 6/6] Extracting posts from page...");

  const posts = await page.evaluate(() => {
    const results: Array<{
      authorName: string;
      postContent: string;
      postUrl: string;
      reactionsCount: number;
      commentsCount: number;
    }> = [];

    const articles = document.querySelectorAll(
      '[role="article"][data-urn^="urn:li:activity:"]'
    );
    const elements =
      articles.length > 0
        ? articles
        : document.querySelectorAll(
            ".feed-shared-update-v2, .search-content__result"
          );

    elements.forEach((el) => {
      try {
        const authorEl =
          el.querySelector(
            ".update-components-actor__name .visually-hidden"
          ) ||
          el.querySelector(
            '.update-components-actor__name span[aria-hidden="true"]'
          );
        const authorName = authorEl?.textContent?.trim() || "Unknown";

        const contentEl =
          el.querySelector(
            ".feed-shared-update-v2__description, .update-components-text"
          ) || el.querySelector(".feed-shared-text");
        const postContent = contentEl?.textContent?.trim() || "";

        const urn = el.getAttribute("data-urn") || "";
        const activityId = urn.replace("urn:li:activity:", "");
        const postUrl = activityId
          ? `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`
          : "";

        const reactionsEl = el.querySelector(
          ".social-details-social-counts__reactions-count"
        );
        const reactionsCount =
          parseInt(reactionsEl?.textContent?.trim()?.replace(/[^0-9]/g, "") || "0") || 0;

        const commentsEl = el.querySelector(
          'button[aria-label*="comment"] span'
        );
        const commentsCount =
          parseInt(commentsEl?.textContent?.trim()?.replace(/[^0-9]/g, "") || "0") || 0;

        if (postContent.length > 0 || authorName !== "Unknown") {
          results.push({
            authorName,
            postContent: postContent.slice(0, 200),
            postUrl,
            reactionsCount,
            commentsCount,
          });
        }
      } catch {
        // skip
      }
    });

    return results;
  });

  // Collect URLs
  const { profileUrls, postUrls } = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll("a[href]"));
    const profileUrls = new Set<string>();
    const postUrls = new Set<string>();
    for (const a of allLinks) {
      const href = (a as HTMLAnchorElement).href;
      if (href.includes("/in/")) profileUrls.add(href.split("?")[0]);
      if (href.includes("/feed/update/") || href.includes("/posts/"))
        postUrls.add(href.split("?")[0]);
    }
    return {
      profileUrls: Array.from(profileUrls),
      postUrls: Array.from(postUrls),
    };
  });

  console.log(`  Posts extracted: ${posts.length}`);
  console.log(`  Profile URLs found: ${profileUrls.length}`);
  console.log(`  Post URLs found: ${postUrls.length}`);

  if (posts.length > 0) {
    console.log("\n  ── Sample Posts ──────────────────────────────────────");
    posts.slice(0, 3).forEach((p, i) => {
      console.log(`  [${i + 1}] Author: ${p.authorName}`);
      console.log(`      Content: ${p.postContent.slice(0, 120)}...`);
      console.log(`      Reactions: ${p.reactionsCount} | Comments: ${p.commentsCount}`);
      console.log(`      URL: ${p.postUrl}`);
      console.log();
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log("╔══════════════════════════════════════════╗");
  console.log("║            DRY RUN RESULTS              ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Cookies:        ✓ Valid                 ║`);
  console.log(`║  Browser:        ✓ Launched (headed)     ║`);
  console.log(`║  Session:        ✓ Logged in             ║`);
  console.log(`║  Search:         ✓ Page loaded           ║`);
  console.log(`║  Posts found:    ${String(posts.length).padEnd(24)}║`);
  console.log(`║  Profile URLs:   ${String(profileUrls.length).padEnd(24)}║`);
  console.log(`║  Post URLs:      ${String(postUrls.length).padEnd(24)}║`);
  console.log("╠══════════════════════════════════════════╣");

  if (posts.length > 0) {
    console.log("║  STATUS: ALL SYSTEMS GO ✓               ║");
  } else {
    console.log("║  STATUS: ⚠ No posts extracted           ║");
    console.log("║  (LinkedIn may have changed DOM layout)  ║");
  }
  console.log("╚══════════════════════════════════════════╝");

  // Keep browser open for 10 seconds so user can inspect
  console.log("\nBrowser will stay open for 10 seconds so you can inspect...");
  await delay(10000);

  await browser!.close();
  console.log("Browser closed. Dry run complete.");
  process.exit(0);
}

dryRun().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
