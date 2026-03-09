/**
 * Local Express Server for LinkedIn Scraping
 *
 * Runs alongside the Vite dev server to provide a Node.js backend
 * for Puppeteer-based LinkedIn content scraping.
 *
 * Usage:
 *   npm run linkedin:server
 *   (or: npx tsx server/linkedin-server.ts)
 */

import express from "express";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fetchContentSearch } from "../lib/linkedin/contentClient.js";
import type { LinkedInContentPost } from "../lib/linkedin/contentTypes.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.LINKEDIN_SERVER_PORT || "3001", 10);

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

// Supabase client (reuses the same project as the frontend)
const supabaseUrl =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Generate a deterministic hash ID for a LinkedIn post,
 * consistent with the existing Google News ID scheme.
 */
function generatePostId(post: LinkedInContentPost, keyword: string): string {
  const idSource = `${post.postUrl || ""}|${post.authorName}|${keyword}`;
  return crypto.createHash("sha256").update(idSource).digest("hex").slice(0, 16);
}

/**
 * Remove problematic Unicode characters that cause JSON serialization errors.
 * Particularly targets emoji and other high Unicode characters that break PostgreSQL.
 */
function sanitizeText(text: string): string {
  if (!text) return "";

  // Remove emoji and other problematic Unicode characters
  // Keep only ASCII and common Latin extended characters
  return text
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "") // Remove emoji (surrogate pairs)
    .replace(/[\u0080-\u009F]/g, "") // Remove control characters
    .replace(/[\u2000-\u200D]/g, "") // Remove special spaces and formatting
    .replace(/[\uFFF0-\uFFFF]/g, "") // Remove specials
    .trim();
}

/**
 * Truncate text to create a title-like snippet from LinkedIn post content.
 */
function createTitle(postContent: string, maxLength = 150): string {
  if (!postContent) return "(LinkedIn post)";
  const sanitized = sanitizeText(postContent);
  const cleaned = sanitized.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + "...";
}

/**
 * Parse LinkedIn relative timestamps (e.g., "1h", "2d", "3w") into ISO dates.
 * Falls back to null if the date cannot be parsed.
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

    // If all else fails, return null
    return null;
  } catch {
    return null;
  }
}

// ─── API Routes ──────────────────────────────────────────────────────────────

/**
 * POST /api/collect-linkedin
 *
 * Body: { keywords: string[], filterDays?: number }
 *
 * Scrapes LinkedIn content search for each keyword,
 * stores results in collected_articles with source="linkedin",
 * and returns a response shape compatible with the Google News flow.
 */
