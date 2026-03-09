/**
 * Unified Social Media Scraping Server
 *
 * Combines LinkedIn and Facebook content collection into a single Express server.
 * Provides endpoints for collecting posts from both platforms via Puppeteer.
 *
 * Usage:
 *   npm run social-media:server
 *   (or: npx tsx server/social-media-server.ts)
 */

import express from "express";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fetchContentSearch as fetchLinkedInContent } from "../lib/linkedin/contentClient.js";
import type { LinkedInContentPost } from "../lib/linkedin/contentTypes.js";
import { fetchContentSearch as fetchFacebookContent } from "../lib/facebook/contentClient.js";
import type { FacebookContentPost } from "../lib/facebook/contentTypes.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.SOCIAL_MEDIA_SERVER_PORT || "3001", 10);

// CORS — allow the Vite dev server
app.use(
  cors({
    origin: [
      "http://localhost:8080",
      "http://localhost:3000",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Supabase client — use service role key for server-side operations (bypasses RLS)
const supabaseUrl =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  "";

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing Supabase credentials. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env"
  );
  console.error(
    "⚠️  Service role key is required to bypass RLS policies for server-side inserts."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Generate a deterministic hash ID for a post,
 * consistent with the existing Google News ID scheme.
 * For posts without URLs, uses content hash to ensure uniqueness.
 */
function generatePostId(
  post: LinkedInContentPost | FacebookContentPost,
  keyword: string
): string {
  // Use URL if available and unique, otherwise use content+author hash
  const contentSnippet = (post.postContent || "").slice(0, 100);
  const idSource = `${post.postUrl || (post.authorName + "|" + contentSnippet)}|${keyword}`;
  return crypto.createHash("sha256").update(idSource).digest("hex").slice(0, 16);
}

/**
 * Remove problematic Unicode characters that cause JSON serialization errors.
 */
function sanitizeText(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "") // Remove emoji (surrogate pairs)
    .replace(/[\u0080-\u009F]/g, "") // Remove control characters
    .replace(/[\u2000-\u200D]/g, "") // Remove special spaces and formatting
    .replace(/[\uFFF0-\uFFFF]/g, "") // Remove specials
    .trim();
}

/**
 * Truncate text to create a title-like snippet from post content.
 */
function createTitle(postContent: string, maxLength = 150): string {
  if (!postContent) return "(Social media post)";
  const sanitized = sanitizeText(postContent);
  const cleaned = sanitized.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + "...";
}

/**
 * Parse LinkedIn relative timestamps (e.g., "1h", "2d", "3w") into ISO dates.
 */
function parseLinkedInDate(timeStr: string | null): string | null {
  if (!timeStr) return null;

  try {
    const now = new Date();
    const lowerTime = timeStr.toLowerCase().trim();

    // Parse relative time formats: "1h", "2d", "3w", "1m", "1y"
    const match = lowerTime.match(/^(\d+)\s*([hdwmy])$/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      const date = new Date(now);

      switch (unit) {
        case "h":
          date.setHours(date.getHours() - value);
          break;
        case "d":
          date.setDate(date.getDate() - value);
          break;
        case "w":
          date.setDate(date.getDate() - value * 7);
          break;
        case "m":
          date.setMonth(date.getMonth() - value);
          break;
        case "y":
          date.setFullYear(date.getFullYear() - value);
          break;
      }
      return date.toISOString();
    }

    // Try standard date parsing
    const parsed = new Date(lowerTime);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse Facebook timestamps (multiple formats: "2h", "2 hours ago", "March 5 at 2:30 PM", etc.)
 */
function parseFacebookDate(timeStr: string | null): string | null {
  if (!timeStr) return null;
  try {
    const now = new Date();
    const s = timeStr.trim();

    // Format 1: Already ISO (from data-utime conversion)
    if (s.match(/^\d{4}-\d{2}-\d{2}T/)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString();
    }

    // Format 2: Compact relative — "2h", "45m", "3d", "1w"
    const compact = s.match(/^(\d+)\s*([mhdw])$/i);
    if (compact) {
      const val = parseInt(compact[1]);
      const unit = compact[2].toLowerCase();
      const date = new Date(now);
      if (unit === "m") date.setMinutes(date.getMinutes() - val);
      if (unit === "h") date.setHours(date.getHours() - val);
      if (unit === "d") date.setDate(date.getDate() - val);
      if (unit === "w") date.setDate(date.getDate() - val * 7);
      return date.toISOString();
    }

    // Format 3: Long relative — "2 hours ago", "45 minutes ago", "3 days ago"
    const long = s.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i);
    if (long) {
      const val = parseInt(long[1]);
      const unit = long[2].toLowerCase();
      const date = new Date(now);
      if (unit === "minute") date.setMinutes(date.getMinutes() - val);
      if (unit === "hour") date.setHours(date.getHours() - val);
      if (unit === "day") date.setDate(date.getDate() - val);
      if (unit === "week") date.setDate(date.getDate() - val * 7);
      if (unit === "month") date.setMonth(date.getMonth() - val);
      if (unit === "year") date.setFullYear(date.getFullYear() - val);
      return date.toISOString();
    }

    // Format 4: "Yesterday at 3:45 PM"
    if (s.toLowerCase().startsWith("yesterday")) {
      const timeMatch = s.match(/(\d+):(\d+)\s*(AM|PM)/i);
      const date = new Date(now);
      date.setDate(date.getDate() - 1);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const mins = parseInt(timeMatch[2]);
        const period = timeMatch[3].toUpperCase();
        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
        date.setHours(hours, mins, 0, 0);
      }
      return date.toISOString();
    }

    // Format 5: "March 5 at 2:30 PM" or "March 5, 2024 at 2:30 PM"
    const cleaned = s.replace(/\s+at\s+/i, " ");
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();

    return null;
  } catch {
    return null;
  }
}

// ─── API Routes ──────────────────────────────────────────────────────────────

/**
 * POST /api/collect-linkedin
 *
 * Scrapes LinkedIn content search for each keyword,
 * stores results in collected_articles with source="linkedin"
 */
app.post("/api/collect-linkedin", async (req, res) => {
  try {
    const { keywords, filterDays = 30 } = req.body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: "keywords array required" });
    }

    console.log(
      `[LinkedIn] Starting collection for keywords: ${keywords.join(", ")}`
    );

    const batchId = `li_batch_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}`;

    // Create collection run entry
    await supabase.from("collection_runs").insert({
      id: batchId,
      keywords,
      status: "running",
    });

    // Scrape each keyword sequentially
    const allPosts: Array<LinkedInContentPost & { keyword: string }> = [];
    for (const keyword of keywords) {
      console.log(`[LinkedIn] Scraping keyword: "${keyword}"`);
      try {
        const result = await fetchLinkedInContent(keyword, {
          maxScrolls: 5,
          scrollDelay: 2000,
        });

        console.log(
          `[LinkedIn] Keyword "${keyword}": ${result.posts.length} posts`
        );
        for (const post of result.posts) {
          allPosts.push({ ...post, keyword });
        }

        // Delay between keywords
        if (keywords.length > 1) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (keywordError: any) {
        console.error(
          `[LinkedIn] Error scraping "${keyword}":`,
          keywordError.message
        );
      }
    }

    const totalCollected = allPosts.length;
    console.log(`[LinkedIn] Total posts scraped: ${totalCollected}`);

    // Deduplication by keyword (each keyword gets its own posts)
    const MAX_ARTICLES_PER_KEYWORD = 25;
    const dedupedByKeyword = new Map<string, (LinkedInContentPost & { keyword: string })[]>();
    let totalAfterDedup = 0;

    for (const keyword of keywords) {
      const postsForKeyword = allPosts.filter(
        (p): p is LinkedInContentPost & { keyword: string } => p.keyword === keyword
      );
      const seenUrls = new Set<string>();
      const deduped: (LinkedInContentPost & { keyword: string })[] = [];

      for (const post of postsForKeyword) {
        if (!post.postUrl) {
          console.warn(
            `[LinkedIn] ⚠️  Post without URL for keyword "${keyword}": ${post.authorName}`
          );
          continue;
        }
        if (seenUrls.has(post.postUrl)) {
          console.log(
            `[LinkedIn] Duplicate URL within "${keyword}": ${post.postUrl.slice(0, 50)}...`
          );
          continue;
        }
        seenUrls.add(post.postUrl);
        deduped.push(post);

        if (deduped.length >= MAX_ARTICLES_PER_KEYWORD) break;
      }

      console.log(
        `[LinkedIn] Keyword "${keyword}": ${postsForKeyword.length} scraped → ${deduped.length} after dedup`
      );
      dedupedByKeyword.set(keyword, deduped);
      totalAfterDedup += deduped.length;
    }

    const toStore = Array.from(dedupedByKeyword.values()).flat();
    const dedupRemoved = totalCollected - totalAfterDedup;
    const afterDedup = totalAfterDedup;
    const MAX_ARTICLES = 50;

    // Transform to collected_articles format
    const rows = toStore.map((post) => ({
      id: generatePostId(post, post.keyword),
      keyword: post.keyword,
      url: post.postUrl,
      title: createTitle(post.postContent),
      snippet: sanitizeText(post.postContent).slice(0, 500) || null,
      publishing_agency: post.authorName || null,
      published_at: parseLinkedInDate(post.publishedAt),
      batch_id: batchId,
      source: "linkedin",
    }));

    let newArticlesCount = 0;

    console.log(`[LinkedIn] Processing ${rows.length} rows for storage...`);

    if (rows.length > 0) {
      const { data: insertedData, error: insertError } = await supabase
        .from("collected_articles")
        .upsert(rows, { onConflict: "id" });

      if (insertError) {
        console.error("[LinkedIn] Insert error:", insertError);
        throw new Error(`Failed to insert articles: ${insertError.message}`);
      }

      console.log(
        `[LinkedIn] Successfully inserted ${rows.length} articles`
      );

      // Verify insertion
      const { data: checkData, error: checkError } = await supabase
        .from("collected_articles")
        .select("id, batch_id")
        .eq("batch_id", batchId);

      if (!checkError) {
        console.log(
          `[LinkedIn] Verified: ${checkData?.length || 0} articles in DB`
        );
        newArticlesCount = checkData?.length || 0;
      }
    }

    // Update collection run
    await supabase
      .from("collection_runs")
      .update({
        articles_collected: totalCollected,
        articles_stored: toStore.length,
        completed_at: new Date().toISOString(),
        status: "completed",
      })
      .eq("id", batchId);

    console.log(`[LinkedIn] Collection completed`);

    const response = {
      run: {
        id: batchId,
        keywords,
        articles_collected: totalCollected,
        articles_stored: toStore.length,
        after_dedup: afterDedup,
        after_date_filter: afterDedup,
        duplicates_removed: dedupRemoved,
        date_filtered: 0,
        capped: afterDedup > MAX_ARTICLES ? afterDedup - MAX_ARTICLES : 0,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        status: "completed",
      },
      articles: rows.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        keyword: r.keyword,
        publishing_agency: r.publishing_agency,
        published_at: r.published_at,
        source: "linkedin" as const,
      })),
      allFetched: allPosts.map((p) => ({
        id: generatePostId(p, p.keyword),
        title: createTitle(p.postContent),
        url: p.postUrl,
        keyword: p.keyword,
        publishing_agency: p.authorName,
        published_at: p.publishedAt,
        source: "linkedin" as const,
      })),
      pipeline: {
        totalFetched: totalCollected,
        afterDedup,
        afterDateFilter: afterDedup,
        afterCap: toStore.length,
        droppedByDedup: dedupRemoved,
        droppedByDateFilter: 0,
        droppedByCap: Math.max(0, afterDedup - MAX_ARTICLES),
        crossBatchDupes: 0,
        newArticles: newArticlesCount,
      },
      lastRunForKeywords: null,
    };

    return res.json(response);
  } catch (error: any) {
    console.error("[LinkedIn] Error:", error);
    return res.status(500).json({
      error: error.message || "LinkedIn collection failed",
    });
  }
});

