import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sha256(str: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, "0");
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Extract significant words from a title for fuzzy matching.
 * Returns a set of "content words" (3+ chars, lowercased, no stop words).
 */
const STOP_WORDS = new Set(["the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out", "has", "its", "how", "who", "what", "when", "where", "why", "with", "from", "they", "been", "have", "will", "this", "that", "than", "then", "into", "over", "also", "new", "more"]);

function getContentWords(title: string): Set<string> {
  const words = normalizeTitle(title).split(" ");
  return new Set(words.filter(w => w.length >= 3 && !STOP_WORDS.has(w)));
}

function titleSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const w of a) { if (b.has(w)) overlap++; }
  return overlap / Math.min(a.size, b.size);
}

function getUrlSlug(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.toLowerCase().replace(/\/+/g, "/").replace(/\/$/, "");
  } catch {
    return url;
  }
}

/**
 * Resolve Google News redirect URLs to actual article URLs.
 * Strategy: Follow redirects. If still on news.google.com, try extracting from consent page.
 */
async function resolveGoogleNewsUrl(url: string): Promise<string> {
  if (!url.includes("news.google.com")) return url;
  try {
    // Try following redirects with GET (HEAD often doesn't work with Google)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // Check if redirected to actual article
    if (resp.url && !resp.url.includes("news.google.com") && !resp.url.includes("consent.google.com")) {
      return resp.url;
    }

    // Try parsing the HTML for meta refresh or canonical URL
    const html = await resp.text();
    
    // Look for data-redirect attribute or canonical link
    const canonicalMatch = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/);
    if (canonicalMatch?.[1] && !canonicalMatch[1].includes("news.google.com")) {
      return canonicalMatch[1];
    }

    // Look for meta refresh
    const metaRefresh = html.match(/<meta[^>]+http-equiv="refresh"[^>]+content="[^"]*url=([^"'\s>]+)/i);
    if (metaRefresh?.[1] && !metaRefresh[1].includes("news.google.com")) {
      return metaRefresh[1];
    }

    // Look for article URL in a[href] pointing to external site
    const articleLink = html.match(/href="(https?:\/\/(?!news\.google\.com)[^"]+)"/);
    if (articleLink?.[1]) {
      return articleLink[1];
    }

    return url;
  } catch {
    return url;
  }
}

interface RSSArticle {
  id: string;
  keyword: string;
  url: string;
  originalUrl: string;
  title: string;
  publishing_agency: string | null;
  published_at: string | null;
}

