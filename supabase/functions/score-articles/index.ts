import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callLLM, RateLimitError, CreditsExhaustedError } from "../_shared/llm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Pre-filter: skip obviously irrelevant titles before burning tokens ──
const DROP_KEYWORDS = [
  "opinion:", "editorial:", "review:", "stock price", "share price",
  "market cap", "analyst rating", "buy/sell", "etf", "index fund",
  "podcast", "webinar replay", "infographic",
];

function shouldPreFilter(title: string): string | null {
  const lower = title.toLowerCase();
  for (const kw of DROP_KEYWORDS) {
    if (lower.includes(kw)) return `Title contains "${kw}"`;
  }
  return null;
}

// ── Prompt for batch scoring ──
const SCORING_PROMPT = `You are a Business Development intelligence analyst for FlytBase, a drone technology company. Score news articles for commercial opportunity relevance.

SCORING RULES:
- buyingIntentScore (0-50): How strong is the buying/deployment signal?
- leadClarityScore (0-30): How clearly can you identify the buyer/company?
- sourceQualityScore (0-20): How reliable/authoritative is the source?
- bdImpactScore = buyingIntentScore + leadClarityScore + sourceQualityScore (max 100)

DROP these (isRelevant=false):
- Opinion pieces or editorials
- Generic market analysis with no identifiable company
- Product reviews/updates without deployment/contract/tender/partner action
- Stock-only or financial commentary articles

BUYING INTENT TYPES: LIVE_DEPLOYMENT, CONTRACT_AWARD, TENDER, PARTNER_ANNOUNCEMENT, EXPANSION, FUNDING, REGULATION, OTHER
CONFIDENCE: HIGH, MEDIUM, LOW

You will receive MULTIPLE articles at once. Score each one independently.`;

