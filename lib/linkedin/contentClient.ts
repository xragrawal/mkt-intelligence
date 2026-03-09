/**
 * LinkedIn Content Scraper
 *
 * Uses Puppeteer + stealth plugin to scrape LinkedIn content search results.
 * Requires a valid linkedin-cookies.json with the li_at session cookie.
 */

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import { loadCookiesFromFile } from "./cookies.js";
import type {
  LinkedInContentPost,
  LinkedInContentSearchResult,
  LinkedInScraperOptions,
} from "./contentTypes.js";

// Register stealth plugin
puppeteer.use(StealthPlugin());

const DEFAULT_OPTIONS: Required<LinkedInScraperOptions> = {
  maxScrolls: 5,
  scrollDelay: 2000,
  expandPosts: true,
  timeout: 30000,
};

/**
 * Build the LinkedIn content search URL for a keyword.
 */
function buildSearchUrl(keyword: string): string {
  const encoded = encodeURIComponent(keyword);
  return `https://www.linkedin.com/search/results/content/?keywords=${encoded}`;
}

/**
 * Launch a Puppeteer browser instance with appropriate settings.
 */
async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  // Show browser by default; set LINKEDIN_HEADLESS=1 to hide it
  const hideHeadless = process.env.LINKEDIN_HEADLESS === "1";

  const browser = await (puppeteer as any).launch({
    headless: hideHeadless,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1920,1080",
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });

  return browser;
}

/**
 * Load LinkedIn cookies into a page and navigate to LinkedIn to establish session.
 */
