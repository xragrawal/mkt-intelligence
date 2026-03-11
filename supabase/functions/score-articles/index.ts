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

// ── Prompt for batch scoring (Google News) ──
const SCORING_PROMPT = `You are a Business Development intelligence analyst for FlytBase, a drone technology company. Score news articles for commercial opportunity relevance.

CRITICAL TRANSLATION RULE:
ALL output fields MUST be in English regardless of the original article language. This applies to EVERY text field: company, partnerOrSI, country, city, involvedParties, whyItMatters, buyingIntentType — everything. If the article is in Spanish, Portuguese, French, German, Japanese, or any other language, translate all extracted information to English before outputting.

SCORING RULES:
- buyingIntentScore (0-50): How strong is the buying/deployment signal?
- leadClarityScore (0-30): How clearly can you identify the buyer/company?
- sourceQualityScore (0-20): How reliable/authoritative is the source?
- bdImpactScore = buyingIntentScore + leadClarityScore + sourceQualityScore (max 100)

Articles with bdImpactScore BELOW the provided threshold should have dropReason set explaining why.

DROP these (give low scores):
- Opinion pieces or editorials
- Generic market analysis with no identifiable company
- Product reviews/updates without deployment/contract/tender/partner action
- Stock-only or financial commentary articles

IMPORTANT DEDUP RULE:
If multiple articles cover the SAME company doing the SAME thing (same deployment, contract, partnership, etc.), give the BEST one a high score and give duplicates a dropReason of "Duplicate coverage of same event".

INVOLVED PARTIES EXTRACTION RULE:
- involvedParties MUST list ALL meaningful party names mentioned or inferable from the article: the buyer, deployer, operator, government agency, police department, military branch, contractor, system integrator, service provider, municipality, utility company, etc.
- Be EXHAUSTIVE: if an article mentions "Bahia Civil Police", "OCA Drones", "City of Salvador" — list ALL of them, not just one.
- EXCLUDE "DJI", "Skydio", "Autel", and other well-known drone manufacturers — these are search keywords, NOT actionable leads. Only include them if they are the BUYER/DEPLOYER (not just the product manufacturer).
- EXCLUDE "FlytBase" — it is the user's own company.
- Prioritize extracting the BUYER, the OPERATOR, the CONTRACTOR, the GOVERNMENT AGENCY, the SYSTEM INTEGRATOR, the SERVICE PROVIDER, the RESELLER/DEALER — these are the actionable leads.
- If the article mentions a specific department, division, or named entity within a larger organization, include the specific name (e.g. "Bahia Civil Police" not just "Police").
- For articles involving drone service providers or resellers (e.g. Heliguy, DroneUp), ALWAYS include them — they are potential FlytBase partners.

POINT OF CONTACT (PoC) EXTRACTION RULE:
- pocName: Extract the name of any key person mentioned in the article, along with their company/role if available.
- Format: "Name @ Company" or "Name, Role at Company" (e.g. "Jacob Armstrong @ DGS", "John Smith, CEO at DroneOps")
- If multiple people are mentioned, pick the most senior/relevant decision-maker.
- Set to null if no specific person name is mentioned.

BUYING INTENT TYPES: LIVE_DEPLOYMENT, CONTRACT_AWARD, TENDER, PARTNER_ANNOUNCEMENT, EXPANSION, FUNDING, REGULATION, OTHER
CONFIDENCE: HIGH, MEDIUM, LOW

You will receive MULTIPLE articles at once. Score each one independently, then deduplicate.`;

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
              dropReason: { type: ["string", "null"], description: "Reason for dropping (duplicate, low relevance, etc.) or null if relevant" },
              company: { type: ["string", "null"] },
              partnerOrSI: { type: ["string", "null"] },
              country: { type: ["string", "null"] },
              city: { type: ["string", "null"] },
              unitsMentioned: { type: ["number", "null"] },
              involvedParties: { type: "array", items: { type: "string" }, description: "All meaningful party names involved (companies, agencies, contractors, partners). EXCLUDE DJI, Skydio, Autel, FlytBase." },
              dealValue: { type: ["string", "null"], description: "Dollar/monetary value mentioned in the article if applicable (e.g. '$2.5M', '€10 million'), null if none" },
              pocName: { type: ["string", "null"], description: "Key person name mentioned in article with company/role, e.g. 'Jacob Armstrong @ DGS'. Null if none." },
              emailsMentioned: {
                type: "array",
                items: { type: "string" },
                description: "All email addresses explicitly mentioned in the article text, if any.",
              },
              useCaseCategory: { type: ["string", "null"], description: "Short use-case label (2-4 words max, English). E.g. 'Power Line Inspection', 'Port Security', 'Construction Monitoring', 'Emergency Response', 'Agriculture Spraying', 'Mining Survey'. Null if unclear." },
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
            required: ["articleIndex", "buyingIntentType", "leadClarityScore", "buyingIntentScore", "sourceQualityScore", "bdImpactScore", "whyItMatters", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["scores"],
      additionalProperties: false,
    },
  },
};

