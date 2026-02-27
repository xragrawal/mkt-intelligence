import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build context from what we have (title + snippet from Step 2)
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: DEEP_DIVE_PROMPT },
          { role: "user", content: contextParts.join("\n") },
        ],
        tools: [DEEP_DIVE_TOOL],
        tool_choice: { type: "function", function: { name: "create_opportunity_pack" } },
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited — please try again shortly" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("LLM error:", response.status, errText);
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No structured output from AI");

    const pack = JSON.parse(toolCall.function.arguments);

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
    console.error("deep-dive error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
