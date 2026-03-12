import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EnrichedContact {
  personName: string | null;
  title: string | null;
  company: string;
  companyWebsite: string | null;
  companyDomain: string | null;
  linkedinUrl: string | null;
  country: string | null;
  email: string | null;
  emailConfidence: "Verified" | "Estimated" | "Not Found";
  hunterVerified?: boolean | null;
  source: "article" | "apollo"; // track origin
  leadType: "Deployment Lead" | "Technology Partner" | "Potential Customer" | "Government / Regulator" | "Informational / Low Priority";
  leadPriority: "High" | "Medium" | "Low";
  notes: string | null;
}

// ── Jina Reader: fetch full article content ──────────────────────────────────
async function fetchArticleContent(articleUrl: string): Promise<string> {
  try {
    const jinaUrl = `https://r.jina.ai/${articleUrl}`;
    const res = await fetch(jinaUrl, {
      headers: { "Accept": "text/markdown", "X-Timeout": "20" },
    });
    if (!res.ok) throw new Error(`Jina returned ${res.status}`);
    const text = await res.text();
    return text.length > 15000 ? text.slice(0, 15000) + "\n...[truncated]" : text;
  } catch (e) {
    console.warn("Jina fetch failed:", e);
    return "";
  }
}

// ── OpenAI GPT-4o call helper ─────────────────────────────────────────────────
async function callOpenAI(apiKey: string, userPrompt: string, systemPrompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 6000,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// ── Parse JSON safely from LLM output ────────────────────────────────────────
function parseJSON<T>(raw: string): T | null {
  try {
    const clean = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(clean) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]) as T; } catch { return null; }
    }
    return null;
  }
}

// ── Extraction prompt ─────────────────────────────────────────────────────────
const EXTRACTION_PROMPT = (articleContent: string, articleUrl: string) => `
You are a lead generation intelligence agent for Flytbase, a drone software platform company.
Your job: extract every possible B2B lead from the article — named individuals AND inferred decision-maker roles at every org mentioned.

Article URL: ${articleUrl}

Full article content:
---
${articleContent}
---

## ABSOLUTE RULES
1. **IGNORE** DJI, DJI Enterprise, DJI employees entirely — not leads.
2. **For every organization mentioned** — even if no person is named — create contact entries for the most likely decision-maker roles at that org. Use the org's context (fire brigade → Kommandant / Head of Drone Program; logistics company → Head of Operations; inspection firm → Technical Director).
3. **Email waterfall** — attempt in this order, stop when you have something:
   a. Email explicitly in article text → mark "Verified"
   b. Named person's work email using common pattern (firstname.lastname@domain.com or firstname@domain.com) → mark "Estimated"
   c. Generic org contact email (info@, operations@, contact@) from the org's domain → mark "Estimated"
   d. No reasonable option → null, mark "Not Found"
4. **Search your training knowledge** for the org's website and domain — many companies are well-known.
5. For named individuals: always attempt a pattern-based email estimate (step 3b) and mark it "Estimated". This is useful even if unverified.

## IMPORTANT: Inferred contacts
If an article mentions "Freiwillige Feuerwehr XYZ purchased drones" but names no person — you MUST create entries like:
- Kommandant / Fire Chief (inferred decision-maker who approved the purchase)
- Head of Drone Program / Drone Officer (operational lead)
With email estimated as info@domain.at or similar from the org's domain.

## Lead Types
- "Deployment Lead" — actively operating/deploying drones
- "Technology Partner" — software/hardware integration partner
- "Potential Customer" — not yet using drones
- "Government / Regulator" — government body, civil aviation authority
- "Informational / Low Priority" — media, observer

## Lead Priority
- "High" — decision-maker at org actively deploying/procuring drones
- "Medium" — relevant operational/technical role
- "Low" — peripheral

Return ONLY a valid JSON object in EXACTLY this structure (no markdown, no extra text):
{
  "articleTitle": "string",
  "contacts": [
    {
      "personName": "Full Name or null if role-only",
      "title": "Job Title",
      "company": "Exact organization name from article",
      "companyWebsite": "https://... or null",
      "companyDomain": "domain.com or null",
      "linkedinUrl": "https://linkedin.com/in/... or null",
      "country": "Country name or null",
      "email": "email@domain.com or null",
      "emailConfidence": "Verified|Estimated|Not Found",
      "leadType": "one of the 5 types above",
      "leadPriority": "High or Medium or Low",
      "notes": "Deployment context, use case, why this is a lead — be specific"
    }
  ]
}

## Example
Article says: "Freiwillige Feuerwehr Preding purchased a DJI Matrice 4TD for fire suppression and search & rescue."
→ No person named, but you MUST output:
  - { personName: null, title: "Kommandant / Fire Chief", company: "Freiwillige Feuerwehr Preding", companyDomain: "ff-preding.at", email: "info@ff-preding.at", emailConfidence: "Estimated", leadType: "Deployment Lead", leadPriority: "High", notes: "Approved drone purchase for fire suppression and SAR; owns the deployment decision" }
  - { personName: null, title: "Head of Drone Program", company: "Freiwillige Feuerwehr Preding", companyDomain: "ff-preding.at", email: "info@ff-preding.at", emailConfidence: "Estimated", leadType: "Deployment Lead", leadPriority: "Medium", notes: "Operational lead for drone program" }
`;

