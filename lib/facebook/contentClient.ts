/**
 * Facebook Content Scraper
 *
 * Dual-strategy extraction:
 *   1. PRIMARY — GraphQL interception: captures Facebook's internal API/GraphQL
 *      responses before they reach the DOM, yielding structured post data with
 *      URLs, timestamps, and reaction counts (unaffected by virtual scroll).
 *   2. FALLBACK — Incremental DOM extraction: scrolls one viewport at a time and
 *      extracts visible posts at each position, before Facebook's virtual scroll
 *      unloads them. Never scrolls back to top (which was the original bug).
 *
 * Results from both strategies are merged and deduplicated.
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
  scrollDelay: 2500,
  expandPosts: true,
  timeout: 30000,
};

function buildSearchUrl(keyword: string): string {
  const encoded = encodeURIComponent(keyword);
  // filters param = base64 of {"recent_posts:0":"{\"name\":\"recent_posts\",\"args\":\"\"}"}
  const filters =
    "eyJyZWNlbnRfcG9zdHM6MCI6IntcIm5hbWVcIjpcInJlY2VudF9wb3N0c1wiLFwiYXJnc1wiOlwiXCJ9In0%3D";
  return `https://www.facebook.com/search/top?q=${encoded}&filters=${filters}`;
}

async function savePageHTML(page: any, label: string): Promise<void> {
  try {
    const html = await page.content();
    const filename = `facebook-page-${label.replace(/\s+/g, "_")}-${Date.now()}.html`;
    const debugDir = path.join(process.cwd(), "debug", "facebook");
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
    fs.writeFileSync(path.join(debugDir, filename), html);
    console.log(`[Facebook] Debug HTML saved: ${filename}`);
  } catch {
    // Non-fatal
  }
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

async function setupSession(page: any) {
  console.log("[Facebook] Loading cookies...");
  const cookies = loadCookiesFromFile();
  console.log(`[Facebook] Loaded ${cookies.length} cookies`);

  const mappedCookies = cookies.map((c: any) => ({
    name: c.name,
    value: c.value,
    domain: c.domain || ".facebook.com",
    path: c.path || "/",
    expires: c.expires,
    httpOnly: c.httpOnly ?? true,
    secure: c.secure ?? true,
    sameSite: c.sameSite || "None",
  }));

  await page.setCookie(...mappedCookies);
  await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });

  const finalUrl = page.url();
  if (
    finalUrl.includes("/login") ||
    finalUrl.includes("/checkpoint") ||
    finalUrl.includes("/recover")
  ) {
    throw new Error(
      "Facebook cookies expired. Re-run 'npm run facebook:login' to refresh."
    );
  }

  console.log("[Facebook] Session established");
  await new Promise((r) => setTimeout(r, 2000));
}

// ─── Strategy 1: GraphQL Interception ────────────────────────────────────────

interface APIPost {
  postContent: string;
  postUrl: string;
  authorName: string;
  publishedAt: string | null; // ISO string (converted from Unix timestamp)
  reactionsCount: number;
  commentsCount: number;
}

/**
 * Recursively walk a JSON value and collect post-like nodes.
 *
 * Facebook's GraphQL wraps story data in various schemas but the leaf shape
 * is usually: { message: { text }, actors: [{ name }], wwwURL, creation_time }
 * We search for any node that has `message.text` (or `body.text`) with length > 30.
 */
