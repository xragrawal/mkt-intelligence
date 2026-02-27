import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SCORING_PROMPT = `You are a Business Development intelligence analyst for FlytBase, a drone technology company. Your job is to score news articles for commercial opportunity relevance.

Given an article title, source, and URL, evaluate it for BD relevance and produce a structured assessment.

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

CONFIDENCE: HIGH (strong direct evidence), MEDIUM (inferred from context), LOW (speculative)

Output JSON matching this exact schema. No markdown, just raw JSON.`;

const SCORING_TOOL = {
  type: "function" as const,
  function: {
    name: "score_article",
    description: "Score a news article for business development relevance",
    parameters: {
      type: "object",
      properties: {
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
      required: ["isRelevant", "buyingIntentType", "leadClarityScore", "buyingIntentScore", "sourceQualityScore", "bdImpactScore", "whyItMatters", "confidence"],
      additionalProperties: false,
    },
  },
};

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

    const MIN_BD_SCORE = 50;

    // SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        const results: Array<{ article: typeof articles[0]; scan: any }> = [];

        for (let i = 0; i < articles.length; i++) {
          const article = articles[i];
          send({ type: "progress", current: i + 1, total: articles.length });

          try {
            const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: [
                  { role: "system", content: SCORING_PROMPT },
                  {
                    role: "user",
                    content: `Score this article:\nTitle: ${article.title}\nSource: ${article.publishing_agency || "Unknown"}\nURL: ${article.url}\nPublished: ${article.published_at || "Unknown"}`,
                  },
                ],
                tools: [SCORING_TOOL],
                tool_choice: { type: "function", function: { name: "score_article" } },
              }),
            });

            if (response.status === 429) {
              send({ type: "error", message: "Rate limited — waiting before retry" });
              await new Promise((r) => setTimeout(r, 5000));
              i--; // Retry
              continue;
            }

            if (response.status === 402) {
              send({ type: "error", message: "AI credits exhausted. Please add credits." });
              break;
            }

            if (!response.ok) {
              console.error("LLM error:", response.status, await response.text());
              send({ type: "error", message: `Scoring failed for: ${article.title}` });
              continue;
            }

            const data = await response.json();
            const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
            if (!toolCall) {
              send({ type: "error", message: `No structured output for: ${article.title}` });
              continue;
            }

            const scan = JSON.parse(toolCall.function.arguments);

            if (scan.isRelevant) {
              results.push({ article, scan });
              send({ type: "result", data: { article, scan } });
            }

            // Small delay between calls to avoid rate limiting
            await new Promise((r) => setTimeout(r, 300));
          } catch (e) {
            console.error(`Error scoring "${article.title}":`, e);
            send({ type: "error", message: `Error: ${e instanceof Error ? e.message : "Unknown"}` });
          }
        }

        // Post-scoring event dedup
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

        // Apply MIN_BD_SCORE gate with top-3 fallback
        let filtered = deduped.filter((r) => r.scan.bdImpactScore >= MIN_BD_SCORE);
        if (filtered.length === 0) {
          filtered = deduped
            .sort((a, b) => b.scan.bdImpactScore - a.scan.bdImpactScore)
            .slice(0, 3);
        }

        send({ type: "complete", totalScored: articles.length, totalRelevant: filtered.length });
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
