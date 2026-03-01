import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function fastHash(str: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i];
    hash = hash & hash;
  }
  return "li_" + Math.abs(hash).toString(16).padStart(16, "0");
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

interface LinkedInArticle {
  id: string;
  keyword: string;
  url: string;
  title: string;
  publishing_agency: string | null;
  published_at: string | null;
  source: "linkedin";
}

/**
 * LinkedIn Voyager API content search.
 * Uses li_at + JSESSIONID cookies for authentication.
 */
async function fetchLinkedInContent(keyword: string, cookies: any[]): Promise<LinkedInArticle[]> {
  const liAt = cookies.find((c: any) => c.name === "li_at")?.value;
  const jsessionId = cookies.find((c: any) => c.name === "JSESSIONID")?.value;

  if (!liAt || !jsessionId) {
    console.error("Missing li_at or JSESSIONID cookies");
    return [];
  }

  // Extract CSRF token from JSESSIONID (strip surrounding quotes)
  const csrfToken = jsessionId.replace(/"/g, "");

  const encodedKeyword = encodeURIComponent(keyword);
  const voyagerUrl = `https://www.linkedin.com/voyager/api/search/dash/clusters?decorationId=com.linkedin.voyager.dash.deco.search.SearchClusterCollection-186&origin=FACETED_SEARCH&q=all&query=(keywords:${encodedKeyword},resultType:(CONTENT))&start=0&count=20`;

  try {
    const response = await fetch(voyagerUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/vnd.linkedin.normalized+json+2.1",
        "csrf-token": csrfToken,
        "Cookie": `li_at=${liAt}; JSESSIONID=${jsessionId}`,
        "x-li-lang": "en_US",
        "x-restli-protocol-version": "2.0.0",
      },
    });

    if (!response.ok) {
      console.error(`LinkedIn API returned ${response.status} for "${keyword}"`);
      if (response.status === 401 || response.status === 403) {
        console.error("LinkedIn cookies may have expired. Please update LINKEDIN_COOKIES secret.");
      }
      return [];
    }

    const data = await response.json();
    const articles: LinkedInArticle[] = [];

    // Parse the Voyager response — extract posts from included entities
    const included = data.included || [];

    for (const entity of included) {
      // Look for update entities (posts)
      if (entity.$type === "com.linkedin.voyager.dash.feed.Update" || entity.commentary) {
        const commentary = entity.commentary?.text?.text || entity.commentary?.text || "";
        const actorName = entity.actor?.name?.text || entity.actorName || "";
        const actorUrl = entity.actor?.navigationUrl || "";

        // Try to extract a meaningful title from post content
        const title = commentary
          ? (commentary.length > 120 ? commentary.slice(0, 117) + "..." : commentary)
          : `LinkedIn post by ${actorName || "Unknown"}`;

        if (!title || title.length < 10) continue;

        const postUrl = entity.permalink || entity.navigationUrl || 
          (entity.updateMetadata?.urn ? `https://www.linkedin.com/feed/update/${entity.updateMetadata.urn}` : "");

        const publishedAt = entity.actor?.subDescription?.text 
          ? null // LinkedIn uses relative time like "2d ago", not parseable
          : null;

        const idSource = `linkedin|${normalizeTitle(title)}|${actorName}`;

        articles.push({
          id: fastHash(idSource),
          keyword,
          url: postUrl || `https://www.linkedin.com/search/results/content/?keywords=${encodedKeyword}`,
          title,
          publishing_agency: actorName || "LinkedIn",
          published_at: publishedAt,
          source: "linkedin",
        });
      }
    }

    // Fallback: also look for search result text snippets
    for (const entity of included) {
      if (entity.$type === "com.linkedin.voyager.dash.search.SearchNormalizedContent" ||
          entity.$type === "com.linkedin.voyager.dash.search.EntityResultViewModel") {
        const title = entity.title?.text || entity.headline?.text || entity.summary?.text || "";
        const subtitle = entity.primarySubtitle?.text || entity.secondarySubtitle?.text || "";
        const navigationUrl = entity.navigationUrl || "";

        if (!title || title.length < 10) continue;

        const idSource = `linkedin|${normalizeTitle(title)}|${subtitle}`;
        const existing = articles.find(a => a.id === fastHash(idSource));
        if (existing) continue;

        articles.push({
          id: fastHash(idSource),
          keyword,
          url: navigationUrl || `https://www.linkedin.com/search/results/content/?keywords=${encodedKeyword}`,
          title: title.length > 120 ? title.slice(0, 117) + "..." : title,
          publishing_agency: subtitle || "LinkedIn",
          published_at: null,
          source: "linkedin",
        });
      }
    }

    console.log(`LinkedIn: found ${articles.length} results for "${keyword}"`);
    return articles;
  } catch (e) {
    console.error(`LinkedIn fetch error for "${keyword}":`, e);
    return [];
  }
}

