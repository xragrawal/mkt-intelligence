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
      
      // Google News RSS: <link/> followed by URL text, OR <link>URL</link>
      let link = "";
      const linkContent = itemXml.match(/<link>([\s\S]*?)<\/link>/);
      if (linkContent?.[1]?.trim()) {
        link = linkContent[1].trim();
      } else {
        // Self-closing <link/> followed by URL as text node
        const selfClose = itemXml.match(/<link\s*\/>\s*(https?:\/\/[^\s<]+)/);
        if (selfClose?.[1]) {
          link = selfClose[1].trim();
        }
      }
      
      const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || null;
      const source = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || null;
      const sourceUrl = itemXml.match(/<source[^>]+url="([^"]+)"/)?.[1] || null;

      if (title && link) {
        // Use title + source for ID to avoid Google News URL issues
        const idSource = `${normalizeTitle(title)}|${source || ""}`;
        articles.push({
          id: sha256(idSource),
          keyword,
          url: link, // Use the actual article link (Google News redirect), NOT sourceUrl which is just the publisher domain
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
    const MAX_ARTICLES = 50;
    const DEFAULT_FILTER_DAYS = 30;

    const ALL_EDITIONS = [
      { gl: "US", hl: "en", label: "US" },
      { gl: "GB", hl: "en", label: "UK" },
      { gl: "ES", hl: "es", label: "Spain" },
      { gl: "DE", hl: "de", label: "Germany" },
      { gl: "FR", hl: "fr", label: "France" },
      { gl: "IN", hl: "en", label: "India" },
      { gl: "AU", hl: "en", label: "Australia" },
      { gl: "BR", hl: "pt-BR", label: "Brazil" },
      { gl: "JP", hl: "ja", label: "Japan" },
      { gl: "KR", hl: "ko", label: "South Korea" },
      { gl: "CA", hl: "en", label: "Canada" },
      { gl: "IT", hl: "it", label: "Italy" },
      { gl: "MX", hl: "es", label: "Mexico" },
      { gl: "SA", hl: "ar", label: "Saudi Arabia" },
      { gl: "AE", hl: "ar", label: "UAE" },
      { gl: "SG", hl: "en", label: "Singapore" },
      { gl: "ZA", hl: "en", label: "South Africa" },
      { gl: "NG", hl: "en", label: "Nigeria" },
      { gl: "ID", hl: "id", label: "Indonesia" },
      { gl: "CN", hl: "zh-CN", label: "China" },
    ];

    const { keywords, filterDays = DEFAULT_FILTER_DAYS, region = "Global" } = await req.json();

    // Filter editions based on user-selected region
    const editions = region === "Global"
      ? ALL_EDITIONS
      : ALL_EDITIONS.filter(e => e.label === region || e.gl === region);
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
    // editions already filtered above based on region param

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

    // Store up to MAX_ARTICLES, but first check DB for existing duplicates
    const toStore = filtered.slice(0, MAX_ARTICLES);

    if (toStore.length > 0) {
      // Fetch existing articles to avoid inserting duplicates across runs
      const { data: existingArticles } = await supabase
        .from("collected_articles")
        .select("id, url, title");

      const existingIds = new Set((existingArticles || []).map(a => a.id));
      const existingUrls = new Set((existingArticles || []).map(a => a.url));
      const existingContentWords = (existingArticles || []).map(a => getContentWords(a.title));

      const newArticles = toStore.filter(a => {
        // Skip if same ID already in DB
        if (existingIds.has(a.id)) return false;
        // Skip if same URL already in DB
        if (existingUrls.has(a.url)) return false;
        // Skip if fuzzy title match with existing DB article
        const words = getContentWords(a.title);
        for (const existing of existingContentWords) {
          if (titleSimilarity(words, existing) >= 0.8) return false;
        }
        return true;
      });

      const existingToReassociate = toStore.filter(a => !newArticles.includes(a));

      if (newArticles.length > 0) {
        const rows = newArticles.map((a) => ({
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

      // Re-associate existing articles with the current batch so scoring can find them
      if (existingToReassociate.length > 0) {
        const reIds = existingToReassociate.map(a => a.id);
        const { error: updateError } = await supabase
          .from("collected_articles")
          .update({ batch_id: batchId })
          .in("id", reIds);

        if (updateError) {
          console.error("Re-associate error:", updateError);
        }
      }
    }

    const actualStored = toStore.length;

    const latestPubAt = toStore
      .filter((a) => a.published_at)
      .sort((a, b) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime())[0]?.published_at;

    await supabase
      .from("collection_runs")
      .update({
        articles_collected: totalCollected,
        articles_stored: actualStored,
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
          articles_stored: actualStored,
          after_dedup: afterDedup,
          after_date_filter: afterDateFilter,
          duplicates_removed: totalCollected - afterDedup,
          date_filtered: afterDedup - afterDateFilter,
          capped: afterDateFilter > MAX_ARTICLES ? afterDateFilter - MAX_ARTICLES : 0,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          status: "completed",
        },
        articles: toStore.map(a => ({
          id: a.id,
          title: a.title,
          url: a.url,
          keyword: a.keyword,
          publishing_agency: a.publishing_agency,
          published_at: a.published_at,
        })),
        allFetched: allArticles.map(a => ({
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
          afterCap: toStore.length,
          droppedByDedup: totalCollected - afterDedup,
          droppedByDateFilter: afterDedup - afterDateFilter,
          droppedByCap: Math.max(0, afterDateFilter - MAX_ARTICLES),
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