async function fetchGoogleNewsRSS(keyword: string, edition: string = "US", lang: string = "en"): Promise<RSSArticle[]> {
  const encodedKeyword = encodeURIComponent(`"${keyword}"`);
  const rssUrl = `https://news.google.com/rss/search?q=${encodedKeyword}&hl=${lang}&gl=${edition}&ceid=${edition}:${lang}`;

  try {
    const response = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Signal/1.0)" },
    });
    if (!response.ok) {
      console.error(`RSS fetch failed for "${keyword}" (${edition}:${lang}): ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const articles: RSSArticle[] = [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      const title = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || "";
      const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ||
                   itemXml.match(/<link\s*\/>([\s\S]*?)(?=<)/)?.[1]?.trim() || "";
      const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || null;
      const source = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || null;
      
      // Try to extract the source URL from <source url="..."> attribute
      const sourceUrl = itemXml.match(/<source[^>]+url="([^"]+)"/)?.[1] || null;

      if (title && link) {
        articles.push({
          id: sha256(link),
          keyword,
          url: link,
          originalUrl: link,
          title,
          publishing_agency: source,
          published_at: pubDate ? new Date(pubDate).toISOString() : null,
        });
      }
    }

    return articles;
  } catch (e) {
    console.error(`RSS error for "${keyword}":`, e);
    return [];
  }
}

function deduplicateArticles(articles: RSSArticle[]): { deduped: RSSArticle[]; removed: number } {
  const seen = new Map<string, RSSArticle>();
  const seenTitles = new Set<string>();
  const seenSlugs = new Set<string>();
  const seenAgencyTime = new Set<string>();
  const seenContentWords: Array<{ words: Set<string>; article: RSSArticle }> = [];

  for (const article of articles) {
    if (seen.has(article.url)) continue;
    
    const normTitle = normalizeTitle(article.title);
    if (seenTitles.has(normTitle)) continue;
    
    if (article.publishing_agency && article.published_at) {
      const key = `${article.publishing_agency}|${article.published_at}`;
      if (seenAgencyTime.has(key)) continue;
      seenAgencyTime.add(key);
    }
    
    const slug = getUrlSlug(article.url);
    if (seenSlugs.has(slug)) continue;

    // Fuzzy title similarity check — catch same content with different URLs
    const words = getContentWords(article.title);
    let isDuplicate = false;
    for (const existing of seenContentWords) {
      if (titleSimilarity(words, existing.words) >= 0.8) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;

    seen.set(article.url, article);
    seenTitles.add(normTitle);
    seenSlugs.add(slug);
    seenContentWords.push({ words, article });
  }

  const deduped = Array.from(seen.values());
  return { deduped, removed: articles.length - deduped.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, filterDays = 30 } = await req.json();
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return new Response(JSON.stringify({ error: "keywords array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check last run for these keywords
    const { data: lastRuns } = await supabase
      .from("collection_runs")
      .select("id, keywords, completed_at, articles_stored, articles_collected")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(10);

    const matchingLastRun = lastRuns?.find(r => {
      const sorted1 = [...keywords].sort().join(",");
      const sorted2 = [...(r.keywords || [])].sort().join(",");
      return sorted1 === sorted2;
    });

    const batchId = `batch_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}`;
    const editions = [
      { gl: "US", hl: "en" },
      { gl: "ES", hl: "es" },
    ];

    await supabase.from("collection_runs").insert({
      id: batchId,
      keywords,
      status: "running",
    });

    // Fetch articles for all keyword x edition combos
    let allArticles: RSSArticle[] = [];
    for (const keyword of keywords) {
      for (const edition of editions) {
        const articles = await fetchGoogleNewsRSS(keyword, edition.gl, edition.hl);
        allArticles = allArticles.concat(articles);
      }
    }

    const totalCollected = allArticles.length;

    // Deduplicate (now includes fuzzy title matching)
    const { deduped, removed: dedupRemoved } = deduplicateArticles(allArticles);
    const afterDedup = deduped.length;

    // Filter by user-specified date range
    const days = Math.max(1, Math.min(365, Number(filterDays) || 30));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const filtered = deduped.filter((a) => {
      if (!a.published_at) return true;
      return new Date(a.published_at) >= cutoff;
    });
    const afterDateFilter = filtered.length;

    // Store (limit 20 for MVP)
    const toStore = filtered.slice(0, 20);

    // Resolve Google News URLs to actual publisher URLs (parallel, max 10 at a time)
    const resolvedArticles: RSSArticle[] = [];
    for (let i = 0; i < toStore.length; i += 10) {
      const chunk = toStore.slice(i, i + 10);
      const resolved = await Promise.all(
        chunk.map(async (a) => {
          const realUrl = await resolveGoogleNewsUrl(a.url);
          return { ...a, url: realUrl, originalUrl: a.url, id: sha256(realUrl) };
        })
      );
      resolvedArticles.push(...resolved);
    }

    // Also resolve URLs for allFetched (for table display) — resolve first 200 for performance
    const allFetchedResolved = await Promise.all(
      allArticles.slice(0, 200).map(async (a) => {
        const realUrl = await resolveGoogleNewsUrl(a.url);
        return { ...a, url: realUrl };
      })
    );

    if (resolvedArticles.length > 0) {
      const rows = resolvedArticles.map((a) => ({
        id: a.id,
        keyword: a.keyword,
        url: a.url,
        title: a.title,
        publishing_agency: a.publishing_agency,
        published_at: a.published_at,
        batch_id: batchId,
      }));

      const { error: insertError } = await supabase
        .from("collected_articles")
        .upsert(rows, { onConflict: "id" });

      if (insertError) {
        console.error("Insert error:", insertError);
      }
    }

    const latestPubAt = resolvedArticles
      .filter((a) => a.published_at)
      .sort((a, b) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime())[0]?.published_at;

    await supabase
      .from("collection_runs")
      .update({
        articles_collected: totalCollected,
        articles_stored: resolvedArticles.length,
        completed_at: new Date().toISOString(),
        status: "completed",
        last_published_at: latestPubAt || null,
      })
      .eq("id", batchId);

    return new Response(
      JSON.stringify({
        run: {
          id: batchId,
          keywords,
          articles_collected: totalCollected,
          articles_stored: resolvedArticles.length,
          after_dedup: afterDedup,
          after_date_filter: afterDateFilter,
          duplicates_removed: totalCollected - afterDedup,
          date_filtered: afterDedup - afterDateFilter,
          capped: afterDateFilter > 20 ? afterDateFilter - 20 : 0,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          status: "completed",
        },
        articles: resolvedArticles.map(a => ({
          id: a.id,
          title: a.title,
          url: a.url,
          keyword: a.keyword,
          publishing_agency: a.publishing_agency,
          published_at: a.published_at,
        })),
        allFetched: allFetchedResolved.map(a => ({
          id: a.id,
          title: a.title,
          url: a.url,
          keyword: a.keyword,
          publishing_agency: a.publishing_agency,
          published_at: a.published_at,
        })),
        pipeline: {
          totalFetched: totalCollected,
          afterDedup: afterDedup,
          afterDateFilter: afterDateFilter,
          afterCap: resolvedArticles.length,
          droppedByDedup: totalCollected - afterDedup,
          droppedByDateFilter: afterDedup - afterDateFilter,
          droppedByCap: Math.max(0, afterDateFilter - 20),
        },
        lastRunForKeywords: matchingLastRun ? {
          id: matchingLastRun.id,
          completedAt: matchingLastRun.completed_at,
          articlesStored: matchingLastRun.articles_stored,
          articlesCollected: matchingLastRun.articles_collected,
        } : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("collect-news error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
