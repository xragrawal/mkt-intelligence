import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Context-specific FlytBase one-liner keyed to prospect's industry/signal.
 */
function buildFlytbaseIntro(
  inferredIndustry: string | null,
  eventType: string | null
): string {
  const ind = (inferredIndustry || "").toLowerCase();
  const ev  = (eventType || "").toLowerCase();

  if (ind.includes("logistic") || ind.includes("delivery") || ind.includes("port") || ind.includes("freight") || ind.includes("shipping") || ev.includes("delivery")) {
    return "We build the operations software for autonomous drone programs at logistics scale — from dispatch and routing through compliance and ground control.";
  }
  if (ind.includes("inspect") || ind.includes("infrastructure") || ind.includes("energy") || ind.includes("oil") || ind.includes("gas") || ind.includes("utility")) {
    return "We build the operations layer that lets inspection teams run drone programs across multiple sites without a dedicated pilot at each location.";
  }
  if (ind.includes("aero") || ind.includes("aviation") || ind.includes("aircraft") || ind.includes("aerospace")) {
    return "We build the operations and compliance software that enterprise aerospace teams use to run drone programs at scale — mission management, fleet orchestration, and audit-ready logging.";
  }
  if (ind.includes("security") || ind.includes("surveillance") || ind.includes("defense") || ev.includes("surveillance")) {
    return "We build the autonomous operations backend for enterprise drone security programs — persistent coverage, zero manual tasking, full audit trail.";
  }
  if (ind.includes("agri") || ind.includes("farm")) {
    return "We build the operations software that lets agri teams scale beyond the single-operator model — scheduled missions, multi-field coverage, automated reporting.";
  }
  if (ind.includes("govern") || ind.includes("public sector") || ev.includes("government")) {
    return "We build the command and control software for public sector drone programs — BVLOS-ready, regulatory compliant, deployable across distributed sites.";
  }

  return "We build the operations software that powers enterprise drone programs at scale — fleet orchestration, autonomous missions, and remote site management.";
}

/**
 * Industry-matched enterprise name-drop (Shell, Airbus, PSA Singapore, etc.).
 * Falls back to a regional reference when no industry match is found.
 */
function buildNameDrop(
  inferredIndustry: string | null,
  deploymentRegion: string | null,
  country: string | null
): string {
  const ind = (inferredIndustry || "").toLowerCase();
  const region = country || deploymentRegion;

  if (ind.includes("oil") || ind.includes("gas") || ind.includes("energy") || ind.includes("petrochemical") || ind.includes("utility")) {
    return "Teams at Shell use FlytBase for similar inspection programs — happy to share how they approached the operational scale-up.";
  }
  if (ind.includes("aero") || ind.includes("aviation") || ind.includes("aircraft") || ind.includes("aerospace")) {
    return "Airbus uses FlytBase for their drone programs — so we're familiar with the compliance and operational rigor that enterprise aerospace deployments require.";
  }
  if (ind.includes("port") || ind.includes("maritime") || ind.includes("shipping") || ind.includes("logistic") || ind.includes("freight")) {
    return "PSA Singapore (Singapore Port) uses FlytBase for drone operations at port scale — there are some patterns from that deployment worth sharing.";
  }
  if (ind.includes("construct") || ind.includes("infrastructure") || ind.includes("survey") || ind.includes("real estate")) {
    return "Enterprise infrastructure teams including programs at Shell and Airbus use FlytBase for multi-site drone deployments — it's a use case we know well.";
  }

  // Generic enterprise fallback
  if (region) {
    return `We work with enterprise teams across ${region} — including programs at Shell and Airbus — and we've seen most of the patterns that come up at this scale.`;
  }
  return "We work with enterprise teams including Shell, Airbus, and PSA Singapore — so we're familiar with the operational and compliance demands at this level.";
}

/**
 * Blends whyThisIsHot + strategicEntryPoint into a single natural paragraph
 * framed from the prospect's perspective — not a product pitch.
 */
function buildOpportunityParagraph(
  whyThisIsHot: string | null,
  strategicEntryPoint: string | null,
  unitsMentioned: number | null,
  deploymentRegion: string | null
): string {
  const parts: string[] = [];

  if (whyThisIsHot) {
    parts.push(`What stood out: ${whyThisIsHot}`);
  }
  if (strategicEntryPoint) {
    parts.push(strategicEntryPoint);
  }
  if (unitsMentioned && unitsMentioned > 0) {
    parts.push(
      `At ${unitsMentioned} units${deploymentRegion ? ` across ${deploymentRegion}` : ""}, that kind of scale is typically where teams hit the most operational friction.`
    );
  }

  return parts.join(" ") || "I think there may be a natural overlap worth a short conversation.";
}