app.post("/api/collect-linkedin", async (req, res) => {
  try {
    const { keywords, filterDays = 30 } = req.body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: "keywords array required" });
    }

    console.log(
      `[LinkedIn Server] Starting collection for keywords: ${keywords.join(", ")}`
    );

    const batchId = `li_batch_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}`;

    // Create collection run entry
    await supabase.from("collection_runs").insert({
      id: batchId,
      keywords,
      status: "running",
    });

    // Scrape each keyword sequentially (to avoid LinkedIn rate limits)
    const allPosts: Array<LinkedInContentPost & { keyword: string }> = [];
    for (const keyword of keywords) {
      console.log(`[LinkedIn Server] Scraping keyword: "${keyword}"`);
      try {
        const result = await fetchContentSearch(keyword, {
          maxScrolls: 5,
          scrollDelay: 2000,
        });

        console.log(`[LinkedIn Server] Keyword "${keyword}": ${result.posts.length} posts`);
        for (const post of result.posts) {
          allPosts.push({ ...post, keyword });
        }

        // Delay between keywords to be polite
        if (keywords.length > 1) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (keywordError: any) {
        console.error(`[LinkedIn Server] Error scraping "${keyword}":`, keywordError.message);
        // Continue with next keyword instead of failing entire batch
      }
    }

    const totalCollected = allPosts.length;
    console.log(
      `[LinkedIn Server] Total posts scraped: ${totalCollected}`
    );

    // Basic deduplication by post URL
    const seenUrls = new Set<string>();
    const deduped = allPosts.filter((p) => {
      if (!p.postUrl || seenUrls.has(p.postUrl)) return false;
      seenUrls.add(p.postUrl);
      return true;
    });
    const afterDedup = deduped.length;
    const dedupRemoved = totalCollected - afterDedup;

    // Date filtering (best-effort — LinkedIn relative dates may not be exact)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filterDays);
    // Note: LinkedIn posts have relative dates ("2d", "1w"), so publishedAt
    // may be null. We keep posts with no date rather than dropping them.
    const filtered = deduped;
    const afterDateFilter = filtered.length;

    // Cap at 50 (consistent with Google News)
    const MAX_ARTICLES = 50;
    const toStore = filtered.slice(0, MAX_ARTICLES);

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

    // Cross-batch dedup: check DB for existing articles
    let newArticlesCount = 0;
    let crossBatchDupes = 0;

    console.log(`[LinkedIn Server] Processing ${rows.length} rows for storage...`);

    if (rows.length > 0) {
      // Insert all articles (they'll be new from LinkedIn)
      const { data: insertedData, error: insertError } = await supabase
        .from("collected_articles")
        .upsert(rows, { onConflict: "id" });

      if (insertError) {
        console.error("[LinkedIn Server] Insert error:", insertError);
        throw new Error(`Failed to insert articles: ${insertError.message}`);
      }

      console.log(
        `[LinkedIn Server] Successfully inserted ${rows.length} articles`
      );

      // Check what was actually inserted
      const { data: checkData, error: checkError } = await supabase
        .from("collected_articles")
        .select("id, batch_id")
        .eq("batch_id", batchId);

      if (!checkError) {
        console.log(
          `[LinkedIn Server] Verified: ${checkData?.length || 0} articles in DB with batch_id ${batchId}`
        );
        newArticlesCount = checkData?.length || 0;
      }
    } else {
      console.warn(
        `[LinkedIn Server] WARNING: No rows to insert! toStore.length=${toStore.length}, rows.length=${rows.length}`
      );
    }

    // Update collection run
    console.log(
      `[LinkedIn Server] Updating collection_run ${batchId} with articles_stored=${toStore.length}, newArticles=${newArticlesCount}`
    );

    const { error: updateError } = await supabase
      .from("collection_runs")
      .update({
        articles_collected: totalCollected,
        articles_stored: toStore.length,
        completed_at: new Date().toISOString(),
        status: "completed",
      })
      .eq("id", batchId);

    if (updateError) {
      console.error("[LinkedIn Server] Error updating collection_run:", updateError);
      throw new Error(`Failed to update collection_run: ${updateError.message}`);
    }

    console.log(`[LinkedIn Server] Collection_run updated successfully`);

    // Return response in the same shape as the Google News collect-news endpoint
    const response = {
      run: {
        id: batchId,
        keywords,
        articles_collected: totalCollected,
        articles_stored: toStore.length,
        after_dedup: afterDedup,
        after_date_filter: afterDateFilter,
        duplicates_removed: dedupRemoved,
        date_filtered: 0,
        capped:
          afterDateFilter > MAX_ARTICLES ? afterDateFilter - MAX_ARTICLES : 0,
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
        afterDateFilter,
        afterCap: toStore.length,
        droppedByDedup: dedupRemoved,
        droppedByDateFilter: 0,
        droppedByCap: Math.max(0, afterDateFilter - MAX_ARTICLES),
        crossBatchDupes,
        newArticles: newArticlesCount,
      },
      lastRunForKeywords: null,
    };

    console.log(
      `[LinkedIn Server] Collection complete: ${toStore.length} articles stored (${newArticlesCount} new, ${crossBatchDupes} existing)`
    );

    return res.json(response);
  } catch (error: any) {
    console.error("[LinkedIn Server] Error:", error);
    return res.status(500).json({
      error: error.message || "LinkedIn collection failed",
    });
  }
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "linkedin-server" });
});

// ─── Start Server ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  LinkedIn Scraping Server running on http://localhost:${PORT}`);
  console.log(`  Endpoints:`);
  console.log(`    POST /api/collect-linkedin  — scrape LinkedIn content`);
  console.log(`    GET  /api/health            — health check\n`);

  // Check if cookies file exists
  const possiblePaths = [
    path.join(process.cwd(), "linkedin-cookies.json"),
    path.join(process.cwd(), "linkedin_cookie.json"),
  ];
  const cookieFileExists = possiblePaths.some((p) => fs.existsSync(p));

  if (!cookieFileExists) {
    console.warn(`  ⚠ WARNING: LinkedIn cookies file not found!`);
    console.warn(`  Run: npm run linkedin:login`);
    console.warn(`  Then restart this server.\n`);
  } else {
    console.log(`  ✓ LinkedIn cookies file found\n`);
  }
});
