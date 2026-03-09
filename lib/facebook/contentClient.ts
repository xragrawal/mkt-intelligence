/**
 * Facebook Content Scraper
 *
 * Uses Puppeteer to search Facebook and extract post data.
 * Mirrors the LinkedIn contentClient pattern with Facebook-specific DOM selectors.
 */

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { loadCookiesFromFile } from "./cookies.js";
import fs from "fs";
import path from "path";
import type {
  FacebookContentPost,
  FacebookContentSearchResult,
  FacebookScraperOptions,
} from "./contentTypes.js";

puppeteer.use(StealthPlugin());

const DEFAULT_OPTIONS: Required<FacebookScraperOptions> = {
  maxScrolls: 5,
  scrollDelay: 2500, // Facebook React rendering is slower
  expandPosts: true,
  timeout: 30000,
};

function buildSearchUrl(keyword: string): string {
  const encoded = encodeURIComponent(keyword);
  // Filters param encodes: {"recent_posts:0":"{\"name\":\"recent_posts\",\"args\":\"\"}"}
  const filters =
    "eyJyZWNlbnRfcG9zdHM6MCI6IntcIm5hbWVcIjpcInJlY2VudF9wb3N0c1wiLFwiYXJnc1wiOlwiXCJ9In0%3D";
  return `https://www.facebook.com/search/top?q=${encoded}&filters=${filters}`;
}

async function savePageHTML(page: puppeteer.Page, keyword: string): Promise<string> {
  const htmlContent = await page.content();
  const filename = `facebook-page-${keyword.replace(/\s+/g, "_")}-${Date.now()}.html`;
  const debugDir = path.join(process.cwd(), "debug", "facebook");
  // Create directory if it doesn't exist
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
  const filepath = path.join(debugDir, filename);
  fs.writeFileSync(filepath, htmlContent);
  console.log(`[Facebook] Page HTML saved to: ${filepath}`);
  return filepath;
}

async function launchBrowser() {
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const headless = process.env.FACEBOOK_HEADLESS === "1";

  return puppeteer.launch({
    headless,
    executablePath: execPath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

async function setupSession(page: puppeteer.Page) {
  console.log("[Facebook] Loading cookies from file...");
  const cookies = loadCookiesFromFile();
  console.log(`[Facebook] Loaded ${cookies.length} cookies`);

  // Map cookies to Puppeteer format with Facebook defaults
  const mappedCookies = cookies.map((cookie: any) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain || ".facebook.com",
    path: cookie.path || "/",
    expires: cookie.expires,
    httpOnly: cookie.httpOnly ?? true,
    secure: cookie.secure ?? true,
    sameSite: cookie.sameSite || "None",
  }));

  console.log("[Facebook] Setting cookies on page...");
  await page.setCookie(...mappedCookies);

  // Navigate to Facebook homepage to establish session
  console.log("[Facebook] Navigating to facebook.com to establish session...");
  await page.goto("https://www.facebook.com/", {
    waitUntil: "domcontentloaded",
  });

  // Check if cookies expired (redirected to login)
  const finalUrl = page.url();
  console.log(`[Facebook] Final URL after navigation: ${finalUrl}`);

  if (
    finalUrl.includes("/login") ||
    finalUrl.includes("/checkpoint") ||
    finalUrl.includes("/recover")
  ) {
    throw new Error(
      "Facebook cookies appear expired or invalid. Re-run 'npm run facebook:login' to refresh."
    );
  }

  console.log("[Facebook] Session established. Waiting for page to settle...");
  // Wait for page to settle
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

async function scrollPage(
  page: puppeteer.Page,
  maxScrolls: number,
  scrollDelay: number
) {
  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await new Promise((resolve) => setTimeout(resolve, scrollDelay));

    // Check if at bottom — if so, stop scrolling early
    const isAtBottom = await page.evaluate(() => {
      return (
        window.innerHeight + window.scrollY >=
        document.body.scrollHeight - 200
      );
    });

    if (i >= 2 && isAtBottom) {
      console.log(`  Reached bottom after ${i + 1} scrolls`);
      break;
    }
  }

  // Scroll back to top
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
}

async function expandAllPosts(page: puppeteer.Page) {
  // Facebook doesn't have standard "see more" buttons like LinkedIn
  // Try clicking any collapsible post content (best effort)
  try {
    const expandSelectors = [
      'div[role="button"]:has-text("See more")',
      '[data-ad-rendering-role="story_message"] [role="button"]',
      'span[dir="auto"] [role="button"]',
    ];

    for (const selector of expandSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const el of elements) {
          await el.click().catch(() => {}); // Non-fatal if click fails
        }
      } catch {
        // Continue to next selector
      }
    }
  } catch {
    // If expand logic fails, continue anyway — posts without expansion are still useful
  }
}