// Convert plain text email body to simple HTML for sending
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n\n+/)
    .map((p) => `<p style="margin: 0 0 20px 0;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.75; color: #1a1a1a; max-width: 580px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">
${paragraphs}
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      partnerName,
      partnerEmail,
      pocName,
      companyName,
      inferredIndustry,
      deploymentRegion,
      country,
      eventType,
      unitsMentioned,
      articleTitle,
      articleUrl,
      whyThisIsHot,
      strategicEntryPoint,
      customSubject,
      customTextBody,
    } = await req.json();

    if (!partnerEmail || !companyName) {
      return new Response(
        JSON.stringify({ error: "partnerEmail and companyName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SMTP_HOST = Deno.env.get("SMTP_HOST");
    const SMTP_PORT = Deno.env.get("SMTP_PORT");
    const SMTP_USER = Deno.env.get("SMTP_USER");
    const SMTP_PASS = Deno.env.get("SMTP_PASS");

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      throw new Error("SMTP credentials not configured");
    }

    const port = parseInt(SMTP_PORT, 10);
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    // ── Assemble content ─────────────────────────────────────────────────────

    const subject = customSubject || `Re: ${articleTitle || `${companyName} — drone operations`}`;

    let htmlBody;
    let textBody;

    if (customTextBody) {
      textBody = customTextBody;
      htmlBody = textToHtml(customTextBody);
    } else {
      const recipientName = pocName || partnerName || "there";

      // Para 1 — article hook
      const eventDescription = eventType
        ? eventType.replace(/_/g, " ").toLowerCase()
        : "recent work";
      const locationContext = country
        ? ` in ${country}`
        : deploymentRegion ? ` in ${deploymentRegion}` : "";
      const p1 = `Came across "${articleTitle || "the recent piece"}" — ${companyName}'s ${eventDescription}${locationContext} caught my attention.`;

      // Para 2 — intro + name-drop
      const flytbaseIntro = buildFlytbaseIntro(inferredIndustry, eventType);
      const nameDrop      = buildNameDrop(inferredIndustry, deploymentRegion, country);
      const p2 = `I'm Ravikant from the Business Development team at FlytBase. ${flytbaseIntro} ${nameDrop}`;

      // Para 3 — opportunity / the gap
      const p3 = buildOpportunityParagraph(whyThisIsHot, strategicEntryPoint, unitsMentioned ?? null, deploymentRegion);

      // Para 4 — CTA
      const industryCtx = inferredIndustry || "this space";
      const regionCtx   = deploymentRegion || country || "the region";
      const p4 = `Would a short call make sense? Happy to share what we've seen work for teams in ${industryCtx} across ${regionCtx}.`;

      // ── HTML — plain prose, no boxes or tables ───────────────────────────────
      htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.75; color: #1a1a1a; max-width: 580px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">

  <p style="margin: 0 0 20px 0;">Hi ${recipientName},</p>

  <p style="margin: 0 0 20px 0;">${p1}</p>

  <p style="margin: 0 0 20px 0;">${p2}</p>

  <p style="margin: 0 0 20px 0;">${p3}</p>

  <p style="margin: 0 0 32px 0;">${p4}</p>

  <p style="margin: 0 0 4px 0;">Thanks,</p>
  <p style="margin: 0 0 2px 0;"><strong>Ravikant Agrawal</strong></p>
  <p style="margin: 0 0 2px 0; color: #555555;">Business Development, FlytBase</p>
  <p style="margin: 0; color: #555555;">ravikant.agrawal@flytbase.com</p>

  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 28px 0 16px 0;">
  <p style="font-size: 12px; color: #999999; margin: 0;">Article reference: ${articleUrl || ""}</p>

</body>
</html>`;

      // Plain-text fallback
      textBody = [
        `Hi ${recipientName},`,
        "", p1,
        "", p2,
        "", p3,
        "", p4,
        "",
        "Thanks,",
        "Ravikant Agrawal",
        "Business Development, FlytBase",
        "ravikant.agrawal@flytbase.com",
        "",
        `Article reference: ${articleUrl || ""}`,
      ].join("\n");
    }

    await transporter.sendMail({
      from: `Ravikant Agrawal <${SMTP_USER}>`,
      to: partnerEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });

    return new Response(
      JSON.stringify({ success: true, message: `Email sent to ${partnerEmail}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Email send error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
