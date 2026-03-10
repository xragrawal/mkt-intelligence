import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callLLM, RateLimitError, CreditsExhaustedError } from "../_shared/llm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEEP_DIVE_PROMPT = `You are a senior commercial intelligence analyst for FlytBase, a drone technology company.

Given a news article (title, source, and scanning context), produce a deep Opportunity Intelligence Pack.

GLOBAL RULES:
- Focus ONLY on actionable signals: live deployments, contract awards, tenders, scaling, partner deployments
- Ignore macro trends and generic commentary
- NO HALLUCINATION — if a value is uncertain, prefix with "Assumed:"
- Set values to null if not explicitly supported by the article
- ALL output text MUST be in English. If the source article is in another language, translate all content to English.
- Output MUST include two exhaustive lists derived from the article and context:
  - People of Contact (POC): all people mentioned in the article/context
  - Involved Parties: all companies/organizations mentioned in the article/context
- Use English as default language throughout
---

FIELD-LEVEL RULES:

[companyName]
- Extract the primary organization DEPLOYING or PROCURING drones — not Flytbase or DJI
- Prefer full legal/official name over abbreviations
- If multiple companies mentioned, pick relevant operator/buyer ones
- null if no specific company is identifiable

[inferredIndustry]
- Use specific verticals: Security & Surveillance, Logistics & Delivery, Infrastructure Inspection, Agriculture, Emergency Services, Defense & Military, Construction, Energy & Utilities, Mining, Public Safety, Smart Cities
- Be specific over generic (e.g. "Oil & Gas Pipeline Inspection" over "Energy")
- If multiple use cases, pick the primary one

[deploymentRegion]
- Format: City, Country or Region, Country (e.g. "Dubai, UAE", "Midwest, USA")
- Fall back to country-level if city not mentioned
- Use English place names throughout
- null if location is not determinable from the article

[likelyBuyerType]
- Choose from: Government Agency, Military/Defense, Enterprise (Private), SME, Utility/Infrastructure Operator, Logistics Provider, Emergency Services, Academic/Research
- Infer from context (e.g. government tender → Government Agency)
- null if cannot be determined

[maturitySignal]
- EARLY: Pilot programs, trials, POCs, feasibility studies, first-ever drone deployments
- SCALING: Multi-site rollouts, fleet expansion, phase 2/3 deployments, growing unit counts
- ENTERPRISE_GRADE: Multi-year contracts, 50+ drone fleets, national programs, regulatory approvals secured

[eventType]
- Use consistent categories: Contract Award, Tender/RFP Published, Pilot Announced, Fleet Expansion, Regulatory Approval, Partnership/Integration, Funding Secured, Deployment Launch, Use Case Demo
- null if none of the above fit

[scale]
- Quantify when possible: "12 drones across 3 sites", "50-drone fleet"
- If units not mentioned, estimate: Small-scale (1-5 units), Mid-scale (6-50 units), Large-scale (50+ units)
- Prefix inferred values with "Assumed:"

[urgencyLevel]
- HIGH: Active tender with deadline, imminent contract award, time-limited pilot
- MEDIUM: Expansion planned in 6-12 months, signed MOU, early procurement signal
- LOW: Exploratory interest, no timeline mentioned, macro commentary only

[expansionLikelihood]
- HIGH: Multi-phase contract, explicit scaling language, budget-allocated government program
- MEDIUM: Single site with growth potential, pilot with defined success criteria
- LOW: One-off deployment, no expansion language, unclear funding

[whyThisIsHot]
- Start by giving reference to the article / post title
- Max 2-3 sentences; must cite specific signals from the article
- Focus on why FlytBase specifically should act (dock hardware, autonomy, BVLOS relevance)
- No generic statements like "drones are growing"

[strategicEntryPoint]
- Specific, actionable step: e.g. "Contact procurement lead at X", "Partner with Y (system integrator) who won the contract"
- Name specific companies/roles if mentioned in the article
- Avoid vague actions like "reach out to explore"

[partnershipAngle]
- Identify if a system integrator, OEM, or telecom is already involved
- Suggest direct approach vs. via partner
- Use founder tone with curious approach
- null if no partnership angle is evident