function deduplicateArticles(articles: LinkedInArticle[]): { deduped: LinkedInArticle[]; removed: number } {
  const seen = new Map<string, LinkedInArticle>();
  for (const article of articles) {
    if (!seen.has(article.id)) {
      seen.set(article.id, article);
    }
  }
  const deduped = Array.from(seen.values());
  return { deduped, removed: articles.length - deduped.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MAX_ARTICLES = 30;

    const { keywords, filterDays = 30 } = await req.json();

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return new Response(JSON.stringify({ error: "keywords array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load cookies
    const cookiesStr = Deno.env.get("LINKEDIN_COOKIES");
    if (!cookiesStr) {
      return new Response(JSON.stringify({ error: "LINKEDIN_COOKIES not configured. Add your LinkedIn session cookies in Settings." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cookies: any[];
    try {
      cookies = JSON.parse(cookiesStr);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid LINKEDIN_COOKIES format. Must be a JSON array." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const batchId = `li_batch_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}`;

    await supabase.from("collection_runs").insert({
      id: batchId,
      keywords,
      status: "running",
    });

    // Fetch LinkedIn content for each keyword sequentially (to avoid rate limits)
    const allArticles: LinkedInArticle[] = [];
    for (const keyword of keywords) {
      const results = await fetchLinkedInContent(keyword, cookies);
      allArticles.push(...results);
      // Small delay between keywords
      if (keywords.length > 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const totalCollected = allArticles.length;
    const { deduped, removed: dedupRemoved } = deduplicateArticles(allArticles);
    const afterDedup = deduped.length;

    // Store up to MAX_ARTICLES
    const toStore = deduped.slice(0, MAX_ARTICLES);

    if (toStore.length > 0) {
      const { data: existingArticles } = await supabase
        .from("collected_articles")
        .select("id, url");

      const existingIds = new Set((existingArticles || []).map(a => a.id));
      const existingUrls = new Set((existingArticles || []).map(a => a.url));

      const newArticles = toStore.filter(a => !existingIds.has(a.id) && !existingUrls.has(a.url));
      const existingToReassociate = toStore.filter(a => !newArticles.includes(a));

      if (newArticles.length > 0) {
        const rows = newArticles.map(a => ({
          id: a.id,
          keyword: a.keyword,
          url: a.url,
          title: a.title,
          publishing_agency: a.publishing_agency,
          published_at: a.published_at,
          batch_id: batchId,
          source: "linkedin",
        }));

        const { error: insertError } = await supabase
          .from("collected_articles")
          .upsert(rows, { onConflict: "id" });

        if (insertError) console.error("Insert error:", insertError);
      }

      if (existingToReassociate.length > 0) {
        const reIds = existingToReassociate.map(a => a.id);
        await supabase
          .from("collected_articles")
          .update({ batch_id: batchId })
          .in("id", reIds);
      }
    }

    const actualStored = toStore.length;

    await supabase
      .from("collection_runs")
      .update({
        articles_collected: totalCollected,
        articles_stored: actualStored,
        completed_at: new Date().toISOString(),
        status: "completed",
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
          duplicates_removed: dedupRemoved,
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
          source: "linkedin",
        })),
        allFetched: allArticles.map(a => ({
          id: a.id,
          title: a.title,
          url: a.url,
          keyword: a.keyword,
          publishing_agency: a.publishing_agency,
          published_at: a.published_at,
          source: "linkedin",
        })),
        pipeline: {
          totalFetched: totalCollected,
          afterDedup: afterDedup,
          afterDateFilter: afterDedup,
          afterCap: toStore.length,
          droppedByDedup: dedupRemoved,
          droppedByDateFilter: 0,
          droppedByCap: Math.max(0, afterDedup - MAX_ARTICLES),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("collect-linkedin error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