async function extractPosts(page: puppeteer.Page): Promise<FacebookContentPost[]> {
  const posts: FacebookContentPost[] = await page.evaluate(() => {
    const posts: any[] = [];
    const scrapedAt = new Date().toISOString();

    console.log("[Facebook Extract] Starting extraction...");
    console.log("[Facebook Extract] Page title:", document.title);
    console.log("[Facebook Extract] Current URL:", window.location.href);

    // Strategy: First locate the search results container (semantic selectors)
    // Then extract posts ONLY from within that container

    let searchResultsContainer = document.querySelector('[data-pagelet="SearchResults"]');
    if (!searchResultsContainer) {
      searchResultsContainer = document.querySelector('[aria-label="Search Results"]');
    }
    if (!searchResultsContainer) {
      searchResultsContainer = document.querySelector('[role="main"]');
    }

    if (!searchResultsContainer) {
      console.warn("[Facebook Extract] Could not find search results container");
      return posts;
    }

    console.log("[Facebook Extract] Found search results container");

    // Get article elements (actual posts) from within the container only
    const articles = Array.from(searchResultsContainer.querySelectorAll('div[role="article"]'));
    console.log(`[Facebook Extract] Found ${articles.length} article elements in search results`);

    // If no articles found, try alternative selectors within the container
    let postContainers = articles;
    if (postContainers.length === 0) {
      postContainers = Array.from(
        searchResultsContainer.querySelectorAll('[data-testid="story-subtitles"]')
      ).map(el => el.closest('div[role="article"]') || el.parentElement).filter(Boolean);
      console.log(`[Facebook Extract] Fallback: Found ${postContainers.length} posts via story-subtitles`);
    }

    // If still no posts, try pagelet divs
    if (postContainers.length === 0) {
      postContainers = Array.from(
        searchResultsContainer.querySelectorAll('[data-pagelet^="FeedUnit"]')
      );
      console.log(`[Facebook Extract] Fallback 2: Found ${postContainers.length} posts via FeedUnit pagelets`);
    }

    // If still empty, fall back to extracting from generic divs within container only
    if (postContainers.length === 0) {
      const allDivs = Array.from(searchResultsContainer.querySelectorAll("div"));
      postContainers = allDivs.filter((div) => {
        const text = div.textContent || "";
        const hasLinks = div.querySelectorAll("a").length > 0;
        const textLength = text.trim().length;
        const isReasonableSize = textLength > 50 && textLength < 5000;
        return hasLinks && isReasonableSize;
      });
      console.log(`[Facebook Extract] Fallback 3: Found ${postContainers.length} posts via generic divs`);
    }

    const postLikeDivs = postContainers;

    console.log(`[Facebook Extract] Found ${postLikeDivs.length} divs with post-like characteristics`);

    // Now extract data from each post-like div
    postLikeDivs.slice(0, 50).forEach((div, idx) => {
      try {
        // --- Post content (the main text) ---
        let postContent = "";

        // Try to find the main content area - usually in a span or p with substantial text
        const contentSpans = Array.from(div.querySelectorAll("span, p, div"))
          .filter((el) => {
            const text = el.textContent?.trim() || "";
            return text.length > 20 && text.length < 1000; // Likely post content
          })
          .sort((a, b) => (b.textContent?.length || 0) - (a.textContent?.length || 0)); // Longest first

        if (contentSpans.length > 0) {
          postContent = (contentSpans[0].textContent || "").trim();
        }

        // --- Author name ---
        let authorName = "Unknown";
        const authorLink = div.querySelector('a[href*="/profile.php"], a[href*="/people/"], a[href*="/profiles/"]');
        if (authorLink) {
          const text = authorLink.textContent?.trim();
          if (text && text.length > 0 && text.length < 100) {
            authorName = text;
          }
        }

        // --- Author profile URL ---
        let authorProfileUrl = "";
        if (authorLink && authorLink instanceof HTMLAnchorElement) {
          authorProfileUrl = authorLink.href;
        }

        // --- Post URL ---
        let postUrl = "";
        // Try multiple selectors to find post URL (Facebook uses various patterns)
        let postLink = div.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="], a[href*="/reel/"]');

        // Fallback: find any facebook.com link (but exclude navigation/system URLs)
        if (!postLink) {
          postLink = Array.from(div.querySelectorAll('a[href*="facebook.com"]')).find((link) => {
            const href = link.getAttribute('href') || '';
            // EXCLUDE: all navigation, sidebar, and system links
            const excludedPatterns = [
              '/profile', '/people/', '/notifications', '/messages',
              '/settings', '/games', '/marketplace', '/watch',
              '/pages/', '/groups/', '/friends/', '/home',
              '/me/', '/search', '/ads_center', '/business',
              'fc_tab', '?__', '/login'
            ];

            if (excludedPatterns.some(p => href.includes(p))) {
              return false;
            }

            // Accept facebook.com links that look like actual content
            return href.length > 20 && href.includes('facebook.com');
          }) || null;
        }

        // Final fallback: try ANY link that looks like it could be external
        if (!postLink) {
          postLink = Array.from(div.querySelectorAll('a[href]')).find((link) => {
            const href = link.getAttribute('href') || '';
            // Skip obvious non-post links and redirect links
            if (href.includes('/profile') || href.includes('l.facebook.com/l')) {
              return false;
            }
            return href.startsWith('http') && href.length > 20;
          }) || null;
        }

        if (postLink && postLink instanceof HTMLAnchorElement) {
          postUrl = postLink.href;
        }

        // --- Timestamp ---
        let publishedAt: string | null = null;
        const timeElements = Array.from(div.querySelectorAll("abbr, a, span, div"))
          .filter((el) => {
            const label = el.getAttribute("aria-label") || el.textContent || "";
            return label.match(/ago|hour|minute|day|week|month|year|AM|PM|^\d+:\d+/);
          });

        if (timeElements.length > 0) {
          const timeEl = timeElements[0];
          const ariaLabel = timeEl.getAttribute("aria-label");
          const textContent = timeEl.textContent;
          publishedAt = (ariaLabel || textContent || "").trim();
        }

        // --- Reactions and comments (rough count from text) ---
        const fullText = div.textContent || "";
        const reactionsMatch = fullText.match(/(\d+)\s*(reaction|like)/i);
        const commentsMatch = fullText.match(/(\d+)\s*comment/i);
        const reactionsCount = reactionsMatch ? parseInt(reactionsMatch[1]) : 0;
        const commentsCount = commentsMatch ? parseInt(commentsMatch[1]) : 0;

        // Only add if has meaningful content
        if (postContent.length > 50) {
          // Avoid duplicates by checking if we already have this content
          const isDuplicate = posts.some((p) => p.postContent === postContent);
          if (!isDuplicate) {
            // Debug: warn if post has no URL
            if (!postUrl) {
              console.warn(`[Facebook Extract] ⚠️  Post found but NO URL: "${postContent.substring(0, 50)}..."`);
            }
            posts.push({
              authorName,
              authorProfileUrl,
              postContent,
              postUrl,
              publishedAt,
              reactionsCount,
              commentsCount,
              scrapedAt,
            });
          }
        }
      } catch (err) {
        // Skip problematic divs
      }
    });

    console.log(`[Facebook Extract] Successfully extracted ${posts.length} posts with substantial content`);
    return posts;
  });

  return posts;
}