// ── Apollo: search executives at a company by domain ─────────────────────────
async function apolloSearchExecutives(
  apiKey: string,
  domain: string
): Promise<Array<{ name: string | null; title: string | null; email: string | null; linkedinUrl: string | null }>> {
  try {
    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        q_organization_domains: domain,
        // Only filter by seniority — title filter is too narrow and misses real execs
        person_seniorities: ["owner", "founder", "c_suite", "vp", "head", "director"],
        page: 1,
        per_page: 10,
      }),
    });
    if (!res.ok) {
      console.warn(`Apollo exec search ${res.status} for ${domain}`);
      return [];
    }
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    return (data?.people || []).map((p: any) => ({
      name: p.name || null,
      title: p.title || null,
      email: p.email || null,
      linkedinUrl: p.linkedin_url || null,
    }));
  } catch (e) {
    console.warn("Apollo exec search error:", e);
    return [];
  }
}

// ── Apollo: resolve company domain by name ───────────────────────────────────
async function apolloFindCompanyDomain(
  apiKey: string,
  companyName: string
): Promise<{ domain: string | null; website: string | null } | null> {
  try {
    const res = await fetch("https://api.apollo.io/v1/mixed_companies/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ q_organization_name: companyName, page: 1, per_page: 1 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const org = data?.organizations?.[0] as any;
    if (!org) return null;
    return { domain: org.primary_domain || null, website: org.website_url || null };
  } catch {
    return null;
  }
}

// ── Hunter email verifier ─────────────────────────────────────────────────────
async function verifyEmailWithHunter(email: string, apiKey: string): Promise<boolean | null> {
  try {
    const res = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`
    );
    const data = await res.json();
    const status = data?.data?.status;
    return status === "valid" || status === "accept_all";
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const HUNTER_API_KEY = Deno.env.get("HUNTER_API_KEY");
    const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY");

    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
    if (!APOLLO_API_KEY) throw new Error("APOLLO_API_KEY not configured");

    const { articleUrl } = await req.json();
    if (!articleUrl) {
      return new Response(
        JSON.stringify({ error: "articleUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Enriching article:", articleUrl);

    // ── Step 1: Fetch full article via Jina Reader ──────────────────────────
    console.log("Step 1: Jina fetch...");
    const articleContent = await fetchArticleContent(articleUrl);
    console.log(`Article: ${articleContent.length} chars`);

    // ── Step 2: Extract contacts via GPT-4o (pure LLM, no external calls) ────
    console.log("Step 2: GPT-4o extraction...");
    const extractionRaw = await callOpenAI(
      OPENAI_API_KEY,
      EXTRACTION_PROMPT(articleContent, articleUrl),
      "You are a lead generation intelligence agent. Extract every possible B2B lead from the article — named individuals AND inferred decision-maker roles for every org mentioned. Always respond with a valid JSON object only."
    );

    console.log("Extraction response length:", extractionRaw.length);

    const parsed = parseJSON<{
      articleTitle?: string;
      contacts: EnrichedContact[];
    }>(extractionRaw);

    if (!parsed) throw new Error("Failed to parse extraction response as JSON");

    // Article contacts = pure LLM output, source tagged, never modified by Apollo
    const articleContacts: EnrichedContact[] = (parsed.contacts || []).map(c => ({
      ...c,
      source: "article" as const,
    }));

    console.log(`Extracted ${articleContacts.length} contacts from article`);

    // ── Step 3: Apollo — find NEW people not in article, at same companies ────
    // Apollo never modifies articleContacts — it only adds to apolloContacts
    const apolloContacts: EnrichedContact[] = [];

    const uniqueCompanies = [...new Set(articleContacts.map(c => c.company))].filter(
      n => !n.toLowerCase().includes("dji")
    );

    console.log(`Step 3: Apollo exec search for ${uniqueCompanies.length} companies...`);

    await Promise.allSettled(
      uniqueCompanies.map(async (companyName) => {
        const sample = articleContacts.find(c => c.company === companyName);
        let domain = sample?.companyDomain || null;
        let website = sample?.companyWebsite || null;

        // Resolve domain via Apollo if missing
        if (!domain) {
          const orgInfo = await apolloFindCompanyDomain(APOLLO_API_KEY, companyName);
          if (orgInfo) {
            domain = orgInfo.domain;
            website = orgInfo.website || website;
          }
        }

        if (!domain) {
          console.log(`No domain for ${companyName}, skipping`);
          return;
        }

        const executives = await apolloSearchExecutives(APOLLO_API_KEY, domain);
        console.log(`Apollo: ${executives.length} people found at ${companyName} (${domain})`);

        for (const exec of executives) {
          if (!exec.name) continue;

          // Skip if this person is already in articleContacts (by first name match)
          const alreadyInArticle = articleContacts.some(c => {
            if (c.company.toLowerCase() !== companyName.toLowerCase()) return false;
            if (!c.personName) return false;
            const execFirst = exec.name!.split(" ")[0].toLowerCase();
            return c.personName.toLowerCase().includes(execFirst);
          });

          if (!alreadyInArticle) {
            apolloContacts.push({
              personName: exec.name,
              title: exec.title,
              company: companyName,
              companyWebsite: website || null,
              companyDomain: domain,
              linkedinUrl: exec.linkedinUrl || null,
              country: sample?.country || null,
              email: exec.email || null,
              emailConfidence: exec.email ? "Verified" : "Not Found",
              source: "apollo",
              leadType: sample?.leadType || "Deployment Lead",
              leadPriority: "Medium",
              notes: `Apollo-discovered executive at ${companyName}`,
            });
          }
        }
      })
    );

    console.log(`Apollo added ${apolloContacts.length} new contacts`);

    // ── Step 4: Hunter email verification (both groups) ───────────────────────
    const allContacts = [...articleContacts, ...apolloContacts];

    if (HUNTER_API_KEY) {
      const toVerify = allContacts.filter(c => c.email && c.emailConfidence !== "Not Found");
      console.log(`Verifying ${toVerify.length} emails with Hunter...`);
      await Promise.all(
        toVerify.map(async (contact) => {
          contact.hunterVerified = await verifyEmailWithHunter(contact.email!, HUNTER_API_KEY);
          if (contact.hunterVerified === true) contact.emailConfidence = "Verified";
        })
      );
    }

    // Sort each group: High priority first, then by email presence
    const sortFn = (a: EnrichedContact, b: EnrichedContact) => {
      const pOrder = { High: 0, Medium: 1, Low: 2 };
      const pDiff = pOrder[a.leadPriority] - pOrder[b.leadPriority];
      if (pDiff !== 0) return pDiff;
      return (b.email ? 1 : 0) - (a.email ? 1 : 0);
    };
    articleContacts.sort(sortFn);
    apolloContacts.sort(sortFn);

    console.log(`Done: ${articleContacts.length} article contacts, ${apolloContacts.length} Apollo contacts`);

    return new Response(
      JSON.stringify({
        articleContacts,
        apolloContacts,
        articleTitle: parsed.articleTitle,
        contacts: allContacts,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("enrich-contacts-test error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg, contacts: [], articleContacts: [], apolloContacts: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