/**
 * POST /api/collect-facebook
 *
 * Scrapes Facebook content search for each keyword,
 * stores results in collected_articles with source="facebook"
 */
app.post("/api/collect-facebook", async (req, res) => {
  try {
    const { keywords, filterDays = 30 } = req.body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: "keywords array required" });
    }

    console.log(
      `[Facebook] Starting collection for keywords: ${keywords.join(", ")}`
    );

    const batchId = `fb_batch_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}`;

    // Create collection run entry
    await supabase.from("collection_runs").insert({
      id: batchId,
      keywords,
      status: "running",
    });

    // Scrape each keyword sequentially
    const allPosts: Array<FacebookContentPost & { keyword: string }> = [];
    for (const keyword of keywords) {
      console.log(`[Facebook] Scraping keyword: "${keyword}"`);
      try {
        const result = await fetchFacebookContent(keyword, {
          maxScrolls: 5,
          scrollDelay: 2500,
        });

        console.log(
          `[Facebook] Keyword "${keyword}": ${result.posts.length} posts`
        );
        for (const post of result.posts) {
          allPosts.push({ ...post, keyword });
        }

        // Delay between keywords
        if (keywords.length > 1) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (keywordError: any) {
        console.error(
          `[Facebook] Error scraping "${keyword}":`,
          keywordError.message
        );
      }
    }

    const totalCollected = allPosts.length;
    console.log(`[Facebook] Total posts scraped: ${totalCollected}`);

    // Deduplication by keyword (each keyword gets its own posts)
    const MAX_ARTICLES_PER_KEYWORD = 25;
    const dedupedByKeyword = new Map<string, (FacebookContentPost & { keyword: string })[]>();
    let totalAfterDedup = 0;

    for (const keyword of keywords) {
      const postsForKeyword = allPosts.filter(
        (p): p is FacebookContentPost & { keyword: string } => p.keyword === keyword
      );
      const seenUrls = new Set<string>();
      const deduped: (FacebookContentPost & { keyword: string })[] = [];

      for (const post of postsForKeyword) {
        // Use URL if available, otherwise use content hash as dedup key
        const dedupKey = post.postUrl ||
          `${post.authorName}|${post.postContent.slice(0, 50)}`;

        if (seenUrls.has(dedupKey)) {
          console.log(
            `[Facebook] Duplicate within "${keyword}": ${dedupKey.slice(0, 50)}...`
          );
          continue;
        }

        seenUrls.add(dedupKey);
        deduped.push(post);

        if (deduped.length >= MAX_ARTICLES_PER_KEYWORD) break;
      }

      console.log(
        `[Facebook] Keyword "${keyword}": ${postsForKeyword.length} scraped → ${deduped.length} after dedup`
      );
      dedupedByKeyword.set(keyword, deduped);
      totalAfterDedup += deduped.length;
    }

    const toStore = Array.from(dedupedByKeyword.values()).flat();
    const dedupRemoved = totalCollected - totalAfterDedup;
    const afterDedup = totalAfterDedup;
    const MAX_ARTICLES = 50;

    // Transform to collected_articles format
    const rows = toStore.map((post) => ({
      id: generatePostId(post, post.keyword),
      keyword: post.keyword,
      url: post.postUrl,
      title: createTitle(post.postContent),
      snippet: sanitizeText(post.postContent).slice(0, 500) || null,
      publishing_agency: post.authorName || null,
      published_at: parseFacebookDate(post.publishedAt),
      batch_id: batchId,
      source: "facebook",
    }));

    let newArticlesCount = 0;

    console.log(`[Facebook] Processing ${rows.length} rows for storage...`);

    if (rows.length > 0) {
      const { data: insertedData, error: insertError } = await supabase
        .from("collected_articles")
        .upsert(rows, { onConflict: "id" });

      if (insertError) {
        console.error("[Facebook] Insert error:", insertError);
        throw new Error(`Failed to insert articles: ${insertError.message}`);
      }

      console.log(
        `[Facebook] Successfully inserted ${rows.length} articles`
      );

      // Verify insertion
      const { data: checkData, error: checkError } = await supabase
        .from("collected_articles")
        .select("id, batch_id")
        .eq("batch_id", batchId);

      if (!checkError) {
        console.log(
          `[Facebook] Verified: ${checkData?.length || 0} articles in DB`
        );
        newArticlesCount = checkData?.length || 0;
      }
    }

    // Update collection run
    await supabase
      .from("collection_runs")
      .update({
        articles_collected: totalCollected,
        articles_stored: toStore.length,
        completed_at: new Date().toISOString(),
        status: "completed",
      })
      .eq("id", batchId);

    console.log(`[Facebook] Collection completed`);

    const response = {
      run: {
        id: batchId,
        keywords,
        articles_collected: totalCollected,
        articles_stored: toStore.length,
        after_dedup: afterDedup,
        after_date_filter: afterDedup,
        duplicates_removed: dedupRemoved,
        date_filtered: 0,
        capped: afterDedup > MAX_ARTICLES ? afterDedup - MAX_ARTICLES : 0,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        status: "completed",
      },
      articles: rows.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        keyword: r.keyword,
        publishing_agency: r.publishing_agency,
        published_at: r.published_at,
        source: "facebook" as const,
      })),
      allFetched: allPosts.map((p) => ({
        id: generatePostId(p, p.keyword),
        title: createTitle(p.postContent),
        url: p.postUrl,
        keyword: p.keyword,
        publishing_agency: p.authorName,
        published_at: p.publishedAt,
        source: "facebook" as const,
      })),
      pipeline: {
        totalFetched: totalCollected,
        afterDedup,
        afterDateFilter: afterDedup,
        afterCap: toStore.length,
        droppedByDedup: dedupRemoved,
        droppedByDateFilter: 0,
        droppedByCap: Math.max(0, afterDedup - MAX_ARTICLES),
        crossBatchDupes: 0,
        newArticles: newArticlesCount,
      },
      lastRunForKeywords: null,
    };

    return res.json(response);
  } catch (error: any) {
    console.error("[Facebook] Error:", error);
    return res.status(500).json({
      error: error.message || "Facebook collection failed",
    });
  }
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "social-media-server" });
});

// ─── Start Server ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  📱 Social Media Scraping Server running on http://localhost:${PORT}`);
  console.log(`  Endpoints:`);
  console.log(`    POST /api/collect-linkedin  — scrape LinkedIn content`);
  console.log(`    POST /api/collect-facebook  — scrape Facebook content`);
  console.log(`    GET  /api/health            — health check\n`);

  // Check for LinkedIn cookies
  const linkedinCookiePaths = [
    path.join(process.cwd(), "linkedin-cookies.json"),
    path.join(process.cwd(), "linkedin_cookie.json"),
  ];
  const linkedinCookieExists = linkedinCookiePaths.some((p) =>
    fs.existsSync(p)
  );
  console.log(
    `  LinkedIn: ${linkedinCookieExists ? "✓ Cookies file found" : "⚠ Cookies file not found — run: npm run linkedin:login"}`
  );

  // Check for Facebook cookies
  const facebookCookiePath = path.join(process.cwd(), "facebook-cookies.json");
  const facebookCookieExists = fs.existsSync(facebookCookiePath);
  console.log(
    `  Facebook: ${facebookCookieExists ? "✓ Cookies file found" : "⚠ Cookies file not found — run: npm run facebook:login"}\n`
  );
});