async function collectUrls(
  page: puppeteer.Page
): Promise<{ profileUrls: string[]; postUrls: string[] }> {
  const { profileUrls, postUrls } = await page.evaluate(() => {
    const profileUrls = new Set<string>();
    const postUrls = new Set<string>();

    const links = document.querySelectorAll("a[href]");
    links.forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (href.includes("/profile.php") || href.includes("/profiles/")) {
        profileUrls.add(href.split("?")[0]); // Remove query params
      }
      if (
        href.includes("/posts/") ||
        href.includes("/permalink/") ||
        href.includes("story_fbid=")
      ) {
        postUrls.add(href.split("?")[0]);
      }
    });

    return {
      profileUrls: Array.from(profileUrls),
      postUrls: Array.from(postUrls),
    };
  });

  return { profileUrls, postUrls };
}

export async function fetchContentSearch(
  keyword: string,
  options: FacebookScraperOptions = {}
): Promise<FacebookContentSearchResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let browser;

  try {
    console.log(`[Facebook] Searching for: "${keyword}"`);

    browser = await launchBrowser();
    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Setup session with cookies
    await setupSession(page);

    // Navigate to search URL
    const searchUrl = buildSearchUrl(keyword);
    console.log(`[Facebook] Navigating to: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "networkidle2" });
    console.log(`[Facebook] Page loaded. URL: ${page.url()}`);

    // Wait longer for React to fully hydrate and render posts
    console.log(`[Facebook] Waiting for React to hydrate (5s)...`);
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Wait for at least some divs with content to appear
    try {
      console.log(`[Facebook] Waiting for post content to appear...`);
      await page.waitForFunction(
        () => {
          const divs = document.querySelectorAll("div");
          return divs.length > 200; // Facebook search pages typically have 200+ divs
        },
        { timeout: 10000 }
      );
      console.log(`[Facebook] Post content appeared on page`);
    } catch {
      console.log(`[Facebook] Timeout waiting for content, continuing anyway...`);
    }

    // Save page HTML before scrolling (for debugging)
    const preScrollPath = await savePageHTML(page, `${keyword}_after_initial_load`);

    // Scroll to load more posts - increase scrolls for Facebook search
    console.log(`[Facebook] Scrolling ${opts.maxScrolls + 2} times (increased for search)...`);
    await scrollPage(page, opts.maxScrolls + 2, opts.scrollDelay);
    console.log(`[Facebook] Scrolling complete`);

    // Save page HTML after scrolling (for debugging)
    const postScrollPath = await savePageHTML(page, `${keyword}_after_scrolling`);

    // Expand any collapsible posts
    if (opts.expandPosts) {
      console.log(`[Facebook] Expanding collapsible posts...`);
      await expandAllPosts(page);
      console.log(`[Facebook] Expansion complete`);
    }

    // Extract posts
    console.log(`[Facebook] Extracting posts from page...`);
    const posts = await extractPosts(page);
    console.log(`[Facebook] Extraction complete: ${posts.length} posts`);

    // Collect URLs
    const { profileUrls: allProfileUrls, postUrls: allPostUrls } =
      await collectUrls(page);

    console.log(`[Facebook] Extracted ${posts.length} posts from "${keyword}"`);

    return {
      keyword,
      searchUrl,
      scrapedAt: new Date().toISOString(),
      posts,
      allProfileUrls,
      allPostUrls,
    };
  } catch (error: any) {
    console.error(`[Facebook] Error scraping "${keyword}":`, error.message);
    // Return empty result instead of throwing
    return {
      keyword,
      searchUrl: buildSearchUrl(keyword),
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