function extractFromNode(
  node: unknown,
  seen: Set<string>,
  out: APIPost[],
  depth = 0
): void {
  if (!node || typeof node !== "object" || depth > 15) return;
  const n = node as Record<string, any>;

  const text: unknown = n.message?.text ?? n.body?.text ?? null;
  if (typeof text === "string" && text.length > 30) {
    const key = text.slice(0, 120);
    if (!seen.has(key)) {
      seen.add(key);

      const postUrl = typeof n.wwwURL === "string" ? n.wwwURL : "";
      const authorName =
        typeof n.actors?.[0]?.name === "string"
          ? n.actors[0].name
          : typeof n.author?.name === "string"
          ? n.author.name
          : "Unknown";
      const creationTime =
        typeof n.creation_time === "number" ? n.creation_time : null;
      const reactions =
        typeof n.reaction_count?.count === "number"
          ? n.reaction_count.count
          : typeof n.feedback?.reaction_count?.count === "number"
          ? n.feedback.reaction_count.count
          : 0;
      const comments =
        typeof n.feedback?.comments_count?.total_count === "number"
          ? n.feedback.comments_count.total_count
          : 0;

      out.push({
        postContent: text,
        postUrl,
        authorName,
        publishedAt: creationTime
          ? new Date(creationTime * 1000).toISOString()
          : null,
        reactionsCount: reactions,
        commentsCount: comments,
      });
    }
  }

  if (Array.isArray(node)) {
    for (const item of node) extractFromNode(item, seen, out, depth + 1);
  } else {
    for (const val of Object.values(n)) {
      if (val && typeof val === "object")
        extractFromNode(val, seen, out, depth + 1);
    }
  }
}

/**
 * Parse a raw API response body.
 * Facebook sometimes sends multiple newline-delimited JSON objects per response.
 */
