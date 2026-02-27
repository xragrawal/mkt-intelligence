import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callLLM, RateLimitError, CreditsExhaustedError } from "../_shared/llm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEEP_DIVE_PROMPT = `You are a senior commercial intelligence analyst for FlytBase, a drone technology company.

Given a news article (title, source, and scanning context), produce a deep Opportunity Intelligence Pack.

RULES:
- Focus ONLY on actionable signals: live deployments, contract awards, tenders, scaling, partner deployments
- Ignore macro trends and generic commentary
- NO HALLUCINATION — if a value is uncertain, prefix with "Assumed:"
- Set values to null if not explicitly supported by the article
- opportunityScore 0-100; score higher when scale/expansion is implied

The output must be a structured Opportunity Intelligence Pack.`;

const DEEP_DIVE_TOOL = {
  type: "function" as const,
  function: {
    name: "create_opportunity_pack",
    description: "Create a structured Opportunity Intelligence Pack from article analysis",
    parameters: {
      type: "object",
      properties: {
        companyProfile: {
          type: "object",
          properties: {
            companyName: { type: "string" },
            inferredIndustry: { type: "string" },
            deploymentRegion: { type: "string" },
            likelyBuyerType: { type: "string" },
            maturitySignal: { type: "string", enum: ["EARLY", "SCALING", "ENTERPRISE_GRADE"] },
          },
          required: ["companyName", "inferredIndustry", "deploymentRegion", "likelyBuyerType", "maturitySignal"],
        },
        deploymentSignal: {
          type: "object",
          properties: {
            eventType: { type: "string" },
            scale: { type: "string" },
            urgencyLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
            expansionLikelihood: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
          },
          required: ["eventType", "scale", "urgencyLevel", "expansionLikelihood"],
        },
        bdOpportunityAssessment: {
          type: "object",
          properties: {
            whyThisIsHot: { type: "string" },
            strategicEntryPoint: { type: "string" },
            partnershipAngle: { type: "string" },
            riskFactors: { type: "string" },
            opportunityScore: { type: "number" },
          },
          required: ["whyThisIsHot", "strategicEntryPoint", "partnershipAngle", "riskFactors", "opportunityScore"],
        },
        crmReadyNotes: { type: "string" },
      },
      required: ["companyProfile", "deploymentSignal", "bdOpportunityAssessment", "crmReadyNotes"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, title, source, scanContext } = await req.json();
    if (!url || !title) {
      return new Response(JSON.stringify({ error: "url and title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const contextParts = [
      `Article Title: ${title}`,
      `Source: ${source || "Unknown"}`,
      `URL: ${url}`,
    ];

    if (scanContext) {
      contextParts.push(`\nStep 2 Scoring Context:`);
      if (scanContext.company) contextParts.push(`Company: ${scanContext.company}`);
      if (scanContext.country) contextParts.push(`Country: ${scanContext.country}`);
      if (scanContext.city) contextParts.push(`City: ${scanContext.city}`);
      if (scanContext.buyingIntentType) contextParts.push(`Signal Type: ${scanContext.buyingIntentType}`);
      if (scanContext.whyItMatters) contextParts.push(`Why It Matters: ${scanContext.whyItMatters}`);
      if (scanContext.bdImpactScore) contextParts.push(`Impact Score: ${scanContext.bdImpactScore}`);
      if (scanContext.unitsMentioned) contextParts.push(`Units Mentioned: ${scanContext.unitsMentioned}`);
    }

    const result = await callLLM({
      systemPrompt: DEEP_DIVE_PROMPT,
      userMessage: contextParts.join("\n"),
      tools: [DEEP_DIVE_TOOL],
      toolChoice: { type: "function", function: { name: "create_opportunity_pack" } },
      // Uses Claude by default; switch to "gemini" when ready
    });

    if (!result.toolCall) throw new Error("No structured output from AI");

    const pack = JSON.parse(result.toolCall.arguments);

    // Persist to DB
    const { data: dbRow, error: dbError } = await supabase
      .from("opportunity_packs")
      .insert({
        article_url: url,
        article_title: title,
        article_source: source,
        company_name: pack.companyProfile.companyName,
        inferred_industry: pack.companyProfile.inferredIndustry,
        deployment_region: pack.companyProfile.deploymentRegion,
        likely_buyer_type: pack.companyProfile.likelyBuyerType,
        maturity_signal: pack.companyProfile.maturitySignal,
        event_type: pack.deploymentSignal.eventType,
        scale_description: pack.deploymentSignal.scale,
        urgency_level: pack.deploymentSignal.urgencyLevel,
        expansion_likelihood: pack.deploymentSignal.expansionLikelihood,
        why_this_is_hot: pack.bdOpportunityAssessment.whyThisIsHot,
        strategic_entry_point: pack.bdOpportunityAssessment.strategicEntryPoint,
        partnership_angle: pack.bdOpportunityAssessment.partnershipAngle,
        risk_factors: pack.bdOpportunityAssessment.riskFactors,
        opportunity_score: pack.bdOpportunityAssessment.opportunityScore,
        crm_ready_notes: pack.crmReadyNotes,
        raw_json: pack,
      })
      .select("id")
      .single();

    if (dbError) {
      console.error("DB insert error:", dbError);
    }

    return new Response(
      JSON.stringify({ pack, dbId: dbRow?.id || null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    if (e instanceof RateLimitError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (e instanceof CreditsExhaustedError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("deep-dive error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
