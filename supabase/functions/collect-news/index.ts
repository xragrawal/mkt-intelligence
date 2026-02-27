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
  title: string;
  publishing_agency: string | null;
  published_at: string | null;
}

async function fetchGoogleNewsRSS(keyword: string, edition: string = "US", lang: string = "en"): Promise<RSSArticle[]> {
  const encodedKeyword = encodeURIComponent(`"${keyword}"`);
  const rssUrl = `https://news.google.com/rss/search?q=${encodedKeyword}&hl=${lang}&gl=${edition}&ceid=${edition}:${lang}`;

  try {
    const response = await fetch(rssUrl, {
      headers: { "User-Agent": "Signal/1.0" },
    });
    if (!response.ok) {
      console.error(`RSS fetch failed for "${keyword}" (${edition}:${lang}): ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const articles: RSSArticle[] = [];

    // Simple XML parsing for RSS items
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      const title = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || "";
      const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || 
                   itemXml.match(/<link\s*\/>([\s\S]*?)(?=<)/)?.[1]?.trim() || "";
      const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || null;
      const source = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || null;

      if (title && link) {
        articles.push({
          id: sha256(link),
          keyword,
          url: link,
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

function deduplicateArticles(articles: RSSArticle[]): RSSArticle[] {
  const seen = new Map<string, RSSArticle>();
  const seenTitles = new Set<string>();
  const seenSlugs = new Set<string>();
  const seenAgencyTime = new Set<string>();

  for (const article of articles) {
    // Rule 1: Exact URL
    if (seen.has(article.url)) continue;

    // Rule 2: Normalized title
    const normTitle = normalizeTitle(article.title);
    if (seenTitles.has(normTitle)) continue;

    // Rule 3: Same agency + timestamp
    if (article.publishing_agency && article.published_at) {
      const key = `${article.publishing_agency}|${article.published_at}`;
      if (seenAgencyTime.has(key)) continue;
      seenAgencyTime.add(key);
    }

    // Rule 4: URL slug
    const slug = getUrlSlug(article.url);
    if (seenSlugs.has(slug)) continue;

    seen.set(article.url, article);
    seenTitles.add(normTitle);
    seenSlugs.add(slug);
  }

  return Array.from(seen.values());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords } = await req.json();
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return new Response(JSON.stringify({ error: "keywords array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const batchId = `batch_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}`;
    const editions = [
      { gl: "US", hl: "en" },
      { gl: "ES", hl: "es" },
    ];

    // Create run record
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

    // Deduplicate
    const deduped = deduplicateArticles(allArticles);
    const afterDedup = deduped.length;

    // Filter to last 7 days
    const filterDays = 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filterDays);
    const filtered = deduped.filter((a) => {
      if (!a.published_at) return true;
      return new Date(a.published_at) >= cutoff;
    });
    const afterDateFilter = filtered.length;

    // Store (limit 20 for MVP — expand later)
    const toStore = filtered.slice(0, 20);
    if (toStore.length > 0) {
      const rows = toStore.map((a) => ({
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

    // Update run
    const latestPubAt = toStore
      .filter((a) => a.published_at)
      .sort((a, b) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime())[0]?.published_at;

    await supabase
      .from("collection_runs")
      .update({
        articles_collected: totalCollected,
        articles_stored: toStore.length,
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
          articles_stored: toStore.length,
          after_dedup: afterDedup,
          after_date_filter: afterDateFilter,
          duplicates_removed: totalCollected - afterDedup,
          date_filtered: afterDedup - afterDateFilter,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          status: "completed",
        },
        articles: toStore,
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