// ── Prompt + tool for LinkedIn social posts ──
const LINKEDIN_SCORING_PROMPT = `You are a Business Development intelligence analyst for FlytBase, a drone technology company. Score LinkedIn posts for commercial opportunity relevance and lead strength.

CRITICAL TRANSLATION RULE:
ALL output fields MUST be in English regardless of the original post language. This applies to EVERY text field: involvedParties entries, country, city, whyItMatters, buyingIntentType — everything.

SCORING RULES:
- buyingIntentScore (0-50): How strong is the buying/deployment signal in this LinkedIn post?
- leadClarityScore (0-30): How clearly can you identify who to contact (organizations + people)?
- sourceQualityScore (0-20): How credible is this signal based on the poster's seniority, organization, and post detail?
- bdImpactScore = buyingIntentScore + leadClarityScore + sourceQualityScore (max 100)

PRIORITIZE posts where:
- A BUYER ORGANIZATION is clearly implied (organization in the author's profile, organization in the text, or both).
- The text describes a LIVE DEPLOYMENT, RFP/tender, contract, large pilot, expansion, recurring operations, or partnership — not just marketing talk.
- The post highlights a UNIQUE or STANDOUT USE CASE (e.g. unusual industry, high-stakes application, at-scale deployment, multi-site rollout, or clear competitive edge) that makes it a strong FlytBase-relevant opportunity.
- A clear decision-maker persona is posting (e.g. Head of Security, VP Operations, Chief Drone Pilot, Program Manager, Innovation Lead).

TREAT AS WEAK / DROP:
- Generic thought leadership, buzz posts, or vendor marketing with no concrete initiative, buyer, or project attached.
- "Cool drone video" or generic PR with no actionable organization or program.
- Obvious resharing or lightweight commentary on the same underlying announcement by others, when there is already a stronger primary post.

DEDUP STRATEGY (LLM LEVEL):
- If multiple posts clearly refer to the SAME company doing the SAME project/event, mark only the highest-signal one as relevant.
- For the duplicates, set dropReason = "Duplicate lead for same company & project".

INPUT FORMAT:
The user message will contain a single JSON object with:
- source: "linkedin"
- threshold: numeric bdImpactScore threshold
- posts: array of posts, each with:
  - index: 0-based index of the post in the list
  - authorName, authorHeadline, authorCompany (optional), content, url, reactionsCount, commentsCount, publishedAt

You MUST return structured output using the provided tool, and you MUST:
- Respect the threshold when deciding relevance.
- Apply deduplication at the company + project/event level as described above.

MAPPING RULES (LinkedIn):
- involvedParties: single array field that MUST include BOTH the buyer organization and any meaningful partners/system integrators/service providers. Do NOT use separate "company" or "partner" fields — everything goes into involvedParties.
- country / city: infer from profile, text, or link when possible; otherwise null.
- buyingIntentType: LIVE_DEPLOYMENT, CONTRACT_AWARD, TENDER, PARTNER_ANNOUNCEMENT, EXPANSION, FUNDING, REGULATION, OTHER.
- pocName: include ALL key people mentioned in the post (author and any quoted stakeholders). Format as a single string such as "Name1 @ Org1; Name2, Role at Org2". Set to null only if truly no people are mentioned.
- whyItMatters: one concise English sentence explaining why this is a strong lead (or why it is weak/dropped).

You will receive MULTIPLE LinkedIn posts at once in a single object. Score each one independently, but still apply deduplication by company + project/event as described.`;