function parseAPIBody(body: string, seen: Set<string>, out: APIPost[]): void {
  // Split on newlines that start a new JSON object
  const segments = body.split(/\r?\n(?=\{)/);
  for (const seg of segments) {
    const s = seg.trim();
    if (!s.startsWith("{")) continue;
    try {
      extractFromNode(JSON.parse(s), seen, out);
    } catch {
      // Not valid JSON — skip
    }
  }
  // Also try the whole body in case it's a single top-level object
  if (out.length === 0 && body.trim().startsWith("{")) {
    try {
      extractFromNode(JSON.parse(body), seen, out);
    } catch {
      // Not JSON
    }
  }
}

/**
 * Attach a response listener that captures Facebook API/GraphQL calls.
 * Returns a getter that, when called after all scrolling, yields parsed posts.
 */
async function setupGraphQLInterceptor(
  page: any
): Promise<() => APIPost[]> {
  const buffer: string[] = [];

  page.on("response", async (response: any) => {
    try {
      const url: string = response.url();
      // Only capture Facebook API endpoints
      if (
        !url.includes("facebook.com/api/graphql") &&
        !url.includes("facebook.com/ajax/")
      )
        return;
      if (!response.ok()) return;

      const ct: string = response.headers()["content-type"] || "";
      if (!ct.includes("json") && !ct.includes("javascript")) return;

      const body = await response.text().catch(() => "");
      if (body.length > 100) buffer.push(body);
    } catch {
      // Response may have already been handled — ignore
    }
  });

  return () => {
    const seen = new Set<string>();
    const posts: APIPost[] = [];
    for (const body of buffer) parseAPIBody(body, seen, posts);
    console.log(
      `[Facebook GraphQL] ${posts.length} posts from ${buffer.length} API responses`
    );
    return posts;
  };
}

// ─── Strategy 2: Incremental DOM Extraction ──────────────────────────────────

/**
 * Extract posts currently rendered in the viewport.
 * Targets span[dir="auto"] nodes (Facebook's post text carrier) and walks
 * up the DOM to find the surrounding post container for URL/author/timestamp.
 *
 * @param page     Puppeteer page
 * @param seen     Set of content keys already captured — updated in place
 */
async function extractVisiblePosts(
  page: any,
  seen: Set<string>
): Promise<FacebookContentPost[]> {
  const seenArr = Array.from(seen);

  const posts: FacebookContentPost[] = await page.evaluate(
    (existingKeys: string[]) => {
      const results: any[] = [];
      const scrapedAt = new Date().toISOString();
      const localSeen = new Set<string>(existingKeys);

      const feed =
        document.querySelector('[role="feed"]') ||
        document.querySelector('[role="main"]');
      if (!feed) return results;

      // Facebook post text is always in span[dir="auto"] with visible content.
      // Filter by length to exclude navigation labels and short UI strings.
      const textSpans = Array.from(
        feed.querySelectorAll('span[dir="auto"]')
      ).filter((el) => {
        const t = (el as HTMLElement).textContent?.trim() || "";
        return t.length > 50 && t.length < 2500;
      });

      for (const span of textSpans) {
        const postContent = (span as HTMLElement).textContent?.trim() || "";
        const key = postContent.slice(0, 120);
        if (localSeen.has(key)) continue;

        // Walk up to find the direct child of the feed (= post wrapper)
        let el: HTMLElement | null = span as HTMLElement;
        let depth = 0;
        while (
          el &&
          el.getAttribute("role") !== "feed" &&
          el.parentElement?.getAttribute("role") !== "feed" &&
          depth < 25
        ) {
          el = el.parentElement;
          depth++;
        }
        const postContainer = el;
        if (!postContainer) continue;

        // --- Post URL ---
        let postUrl = "";
        const excludedUrlPatterns = [
          "/profile",
          "/people/",
          "/notifications",
          "/messages",
          "/settings",
          "/marketplace",
          "/search",
          "/login",
          "l.facebook.com/l",
          "facebook.com/help",
          "facebook.com/policies",
        ];
        for (const link of Array.from(
          postContainer.querySelectorAll("a[href]")
        )) {
          const href = (link as HTMLAnchorElement).href || "";
          if (excludedUrlPatterns.some((p) => href.includes(p))) continue;
          if (href.includes("facebook.com") && href.length > 40) {
            postUrl = href;
            break;
          }
        }

        // --- Author name ---
        let authorName = "Unknown";
        for (const link of Array.from(
          postContainer.querySelectorAll("a[href]")
        )) {
          const href = (link as HTMLAnchorElement).href || "";
          const text = link.textContent?.trim() || "";
          // Author links typically point to profile pages, not content pages
          if (
            text.length > 1 &&
            text.length < 80 &&
            href.includes("facebook.com") &&
            !href.includes("/posts/") &&
            !href.includes("story_fbid") &&
            !href.includes("/permalink") &&
            !href.includes("/reel/")
          ) {
            authorName = text;
            break;
          }
        }

        // --- Timestamp from aria-label ---
        let publishedAt: string | null = null;
        for (const el of Array.from(
          postContainer.querySelectorAll("[aria-label]")
        )) {
          const label = el.getAttribute("aria-label") || "";
          if (/\b(ago|hour|minute|day|week|month|year)\b|\d+:\d+\s*(AM|PM)/i.test(label)) {
            publishedAt = label;
            break;
          }
        }

        localSeen.add(key);
        results.push({
          authorName,
          authorProfileUrl: "",
          postContent,
          postUrl,
          publishedAt,
          reactionsCount: 0,
          commentsCount: 0,
          scrapedAt,
        });
      }

      return results;
    },
    seenArr
  );

  // Sync seen set back to Node.js context
  for (const p of posts) seen.add(p.postContent.slice(0, 120));

  return posts;
}

/**
 * Scroll one viewport-height at a time, extracting visible posts at each step.
 * Does NOT scroll back to top — that would trigger Facebook's virtual scroll
 * to unload all post content from memory.
 */
async function scrollAndExtract(
  page: any,
  maxScrolls: number,
  scrollDelay: number,
  seen: Set<string>
): Promise<FacebookContentPost[]> {
  const allPosts: FacebookContentPost[] = [];

  for (let i = 0; i < maxScrolls; i++) {
    // Scroll 85% of viewport height to ensure post overlap between steps
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(window.innerHeight * 0.85));
    });

    // Wait for React to render newly visible posts
    await new Promise((r) => setTimeout(r, scrollDelay));

    const batch = await extractVisiblePosts(page, seen);
    if (batch.length > 0) {
      console.log(`  [Facebook DOM] Scroll ${i + 1}: +${batch.length} posts`);
      allPosts.push(...batch);
    }

    // Stop early if we've reached the bottom
    const atBottom = await page.evaluate(() => {
      return (
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 300
      );
    });
    if (i >= 2 && atBottom) {
      console.log(`  [Facebook DOM] Bottom reached at scroll ${i + 1}`);
      break;
    }
  }

  return allPosts;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function fetchContentSearch(
  keyword: string,
  options: FacebookScraperOptions = {}
): Promise<FacebookContentSearchResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let browser: any;

  try {
    console.log(`[Facebook] Searching for: "${keyword}"`);

    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1920, height: 1080 });

    // Attach GraphQL interceptor BEFORE any navigation so we don't miss responses
    const getGraphQLPosts = await setupGraphQLInterceptor(page);

    // Establish authenticated session
    await setupSession(page);

    // Navigate to Facebook search
    const searchUrl = buildSearchUrl(keyword);
    console.log(`[Facebook] Navigating to search: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "networkidle2" });
    console.log(`[Facebook] Search page loaded. URL: ${page.url()}`);

    // Wait for React to hydrate and render the feed
    console.log("[Facebook] Waiting for initial render (5s)...");
    await new Promise((r) => setTimeout(r, 5000));

    // Wait for the feed container to appear
    try {
      await page.waitForFunction(
        () => !!document.querySelector('[role="feed"]'),
        { timeout: 10000 }
      );
      console.log("[Facebook] Feed container found");
    } catch {
      console.log("[Facebook] Feed container not found — proceeding anyway");
    }

    await savePageHTML(page, `${keyword}_after_initial_load`);

    // ── Fallback: incremental DOM extraction ──
    const domSeen = new Set<string>();

    // Capture posts visible at the initial load position
    const initialPosts = await extractVisiblePosts(page, domSeen);
    console.log(`[Facebook DOM] Initial: ${initialPosts.length} posts`);

    // Scroll and capture per-viewport
    const scrollPosts = await scrollAndExtract(
      page,
      opts.maxScrolls + 2,
      opts.scrollDelay,
      domSeen
    );
    console.log(`[Facebook DOM] Scroll total: ${scrollPosts.length} new posts`);

    await savePageHTML(page, `${keyword}_after_scrolling`);

    // ── Primary: GraphQL-intercepted posts ──
    const graphqlPosts = getGraphQLPosts();

    // ── Merge: GraphQL first (better data), DOM fills gaps ──
    const finalPosts: FacebookContentPost[] = [];
    const mergedSeen = new Set<string>();

    for (const p of graphqlPosts) {
      const key = p.postContent.slice(0, 120);
      if (!mergedSeen.has(key)) {
        mergedSeen.add(key);
        finalPosts.push({
          authorName: p.authorName,
          authorProfileUrl: "",
          postContent: p.postContent,
          postUrl: p.postUrl,
          publishedAt: p.publishedAt, // already ISO from Unix timestamp
          reactionsCount: p.reactionsCount,
          commentsCount: p.commentsCount,
          scrapedAt: new Date().toISOString(),
        });
      }
    }

    for (const p of [...initialPosts, ...scrollPosts]) {
      const key = p.postContent.slice(0, 120);
      if (!mergedSeen.has(key)) {
        mergedSeen.add(key);
        finalPosts.push(p);
      }
    }

    console.log(
      `[Facebook] Merged: ${finalPosts.length} posts total` +
        ` (${graphqlPosts.length} GraphQL + ${initialPosts.length + scrollPosts.length} DOM)`
    );

    return {
      keyword,
      searchUrl,
      scrapedAt: new Date().toISOString(),
      posts: finalPosts,
      allProfileUrls: [],
      allPostUrls: finalPosts.map((p) => p.postUrl).filter(Boolean),
    };
  } catch (error: any) {
    console.error(`[Facebook] Error scraping "${keyword}":`, error.message);
    return {
      keyword,
      searchUrl: buildSearchUrl(keyword),
      scrapedAt: new Date().toISOString(),
      posts: [],
      allProfileUrls: [],
      allPostUrls: [],
    };
  } finally {
    if (browser) await browser.close();
  }
}