const BATCH_SCORING_TOOL = {
  type: "function" as const,
  function: {
    name: "score_articles_batch",
    description: "Score multiple news articles for BD relevance in one call",
    parameters: {
      type: "object",
      properties: {
        scores: {
          type: "array",
          items: {
            type: "object",
            properties: {
              articleIndex: { type: "number", description: "0-based index of the article in the input list" },
              isRelevant: { type: "boolean" },
              dropReason: { type: ["string", "null"] },
              company: { type: ["string", "null"] },
              partnerOrSI: { type: ["string", "null"] },
              country: { type: ["string", "null"] },
              city: { type: ["string", "null"] },
              unitsMentioned: { type: ["number", "null"] },
              buyingIntentType: {
                type: "string",
                enum: ["LIVE_DEPLOYMENT", "CONTRACT_AWARD", "TENDER", "PARTNER_ANNOUNCEMENT", "EXPANSION", "FUNDING", "REGULATION", "OTHER"],
              },
              leadClarityScore: { type: "number" },
              buyingIntentScore: { type: "number" },
              sourceQualityScore: { type: "number" },
              bdImpactScore: { type: "number" },
              whyItMatters: { type: "string" },
              confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
            },
            required: ["articleIndex", "isRelevant", "buyingIntentType", "leadClarityScore", "buyingIntentScore", "sourceQualityScore", "bdImpactScore", "whyItMatters", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["scores"],
      additionalProperties: false,
    },
  },
};

const BATCH_SIZE = 5;
const MIN_BD_SCORE = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchId } = await req.json();
    if (!batchId) {
      return new Response(JSON.stringify({ error: "batchId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch articles from this batch
    const { data: articles, error: fetchError } = await supabase
      .from("collected_articles")
      .select("*")
      .eq("batch_id", batchId)
      .order("published_at", { ascending: false });

    if (fetchError) throw new Error(fetchError.message);
    if (!articles || articles.length === 0) {
      return new Response(JSON.stringify({ error: "No articles found for batch" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check cache for already-scored articles
    const articleIds = articles.map((a) => a.id);
    const { data: cached } = await supabase
      .from("scored_articles")
      .select("*")
      .in("article_id", articleIds);

    const cachedMap = new Map((cached || []).map((c) => [c.article_id, c]));
    const articleMap = new Map(articles.map((a) => [a.id, a]));

    // SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        const results: Array<{ article: typeof articles[0]; scan: any }> = [];

        // Emit cached results immediately
        let cachedCount = 0;
        for (const [articleId, cachedScore] of cachedMap) {
          const article = articleMap.get(articleId);
          if (!article || !cachedScore.is_relevant) continue;
          const scan = {
            isRelevant: cachedScore.is_relevant,
            company: cachedScore.company,
            partnerOrSI: cachedScore.partner_or_si,
            country: cachedScore.country,
            city: cachedScore.city,
            unitsMentioned: cachedScore.units_mentioned,
            buyingIntentType: cachedScore.buying_intent_type,
            leadClarityScore: cachedScore.lead_clarity_score,
            buyingIntentScore: cachedScore.buying_intent_score,
            sourceQualityScore: cachedScore.source_quality_score,
            bdImpactScore: cachedScore.bd_impact_score,
            whyItMatters: cachedScore.why_it_matters,
            confidence: cachedScore.confidence,
          };
          results.push({ article, scan });
          send({ type: "result", data: { article, scan } });
          cachedCount++;
        }

        if (cachedCount > 0) {
          send({ type: "progress_note", message: `${cachedCount} articles loaded from cache` });
        }

        // Filter out cached + pre-filtered articles
        const uncached = articles.filter((a) => !cachedMap.has(a.id));
        const toScore: typeof articles = [];
        for (const a of uncached) {
          const dropReason = shouldPreFilter(a.title);
          if (dropReason) {
            await supabase.from("scored_articles").upsert({
              article_id: a.id,
              batch_id: batchId,
              is_relevant: false,
              drop_reason: dropReason,
              buying_intent_type: "OTHER",
              why_it_matters: "Pre-filtered: " + dropReason,
              confidence: "HIGH",
            }, { onConflict: "article_id" });
            send({ type: "dropped", title: a.title, reason: `Pre-filter: ${dropReason}` });
          } else {
            toScore.push(a);
          }
        }

        const preFilteredCount = uncached.length - toScore.length;
        if (preFilteredCount > 0) {
          send({ type: "progress_note", message: `${preFilteredCount} articles pre-filtered (skipped)` });
        }

        // ── Batch scoring ──
        const totalBatches = Math.ceil(toScore.length / BATCH_SIZE);
        let scored = 0;

        for (let b = 0; b < totalBatches; b++) {
          const batch = toScore.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
          send({ type: "progress", current: scored + cachedCount + preFilteredCount, total: articles.length });

          const articleList = batch
            .map((a, i) => `[${i}] Title: ${a.title}\n    Source: ${a.publishing_agency || "Unknown"}\n    URL: ${a.url}\n    Published: ${a.published_at || "Unknown"}`)
            .join("\n\n");

          try {
            const result = await callLLM({
              systemPrompt: SCORING_PROMPT,
              userMessage: `Score these ${batch.length} articles:\n\n${articleList}`,
              tools: [BATCH_SCORING_TOOL],
              toolChoice: { type: "function", function: { name: "score_articles_batch" } },
              // For scoring, use a cheaper/faster model
              model: undefined, // uses provider default (claude-sonnet-4 or gemini-3-flash)
            });

            if (!result.toolCall) {
              send({ type: "error", message: `No structured output for batch ${b + 1}` });
              scored += batch.length;
              continue;
            }

            const { scores } = JSON.parse(result.toolCall.arguments);

            for (const scan of scores) {
              const idx = scan.articleIndex;
              if (idx < 0 || idx >= batch.length) continue;
              const article = batch[idx];

              await supabase.from("scored_articles").upsert({
                article_id: article.id,
                batch_id: batchId,
                is_relevant: scan.isRelevant,
                drop_reason: scan.dropReason,
                company: scan.company,
                partner_or_si: scan.partnerOrSI,
                country: scan.country,
                city: scan.city,
                units_mentioned: scan.unitsMentioned,
                buying_intent_type: scan.buyingIntentType,
                lead_clarity_score: scan.leadClarityScore,
                buying_intent_score: scan.buyingIntentScore,
                source_quality_score: scan.sourceQualityScore,
                bd_impact_score: scan.bdImpactScore,
                why_it_matters: scan.whyItMatters,
                confidence: scan.confidence,
              }, { onConflict: "article_id" });

              if (scan.isRelevant) {
                results.push({ article, scan });
                send({ type: "result", data: { article, scan } });
              } else {
                send({ type: "dropped", title: article.title, reason: scan.dropReason || "Scored as not relevant", score: scan.bdImpactScore });
              }
            }

            scored += batch.length;
            if (b < totalBatches - 1) await new Promise((r) => setTimeout(r, 500));
          } catch (e) {
            if (e instanceof RateLimitError) {
              send({ type: "error", message: "Rate limited — waiting before retry" });
              await new Promise((r) => setTimeout(r, 5000));
              b--;
              continue;
            }
            if (e instanceof CreditsExhaustedError) {
              send({ type: "error", message: e.message });
              break;
            }
            console.error(`Error scoring batch ${b + 1}:`, e);
            send({ type: "error", message: `Error: ${e instanceof Error ? e.message : "Unknown"}` });
            scored += batch.length;
          }
        }

        // Post-scoring dedup
        const eventMap = new Map<string, typeof results[0]>();
        for (const r of results) {
          const key = [
            r.scan.company || "",
            r.scan.partnerOrSI || "",
            r.scan.buyingIntentType,
            r.scan.country || "",
            r.scan.city || "",
          ].join("|").toLowerCase();

          const existing = eventMap.get(key);
          if (!existing || r.scan.bdImpactScore > existing.scan.bdImpactScore) {
            eventMap.set(key, r);
          }
        }

        let deduped = Array.from(eventMap.values());
        let filtered = deduped.filter((r) => r.scan.bdImpactScore >= MIN_BD_SCORE);
        if (filtered.length === 0) {
          filtered = deduped
            .sort((a, b) => b.scan.bdImpactScore - a.scan.bdImpactScore)
            .slice(0, 3);
        }

        send({ type: "complete", totalScored: articles.length, totalRelevant: filtered.length, fromCache: cachedCount, preFiltered: preFilteredCount });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("score-articles error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