const LINKEDIN_SCORING_TOOL = {
  type: "function" as const,
  function: {
    name: "score_linkedin_posts_batch",
    description: "Score multiple LinkedIn posts for BD relevance in one call",
    parameters: {
      type: "object",
      properties: {
        scores: {
          type: "array",
          items: {
            type: "object",
            properties: {
              articleIndex: {
                type: "number",
                description:
                  "0-based index of the post in the input posts list",
              },
              dropReason: {
                type: ["string", "null"],
                description:
                  "Reason for dropping (duplicate, low relevance, etc.) or null if relevant",
              },
              involvedParties: {
                type: "array",
                items: { type: "string" },
                description:
                  "All meaningful organizations involved (buyer, operator, SI, partners, service providers). EXCLUDE FlytBase and drone OEMs unless they are the buyer.",
              },
              country: { type: ["string", "null"] },
              city: { type: ["string", "null"] },
              unitsMentioned: { type: ["number", "null"] },
              dealValue: {
                type: ["string", "null"],
                description:
                  "Dollar/monetary value mentioned if applicable (e.g. '$2.5M', '€10 million'), null if none",
              },
              pocName: {
                type: ["string", "null"],
                description:
                  "All key people mentioned in the post (author + others), formatted like 'Name1 @ Org1; Name2, Role at Org2'. Null if none.",
              },
              emailsMentioned: {
                type: "array",
                items: { type: "string" },
                description:
                  "All email addresses explicitly mentioned in the LinkedIn post text, if any.",
              },
              useCaseCategory: {
                type: ["string", "null"],
                description:
                  "Short use-case label (2-4 words max, English). E.g. 'Port Security', 'Police Drone Program'. Null if unclear.",
              },
              buyingIntentType: {
                type: "string",
                enum: [
                  "LIVE_DEPLOYMENT",
                  "CONTRACT_AWARD",
                  "TENDER",
                  "PARTNER_ANNOUNCEMENT",
                  "EXPANSION",
                  "FUNDING",
                  "REGULATION",
                  "OTHER",
                ],
              },
              leadClarityScore: { type: "number" },
              buyingIntentScore: { type: "number" },
              sourceQualityScore: { type: "number" },
              bdImpactScore: { type: "number" },
              whyItMatters: { type: "string" },
              confidence: {
                type: "string",
                enum: ["HIGH", "MEDIUM", "LOW"],
              },
            },
            required: [
              "articleIndex",
              "buyingIntentType",
              "leadClarityScore",
              "buyingIntentScore",
              "sourceQualityScore",
              "bdImpactScore",
              "whyItMatters",
              "confidence",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["scores"],
      additionalProperties: false,
    },
  },
};

const DEFAULT_MIN_SCORE = 60;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchId, minScore, llmProvider } = await req.json();
    if (!batchId) {
      return new Response(JSON.stringify({ error: "batchId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scoreThreshold = typeof minScore === "number" ? minScore : DEFAULT_MIN_SCORE;

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
      // Check if articles exist but were scored in a previous batch
      const { count: scoredCount } = await supabase
        .from("scored_articles")
        .select("*", { count: "exact", head: true })
        .eq("batch_id", batchId);

      if (scoredCount && scoredCount > 0) {
        return new Response(JSON.stringify({ 
          error: "all_scored",
          message: `All ${scoredCount} articles from this batch have already been scored. Your scored articles are available in Step 3 — Opportunity Intelligence.`,
          scoredCount,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ 
        error: "no_articles",
        message: "No articles found for this batch. Run Step 1 to collect articles first.",
      }), {
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

    const cachedMap = new Map<string, any>((cached || []).map((c: any) => [c.article_id, c]));
    const articleMap = new Map<string, any>(articles.map((a: any) => [a.id, a]));

    // SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        const results: Array<{ article: typeof articles[0]; scan: any }> = [];

        // Emit cached results — use bdImpactScore >= threshold as relevance gate
        let cachedCount = 0;
        for (const [articleId, cachedScore] of cachedMap) {
          const article = articleMap.get(articleId);
          if (!article) continue;
          const bdScore = cachedScore.bd_impact_score || 0;
          if (bdScore < scoreThreshold) {
            send({ type: "dropped", title: article.title, url: article.url, reason: cachedScore.drop_reason || `Score ${bdScore} below threshold ${scoreThreshold}`, score: bdScore });
            continue;
          }
          if (cachedScore.drop_reason) {
            send({ type: "dropped", title: article.title, url: article.url, reason: cachedScore.drop_reason, score: bdScore });
            continue;
          }
          const scan = {
            company: cachedScore.company,
            partnerOrSI: cachedScore.partner_or_si,
            country: cachedScore.country,
            city: cachedScore.city,
            unitsMentioned: cachedScore.units_mentioned,
            involvedParties: cachedScore.involved_parties || [],
            dealValue: cachedScore.deal_value || null,
            pocName: cachedScore.poc_name || null,
            emailsMentioned: cachedScore.emails_mentioned || [],
            useCaseCategory: cachedScore.use_case_category || null,
            buyingIntentType: cachedScore.buying_intent_type,
            leadClarityScore: cachedScore.lead_clarity_score,
            buyingIntentScore: cachedScore.buying_intent_score,
            sourceQualityScore: cachedScore.source_quality_score,
            bdImpactScore: bdScore,
            whyItMatters: cachedScore.why_it_matters,
            confidence: cachedScore.confidence,
            dropReason: null,
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
            await supabase.from("scored_articles").upsert(
              {
                article_id: a.id,
                batch_id: batchId,
                is_relevant: false,
                drop_reason: dropReason,
                buying_intent_type: "OTHER",
                bd_impact_score: 0,
                why_it_matters: "Pre-filtered: " + dropReason,
                confidence: "HIGH",
                source: a.source || "unknown",
              },
              { onConflict: "article_id" },
            );
            send({
              type: "dropped",
              title: a.title,
              url: a.url,
              reason: `Pre-filter: ${dropReason}`,
            });
          } else {
            toScore.push(a);
          }
        }

        const preFilteredCount = uncached.length - toScore.length;
        if (preFilteredCount > 0) {
          send({
            type: "progress_note",
            message: `${preFilteredCount} articles pre-filtered (skipped)`,
          });
        }

        // Partition by source so we can use specialized scoring logic
        const newsToScore = toScore.filter(
          (a) => (a as any).source === "google_news" || !(a as any).source,
        );
        const linkedinToScore = toScore.filter(
          (a) => (a as any).source === "linkedin",
        );
        const facebookToScore = toScore.filter(
          (a) => (a as any).source === "facebook",
        );

        // ── Google News: existing batch article scoring ──
        if (newsToScore.length > 0) {
          send({ type: "progress", current: 0, total: articles.length });

          const articleList = newsToScore
            .map((a, i) => {
              let entry =
                `[${i}] Title: ${a.title}\n    Source: ${
                  a.publishing_agency || "Unknown"
                }\n    URL: ${a.url}\n    Published: ${
                  a.published_at || "Unknown"
                }`;
              if (a.snippet) entry += `\n    Snippet: ${a.snippet}`;
              return entry;
            })
            .join("\n\n");

          try {
            const result = await callLLM({
              systemPrompt: SCORING_PROMPT,
              userMessage:
                `Score these ${newsToScore.length} articles. Mark duplicates covering the same event. Threshold is ${scoreThreshold} — articles below this are low-priority:\n\n${articleList}`,
              tools: [BATCH_SCORING_TOOL],
              toolChoice: {
                type: "function",
                function: { name: "score_articles_batch" },
              },
              provider: llmProvider || undefined,
            });

            // Prefer structured tool output, but fall back to parsing raw JSON if the model didn't call the tool.
            let parsed: any;
            if (result.toolCall) {
              parsed = JSON.parse(result.toolCall.arguments);
            } else if (result.content) {
              try {
                parsed = JSON.parse(result.content);
              } catch {
                send({
                  type: "error",
                  message:
                    "No structured output from LLM (could not parse JSON). Try again or switch provider.",
                });
                return;
              }
            } else {
              send({
                type: "error",
                message:
                  "No structured output from LLM (empty response). Try again.",
              });
              return;
            }

            const scores = Array.isArray(parsed)
              ? parsed
              : (parsed.scores || []);
            if (!Array.isArray(scores) || scores.length === 0) {
              console.error(
                "LLM returned unexpected structure:",
                JSON.stringify(parsed).slice(0, 500),
              );
              send({
                type: "error",
                message: "LLM returned no scorable results. Try again.",
              });
            } else {
              for (const scan of scores) {
                  const idx = scan.articleIndex;
                  if (idx < 0 || idx >= newsToScore.length) continue;
                  const article = newsToScore[idx];

                  // Relevance is purely score-based + dedup
                  const isRelevant =
                    scan.bdImpactScore >= scoreThreshold && !scan.dropReason;

                  if (!isRelevant && !scan.dropReason) {
                    scan.dropReason =
                      `Score ${scan.bdImpactScore} below threshold ${scoreThreshold}`;
                  }

                  await supabase.from("scored_articles").upsert(
                    {
                      article_id: article.id,
                      batch_id: batchId,
                      is_relevant: isRelevant,
                      drop_reason: scan.dropReason || null,
                      company: scan.company,
                      partner_or_si: scan.partnerOrSI,
                      country: scan.country,
                      city: scan.city,
                      units_mentioned: scan.unitsMentioned,
                      involved_parties: scan.involvedParties || null,
                      deal_value: scan.dealValue || null,
                      poc_name: scan.pocName || null,
                      emails_mentioned: scan.emailsMentioned || null,
                      use_case_category: scan.useCaseCategory || null,
                      buying_intent_type: scan.buyingIntentType,
                      lead_clarity_score: scan.leadClarityScore,
                      buying_intent_score: scan.buyingIntentScore,
                      source_quality_score: scan.sourceQualityScore,
                      bd_impact_score: scan.bdImpactScore,
                      why_it_matters: scan.whyItMatters,
                      confidence: scan.confidence,
                      source: article.source || "google_news",
                    },
                    { onConflict: "article_id" },
                  );

                  if (isRelevant) {
                    results.push({ article, scan: { ...scan, dropReason: null } });
                    send({
                      type: "result",
                      data: {
                        article,
                        scan: { ...scan, dropReason: null },
                      },
                    });
                  } else {
                    send({
                      type: "dropped",
                      title: article.title,
                      url: article.url,
                      reason: scan.dropReason || "Below threshold",
                      score: scan.bdImpactScore,
                    });
                  }
                }
            }
          } catch (e) {
            if (e instanceof CreditsExhaustedError) {
              send({ type: "error", message: e.message });
            } else if (e instanceof RateLimitError) {
              send({
                type: "error",
                message: "Rate limited by LLM provider",
              });
            } else {
              console.error("Error scoring articles:", e);
              send({
                type: "error",
                message: `Error: ${
                  e instanceof Error ? e.message : "Unknown"
                }`,
              });
            }
          }
        }

        // ── LinkedIn: social post scoring with URL dedup + involvedParties focus ──
        if (linkedinToScore.length > 0) {
          // Pre-dedup by canonical URL (keep first occurrence, drop others)
          const uniqueLinkedIn: typeof linkedinToScore = [];
          const seenUrls = new Map<string, string>(); // canonicalUrl -> articleId

          for (const a of linkedinToScore) {
            const rawUrl = (a.url || "").trim();
            const canonicalUrl = rawUrl ? rawUrl.split("?")[0] : "";
            if (!canonicalUrl) {
              uniqueLinkedIn.push(a);
              continue;
            }
            if (seenUrls.has(canonicalUrl)) {
              // Duplicate URL in same batch — drop this as a lower-priority candidate
              await supabase.from("scored_articles").upsert(
                {
                  article_id: a.id,
                  batch_id: batchId,
                  is_relevant: false,
                  drop_reason: "Duplicate URL in same batch",
                  buying_intent_type: "OTHER",
                  bd_impact_score: 0,
                  why_it_matters:
                    "Pre-filtered: Duplicate URL in same batch (only one post per URL kept for scoring).",
                  confidence: "HIGH",
                  source: a.source || "linkedin",
                },
                { onConflict: "article_id" },
              );
              send({
                type: "dropped",
                title: a.title,
                url: a.url,
                reason: "Pre-filter: Duplicate URL in same batch",
              });
            } else {
              seenUrls.set(canonicalUrl, a.id);
              uniqueLinkedIn.push(a);
            }
          }

          if (uniqueLinkedIn.length > 0) {
            const postsPayload = uniqueLinkedIn.map((a, i) => ({
              index: i,
              title: a.title,
              content: a.snippet || a.title,
              url: a.url,
              publishedAt: a.published_at,
              sourceLabel: a.publishing_agency || "Unknown",
            }));

            const userObject = {
              source: "linkedin",
              threshold: scoreThreshold,
              posts: postsPayload,
            };

            try {
              const result = await callLLM({
                systemPrompt: LINKEDIN_SCORING_PROMPT,
                userMessage: JSON.stringify(userObject),
                tools: [LINKEDIN_SCORING_TOOL],
                toolChoice: {
                  type: "function",
                  function: { name: "score_linkedin_posts_batch" },
                },
                provider: llmProvider || undefined,
              });

              // Prefer structured tool output, but fall back to parsing raw JSON if the model didn't call the tool.
              let parsed: any;
              if (result.toolCall) {
                parsed = JSON.parse(result.toolCall.arguments);
              } else if (result.content) {
                try {
                  parsed = JSON.parse(result.content);
                } catch {
                  send({
                    type: "error",
                    message:
                      "No structured output from LinkedIn LLM call (could not parse JSON). Try again or switch provider.",
                  });
                  // parsed remains undefined — fall through to complete
                }
              } else {
                send({
                  type: "error",
                  message:
                    "No structured output from LinkedIn LLM call (empty response). Try again.",
                });
                // parsed remains undefined — fall through to complete
              }

              if (parsed) {
                const scores = Array.isArray(parsed)
                  ? parsed
                  : (parsed.scores || []);
                if (!Array.isArray(scores) || scores.length === 0) {
                console.error(
                  "LinkedIn LLM returned unexpected structure:",
                  JSON.stringify(parsed).slice(0, 500),
                );
                send({
                  type: "error",
                  message:
                    "LinkedIn LLM returned no scorable results. Try again.",
                });
              } else {
                for (const scan of scores) {
                    const idx = scan.articleIndex;
                    if (idx < 0 || idx >= uniqueLinkedIn.length) continue;
                    const article = uniqueLinkedIn[idx];

                    const isRelevant =
                      scan.bdImpactScore >= scoreThreshold &&
                      !scan.dropReason;

                    if (!isRelevant && !scan.dropReason) {
                      scan.dropReason =
                        `Score ${scan.bdImpactScore} below threshold ${scoreThreshold}`;
                    }

                    await supabase.from("scored_articles").upsert(
                      {
                        article_id: article.id,
                        batch_id: batchId,
                        is_relevant: isRelevant,
                        drop_reason: scan.dropReason || null,
                        // For LinkedIn we treat involvedParties as canonical; company/partner fields are optional hints only.
                        company:
                          Array.isArray(scan.involvedParties) &&
                          scan.involvedParties.length > 0
                            ? scan.involvedParties[0]
                            : null,
                        partner_or_si: null,
                        country: scan.country,
                        city: scan.city,
                        units_mentioned: scan.unitsMentioned,
                        involved_parties: scan.involvedParties || null,
                        deal_value: scan.dealValue || null,
                        poc_name: scan.pocName || null,
                        emails_mentioned: scan.emailsMentioned || null,
                        use_case_category: scan.useCaseCategory || null,
                        buying_intent_type: scan.buyingIntentType,
                        lead_clarity_score: scan.leadClarityScore,
                        buying_intent_score: scan.buyingIntentScore,
                        source_quality_score: scan.sourceQualityScore,
                        bd_impact_score: scan.bdImpactScore,
                        why_it_matters: scan.whyItMatters,
                        confidence: scan.confidence,
                        source: article.source || "linkedin",
                      },
                      { onConflict: "article_id" },
                    );

                    if (isRelevant) {
                      results.push({
                        article,
                        scan: { ...scan, dropReason: null },
                      });
                      send({
                        type: "result",
                        data: {
                          article,
                          scan: { ...scan, dropReason: null },
                        },
                      });
                    } else {
                      send({
                        type: "dropped",
                        title: article.title,
                        url: article.url,
                        reason: scan.dropReason || "Below threshold",
                        score: scan.bdImpactScore,
                      });
                    }
                  }
                }
              } // end if (parsed)
            } catch (e) {
              if (e instanceof CreditsExhaustedError) {
                send({ type: "error", message: e.message });
              } else if (e instanceof RateLimitError) {
                send({
                  type: "error",
                  message: "Rate limited by LLM provider (LinkedIn)",
                });
              } else {
                console.error("Error scoring LinkedIn posts:", e);
                send({
                  type: "error",
                  message: `LinkedIn error: ${
                    e instanceof Error ? e.message : "Unknown"
                  }`,
                });
              }
            }
          }
        }

        send({
          type: "progress",
          current: articles.length,
          total: articles.length,
        });
        send({
          type: "complete",
          totalScored: articles.length,
          totalRelevant: results.length,
          fromCache: cachedCount,
          preFiltered: preFilteredCount,
          scoreThreshold,
        });
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