async function setupSession(page: Page): Promise<void> {
  const cookies = loadCookiesFromFile();
  console.log(`[LinkedIn] Loaded ${cookies.length} cookies from file`);

  // Set cookies on the LinkedIn domain
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
  console.log(`[LinkedIn] Cookies set in browser`);

  // Navigate to LinkedIn homepage to validate session
  console.log(`[LinkedIn] Navigating to LinkedIn...`);
  await page.goto("https://www.linkedin.com/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  // Brief pause to let session establish
  await delay(1500);
}

/**
 * Scroll the page to load more content.
 */
async function scrollPage(
  page: Page,
  maxScrolls: number,
  scrollDelay: number
): Promise<void> {
  for (let i = 0; i < maxScrolls; i++) {
    console.log(`[LinkedIn] Scrolling... (${i + 1}/${maxScrolls})`);
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await delay(scrollDelay);

    // Check if we've reached the bottom
    const atBottom = await page.evaluate(() => {
      return (
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 200
      );
    });

    if (atBottom && i > 1) {
      console.log(`[LinkedIn] Reached bottom of page`);
      break;
    }
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(500);
}

/**
 * Click all "See more" / "...more" buttons to expand post content.
 */
async function expandAllPosts(page: Page): Promise<void> {
  try {
    console.log(`[LinkedIn] Expanding post content...`);
    // LinkedIn uses various selectors for "See more" buttons
    const seeMoreSelectors = [
      'button.see-more-less-button',
      'button[aria-label*="see more"]',
      'button[aria-label*="See more"]',
      '.feed-shared-inline-show-more-text button',
      'button.inline-show-more-text__button',
    ];

    let totalExpanded = 0;
    for (const selector of seeMoreSelectors) {
      const buttons = await page.$$(selector);
      for (const btn of buttons) {
        try {
          await btn.click();
          totalExpanded++;
          await delay(300);
        } catch {
          // Button may have been removed from DOM
        }
      }
    }
    console.log(`[LinkedIn] Expanded ${totalExpanded} posts`);
  } catch {
    // Non-critical — some posts may remain collapsed
  }
}

/**
 * Extract posts from the current page.
 */
async function extractPosts(page: Page): Promise<LinkedInContentPost[]> {
  return page.evaluate(() => {
    const posts: Array<{
      authorName: string;
      authorProfileUrl: string;
      postContent: string;
      postUrl: string;
      publishedAt: string | null;
      reactionsCount: number;
      commentsCount: number;
      scrapedAt: string;
    }> = [];

    // Primary selector per the spec
    const articles = document.querySelectorAll(
      '[role="article"][data-urn^="urn:li:activity:"]'
    );

    // Fallback: broader selector if primary yields nothing
    const elements =
      articles.length > 0
        ? articles
        : document.querySelectorAll(
            ".feed-shared-update-v2, .search-content__result"
          );

    elements.forEach((el) => {
      try {
        // Extract author name - try multiple selectors
        let authorName = "Unknown";

        const authorSelectors = [
          ".update-components-actor__name .visually-hidden",
          ".update-components-actor__title .visually-hidden",
          '.update-components-actor__name span[aria-hidden="true"]',
          ".feed-shared-actor__name",
          ".update-components-actor__name a span",
          "a.app-aware-link[href*='/in/'] span",
          ".update-components-actor__name",
        ];

        for (const selector of authorSelectors) {
          const el_candidate = el.querySelector(selector);
          if (el_candidate && el_candidate.textContent?.trim()) {
            authorName = el_candidate.textContent.trim();
            break;
          }
        }

        // Extract author profile URL
        const authorLinkEl = el.querySelector(
          "a.update-components-actor__meta-link, a.app-aware-link"
        );
        const authorProfileUrl =
          (authorLinkEl as HTMLAnchorElement)?.href || "";

        // Extract post content - try multiple selectors
        let postContent = "";
        const contentSelectors = [
          ".feed-shared-update-v2__description",
          ".update-components-text",
          ".feed-shared-text",
          '[data-test-id="main-feed-activity-content"]',
          ".update-components__text",
          ".feed-shared-inline-show-more-text",
          'span[aria-label*="comment on this post"]',
        ];

        for (const selector of contentSelectors) {
          const el_candidate = el.querySelector(selector);
          if (el_candidate && el_candidate.textContent?.trim()) {
            postContent = el_candidate.textContent.trim();
            break;
          }
        }

        // Extract post URL from the activity URN
        const urn = el.getAttribute("data-urn") || "";
        const activityId = urn.replace("urn:li:activity:", "");
        const postUrl = activityId
          ? `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`
          : "";

        // Extract published date (relative text like "2d", "1w", etc.)
        const timeEl =
          el.querySelector(
            ".update-components-actor__sub-description .visually-hidden"
          ) ||
          el.querySelector("time") ||
          el.querySelector(".feed-shared-actor__sub-description");
        const publishedText = timeEl?.textContent?.trim() || null;

        // Extract reactions count
        const reactionsEl =
          el.querySelector(
            ".social-details-social-counts__reactions-count"
          ) ||
          el.querySelector(
            'button[aria-label*="reaction"] span, button[aria-label*="like"] span'
          );
        const reactionsText = reactionsEl?.textContent?.trim() || "0";
        const reactionsCount = parseInt(reactionsText.replace(/[^0-9]/g, "")) || 0;

        // Extract comments count
        const commentsEl = el.querySelector(
          'button[aria-label*="comment"] span'
        );
        const commentsText = commentsEl?.textContent?.trim() || "0";
        const commentsCount = parseInt(commentsText.replace(/[^0-9]/g, "")) || 0;

        if (postContent.length > 0 || authorName !== "Unknown") {
          posts.push({
            authorName,
            authorProfileUrl: authorProfileUrl
              ? new URL(authorProfileUrl, "https://www.linkedin.com").href
              : "",
            postContent,
            postUrl,
            publishedAt: publishedText,
            reactionsCount,
            commentsCount,
            scrapedAt: new Date().toISOString(),
          });
        }
      } catch {
        // Skip malformed elements
      }
    });

    return posts;
  });
}

/**
 * Collect all unique profile and post URLs from the page.
 */
async function collectUrls(
  page: Page
): Promise<{ profileUrls: string[]; postUrls: string[] }> {
  return page.evaluate(() => {
    const profileUrls = new Set<string>();
    const postUrls = new Set<string>();

    // Collect from links
    const allLinks = Array.from(document.querySelectorAll("a[href]"));
    for (const a of allLinks) {
      const href = (a as HTMLAnchorElement).href;
      if (href.includes("/in/")) {
        profileUrls.add(href.split("?")[0]);
      }
      if (href.includes("/feed/update/") || href.includes("/posts/")) {
        postUrls.add(href.split("?")[0]);
      }
    }

    // Also collect post URLs from article URNs (more reliable)
    const articles = document.querySelectorAll(
      '[role="article"][data-urn^="urn:li:activity:"]'
    );
    articles.forEach((el) => {
      const urn = el.getAttribute("data-urn") || "";
      const activityId = urn.replace("urn:li:activity:", "");
      if (activityId) {
        postUrls.add(`https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`);
      }
    });

    return {
      profileUrls: Array.from(profileUrls),
      postUrls: Array.from(postUrls),
    };
  });
}

/**
 * Main scraping function: search LinkedIn content by keyword.
 */
export async function fetchContentSearch(
  keyword: string,
  options: LinkedInScraperOptions = {}
): Promise<LinkedInContentSearchResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const searchUrl = buildSearchUrl(keyword);

  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Set a reasonable user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Load cookies and establish session
    console.log(`[LinkedIn] Setting up session...`);
    await setupSession(page);
    console.log(`[LinkedIn] Session established`);

    // Navigate to the content search page
    console.log(`[LinkedIn] Searching for: "${keyword}" (watch the browser window)...`);
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: opts.timeout,
    });

    // Wait for content to load
    console.log(`[LinkedIn] Waiting for content to load...`);
    await delay(3000);

    // Scroll to load more results
    console.log(`[LinkedIn] Loading more results by scrolling...`);
    await scrollPage(page, opts.maxScrolls, opts.scrollDelay);

    // Expand "See more" on posts
    if (opts.expandPosts) {
      await expandAllPosts(page);
    }

    // Extract posts
    console.log(`[LinkedIn] Extracting post data...`);
    const posts = await extractPosts(page);
    console.log(`[LinkedIn] Found ${posts.length} posts for "${keyword}"`);

    // Collect all URLs
    const { profileUrls, postUrls } = await collectUrls(page);

    return {
      keyword,
      searchUrl,
      scrapedAt: new Date().toISOString(),
      posts,
      allProfileUrls: profileUrls,
      allPostUrls: postUrls,
    };
  } catch (error) {
    console.error(`[LinkedIn] Scrape error for "${keyword}":`, error);
    return {
      keyword,
      searchUrl,
      scrapedAt: new Date().toISOString(),
      posts: [],
      allProfileUrls: [],
      allPostUrls: [],
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
