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

function canonicalizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  return String(url).trim().split("?")[0];
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
 * Use the full LinkedIn post content as the "title" we send downstream.
 * We still sanitize and collapse whitespace, but do not truncate — this allows
 * Step 2 / LLM scoring to see the entire text of the post.
 */
function createTitle(postContent: string): string {
  if (!postContent) return "(LinkedIn post)";
  const sanitized = sanitizeText(postContent);
  return sanitized.replace(/\s+/g, " ").trim();
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

    // Basic deduplication by post URL (canonicalized)
    const seenUrls = new Set<string>();
    const deduped = allPosts.filter((p) => {
      const url = canonicalizeUrl(p.postUrl);
      if (!url || seenUrls.has(url)) return false;
      seenUrls.add(url);
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

    // Transform to collected_articles candidate rows
    const rows = toStore.map((post) => ({
      id: generatePostId(post, post.keyword),
      keyword: post.keyword,
      // Store canonical URL so repeats across runs match reliably
      url: canonicalizeUrl(post.postUrl),
      title: createTitle(post.postContent),
      snippet: sanitizeText(post.postContent).slice(0, 500) || null,
      publishing_agency: post.authorName || null,
      published_at: parseLinkedInDate(post.publishedAt),
      batch_id: batchId,
      source: "linkedin",
    }));

    // Cross-batch logic + re-association (Gate 1 equivalent for LinkedIn)
    // - New articles: inserted with current batch_id
    // - Existing, never-seen articles: re-associated to this batch
    // - Existing, already seen (scored or deep-dived): skipped entirely
    let newArticlesCount = 0;
    let crossBatchDupes = 0;
    let visitedAndSkipped = 0;

    console.log(`[LinkedIn Server] Processing ${rows.length} rows for storage with cross-batch checks...`);
    let responseArticles: Array<{
      id: string;
      title: string;
      url: string;
      keyword: string;
      publishing_agency: string | null;
      published_at: string | null;
      source: "linkedin";
    }> = [];

    if (rows.length > 0) {
      const candidateIds = rows.map((r) => r.id);
      const candidateUrls = rows.map((r) => canonicalizeUrl(r.url)).filter((u): u is string => !!u);

      // Existing collected articles for these ids/URLs
      const { data: existingArticles, error: existingErr } = await supabase
        .from("collected_articles")
        .select("id, url, batch_id, original_batch_id")
        .in("id", candidateIds);

      if (existingErr) {
        console.error("[LinkedIn Server] Error fetching existing collected_articles:", existingErr);
        throw new Error(`Failed to check existing LinkedIn articles: ${existingErr.message}`);
      }

      const existingById = new Map<string, { id: string; url: string; batch_id: string | null; original_batch_id: string | null }>();
      (existingArticles || []).forEach((row) => {
        existingById.set(row.id, row as any);
      });

      // Also match by URL because historical IDs included keyword (so reruns can create new IDs for same post)
      const { data: existingByUrlRows, error: existingByUrlErr } = await supabase
        .from("collected_articles")
        .select("id, url, batch_id, original_batch_id")
        .in("url", candidateUrls);

      if (existingByUrlErr) {
        console.error("[LinkedIn Server] Error fetching existing collected_articles by URL:", existingByUrlErr);
        throw new Error(`Failed to check existing LinkedIn URLs: ${existingByUrlErr.message}`);
      }

      const existingByUrl = new Map<string, { id: string; url: string; batch_id: string | null; original_batch_id: string | null }>();
      (existingByUrlRows || []).forEach((row) => {
        const key = canonicalizeUrl(row.url);
        if (key) existingByUrl.set(key, row as any);
      });

      // Check if articles have ever been scored (Step 2) or deep-dived (Step 3)
      const { data: scoredRows, error: scoredErr } = await supabase
        .from("scored_articles")
        .select("article_id")
        .in("article_id", candidateIds);

      if (scoredErr) {
        console.error("[LinkedIn Server] Error checking scored_articles:", scoredErr);
        throw new Error(`Failed to check scored LinkedIn articles: ${scoredErr.message}`);
      }

      const { data: oppPacks, error: packsErr } = await supabase
        .from("opportunity_packs")
        .select("article_url")
        .in("article_url", candidateUrls);

      if (packsErr) {
        console.error("[LinkedIn Server] Error checking opportunity_packs:", packsErr);
        throw new Error(`Failed to check LinkedIn opportunity packs: ${packsErr.message}`);
      }

      const seenArticleIds = new Set<string>((scoredRows || []).map((r) => r.article_id));
      const seenArticleUrls = new Set<string>((oppPacks || []).map((p) => canonicalizeUrl(p.article_url)));

      const newArticles: typeof rows = [];
      const toReassociateIds: string[] = [];
      const storedForScoring: typeof rows = [];

      for (const row of rows) {
        const key = canonicalizeUrl(row.url);
        const existing = existingById.get(row.id) || (key ? existingByUrl.get(key) : undefined);

        if (!existing) {
          // Completely new article
          newArticles.push(row);
          storedForScoring.push(row);
          continue;
        }

        // If we've ever "seen" this article before (scored or deep-dived), skip it entirely
        if (seenArticleIds.has(existing.id) || (key && seenArticleUrls.has(key))) {
          visitedAndSkipped += 1;
          continue;
        }

        // Existing in collected_articles but never surfaced to user → re-associate
        toReassociateIds.push(existing.id);
        storedForScoring.push({ ...row, id: existing.id });
      }

      newArticlesCount = newArticles.length;
      crossBatchDupes = rows.length - newArticles.length;

      console.log(
        `[LinkedIn Server] Cross-batch summary: ${newArticlesCount} new, ${toReassociateIds.length} re-associated, ${visitedAndSkipped} previously seen + skipped`
      );

      if (newArticles.length > 0) {
        const { error: insertError } = await supabase
          .from("collected_articles")
          .upsert(
            newArticles.map((a) => ({
              id: a.id,
              keyword: a.keyword,
              url: a.url,
              title: a.title,
              snippet: a.snippet,
              publishing_agency: a.publishing_agency,
              published_at: a.published_at,
              batch_id: batchId,
              source: "linkedin",
            })),
            { onConflict: "id" }
          );

        if (insertError) {
          console.error("[LinkedIn Server] Insert error:", insertError);
          throw new Error(`Failed to insert LinkedIn articles: ${insertError.message}`);
        }
      }

      // Re-associate existing-but-never-seen articles to current batch
      if (toReassociateIds.length > 0) {
        const { data: existingRows } = await supabase
          .from("collected_articles")
          .select("id, batch_id, original_batch_id")
          .in("id", toReassociateIds);

        if (existingRows && existingRows.length > 0) {
          for (const row of existingRows) {
            if (!row.original_batch_id) {
              await supabase
                .from("collected_articles")
                .update({ original_batch_id: row.batch_id })
                .eq("id", row.id);
            }
          }
        }

        const { error: updateError } = await supabase
          .from("collected_articles")
          .update({ batch_id: batchId })
          .in("id", toReassociateIds);

        if (updateError) {
          console.error("[LinkedIn Server] Re-associate error:", updateError);
          throw new Error(`Failed to re-associate LinkedIn articles: ${updateError.message}`);
        }
      }

      // Make Step 1 UI only show what actually flows forward (new + re-associated)
      responseArticles = storedForScoring.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        keyword: r.keyword,
        publishing_agency: r.publishing_agency,
        published_at: r.published_at,
        source: "linkedin" as const,
      }));
    } else {
      console.warn(
        `[LinkedIn Server] WARNING: No rows to process! toStore.length=${toStore.length}, rows.length=${rows.length}`
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
        // Only count new + re-associated articles as "stored for scoring"
        articles_stored: newArticlesCount + (toStore.length - newArticlesCount - visitedAndSkipped),
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
        articles_stored: newArticlesCount + (toStore.length - newArticlesCount - visitedAndSkipped),
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
      // new + re-associated only (excludes previously seen/skipped)
      articles: responseArticles,
      allFetched: allPosts.map((p) => ({
        id: generatePostId(p, p.keyword),
        title: createTitle(p.postContent),
        url: canonicalizeUrl(p.postUrl),
        keyword: p.keyword,
        publishing_agency: p.authorName,
        published_at: p.publishedAt,
        source: "linkedin" as const,
      })),
      pipeline: {
        totalFetched: totalCollected,
        afterDedup,
        afterDateFilter,
        afterCap: newArticlesCount + (toStore.length - newArticlesCount - visitedAndSkipped),
        droppedByDedup: dedupRemoved,
        droppedByDateFilter: 0,
        droppedByCap: Math.max(0, afterDateFilter - MAX_ARTICLES),
        crossBatchDupes,
        newArticles: newArticlesCount,
        visitedAndSkipped,
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