[riskFactors]
- Specific risks only: incumbent vendor lock-in, regulatory barriers in region, geographic limitations for FlytBase, budget constraints
- null if no risks are identifiable from the article

[opportunityScore]
- Integer 0-100
- 90-100: Active tender/contract, large scale, high urgency, clear budget, multiple parties collaborating with their names mentioned
- 70-89: Pilot with expansion signals, government funded program, mid-to-large scale
- 50-69: Single deployment, some expansion language, private sector, Early-stage pilot
- 30-49: speculative signals, just a news, regulatory signal
- 0-29: Generic interest, no procurement signal
- Deduct 10-20 points if FlytBase is already mentioned (existing relationship)

[crmReadyNotes]
- 3-5 bullet points, paste-ready for CRM (Salesforce/HubSpot)
- Format each line as: • [Label]: [Value]
- Must cover: Company, Region, Event Type, Scale, Urgency, Recommended Next Action

[flytbaseMentioned]
- true ONLY if the literal string "FlytBase" (case-insensitive) appears in the article title or scanContext
- false if only FlytBase products/technology are referenced without the company name
- Purely a flag — does not affect scoring

[peopleOfContact]
- Include ALL relevant people mentioned (names) in the article/context (executives, spokespeople, procurement contacts, government officials, etc.)
- Each entry must be an object with:
  - name (required)
  - titleOrRole (null if not stated)
  - organization (null if not stated)
  - email (null if not stated)
  - phone (null if not stated)
  - linkedinUrl (null if not stated)
  - mentionContext (short quote-like description of why they matter / how they are referenced)
- Do NOT invent contact details. If the person is mentioned but contact info is missing, keep those fields null.
- If no people are mentioned, output an empty array []

[involvedParties]
- Include ALL relevant companies/organizations mentioned (operators/buyers, vendors, OEMs, integrators, regulators, partners, contractors, agencies, event organizers)
- Each entry must be an object with:
  - name (required; full official name when possible)
  - partyType (choose one: Buyer/Operator, Vendor/OEM, System Integrator, Government/Regulator, Partner, Customer, Investor/Funder, Media/Publisher, Other)
  - countryOrRegion (null if not stated)
  - relationshipToPrimaryCompany (short string, e.g. "buyer", "operator", "vendor", "partner", or null if unclear)
  - mentionContext (short description of why they are involved)
- Do NOT omit parties just because they are not the primary buyer/operator.
- If no companies/organizations are mentioned, DO NOT invent, output an empty array []

---

The output must be a structured Opportunity Intelligence Pack (strictly following the provided JSON schema).`;

const DEEP_DIVE_TOOL = {
  type: "function" as const,
  function: {
    name: "create_opportunity_pack",
    description: "Create a structured Opportunity Intelligence Pack from article analysis",
    parameters: {
      type: "object",
      properties: {
        peopleOfContact: {
          type: "array",
          description: "All people mentioned in the article/context (POCs)",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              titleOrRole: { type: ["string", "null"] },
              organization: { type: ["string", "null"] },
              email: { type: ["string", "null"] },
              phone: { type: ["string", "null"] },
              linkedinUrl: { type: ["string", "null"] },
              mentionContext: { type: "string" },
            },
            required: ["name", "titleOrRole", "organization", "email", "phone", "linkedinUrl", "mentionContext"],
            additionalProperties: false,
          },
        },
        involvedParties: {
          type: "array",
          description: "All companies/organizations mentioned in the article/context (involved parties)",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              partyType: {
                type: "string",
                enum: [
                  "Buyer/Operator",
                  "Vendor/OEM",
                  "System Integrator",
                  "Government/Regulator",
                  "Partner",
                  "Customer",
                  "Investor/Funder",
                  "Media/Publisher",
                  "Other",
                ],
              },
              countryOrRegion: { type: ["string", "null"] },
              relationshipToPrimaryCompany: { type: ["string", "null"] },
              mentionContext: { type: "string" },
            },
            required: ["name", "partyType", "countryOrRegion", "relationshipToPrimaryCompany", "mentionContext"],
            additionalProperties: false,
          },
        },
        companyProfile: {
          type: "object",
          properties: {
            companyName: { type: ["string", "null"] },
            inferredIndustry: { type: ["string", "null"] },
            deploymentRegion: { type: ["string", "null"] },
            likelyBuyerType: { type: ["string", "null"] },
            maturitySignal: { type: "string", enum: ["EARLY", "SCALING", "ENTERPRISE_GRADE"] },
          },
          required: ["companyName", "inferredIndustry", "deploymentRegion", "likelyBuyerType", "maturitySignal"],
        },
        deploymentSignal: {
          type: "object",
          properties: {
            eventType: { type: ["string", "null"] },
            scale: { type: ["string", "null"] },
            urgencyLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
            expansionLikelihood: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
          },
          required: ["eventType", "scale", "urgencyLevel", "expansionLikelihood"],
        },
        bdOpportunityAssessment: {
          type: "object",
          properties: {
            whyThisIsHot: { type: ["string", "null"] },
            strategicEntryPoint: { type: ["string", "null"] },
            partnershipAngle: { type: ["string", "null"] },
            riskFactors: { type: ["string", "null"] },
            opportunityScore: { type: "number" },
          },
          required: ["whyThisIsHot", "strategicEntryPoint", "partnershipAngle", "riskFactors", "opportunityScore"],
        },
        crmReadyNotes: { type: "string" },
        flytbaseMentioned: { type: "boolean", description: "true if FlytBase is mentioned in the article title or context" },
      },
      required: [
        "peopleOfContact",
        "involvedParties",
        "companyProfile",
        "deploymentSignal",
        "bdOpportunityAssessment",
        "crmReadyNotes",
        "flytbaseMentioned",
      ],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, title, source, scanContext, batchContext, llmProvider } = await req.json();
    if (!url || !title) {
      return new Response(JSON.stringify({ error: "url and title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = process.env.get("SUPABASE_URL")!;
    const supabaseKey = process.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
      provider: llmProvider || undefined,
    });

    if (!result.toolCall) throw new Error("No structured output from AI");

    const pack = JSON.parse(result.toolCall.arguments);

    // Match FlytBase partner by region
    let matchedPartner: { name: string; email: string } | null = null;
    const deploymentRegion = pack.companyProfile.deploymentRegion || "";
    if (deploymentRegion) {
      const { data: partners } = await supabase
        .from("flytbase_partners")
        .select("name, email, region");

      if (partners && partners.length > 0) {
        const regionLower = deploymentRegion.toLowerCase();
        const match = partners.find((p: any) =>
          regionLower.includes(p.region.toLowerCase()) ||
          p.region.toLowerCase().includes(regionLower)
        );
        if (match) {
          matchedPartner = { name: match.name, email: match.email };
        }
      }
    }

    // Persist to DB
    const insertData: Record<string, unknown> = {
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
      matched_partner_name: matchedPartner?.name || null,
      matched_partner_email: matchedPartner?.email || null,
      flytbase_mentioned: pack.flytbaseMentioned || false,
    };

    // Add batch reference if provided
    if (batchContext) {
      if (batchContext.batchId) insertData.batch_id = batchContext.batchId;
      if (batchContext.keywords) insertData.keywords = batchContext.keywords;
      if (batchContext.filterDays) insertData.filter_days = batchContext.filterDays;
      if (batchContext.collectionRanAt) insertData.collection_ran_at = batchContext.collectionRanAt;
      if (batchContext.regions) insertData.batch_region = batchContext.regions.join(", ");
      insertData.is_re_associated = batchContext.isReAssociated || false;
      insertData.re_associated_from_batch_id = batchContext.reAssociatedFromBatchId || null;
    }
    insertData.added_to_queue_at = new Date().toISOString();

    const { data: dbRow, error: dbError } = await supabase
      .from("opportunity_packs")
      .insert(insertData)
      .select("id")
      .single();

    if (dbError) {
      console.error("DB insert error:", dbError);
    }

    return new Response(
      JSON.stringify({ pack, dbId: dbRow?.id || null, matchedPartner }),
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
