/**
 * Shared email content generation logic.
 * Used by both send-partner-email and slack-approval-request functions.
 */

export interface EmailParams {
  partnerName?: string | null;
  partnerEmail: string;
  pocName?: string | null;
  companyName: string;
  inferredIndustry?: string | null;
  deploymentRegion?: string | null;
  country?: string | null;
  eventType?: string | null;
  unitsMentioned?: number | null;
  articleTitle?: string | null;
  articleUrl?: string | null;
  whyThisIsHot?: string | null;
  strategicEntryPoint?: string | null;
  useCaseCategory?: string | null;
}

export interface BuiltEmail {
  subject: string;
  htmlBody: string;
  textBody: string;
}

function buildFlytbaseIntro(inferredIndustry: string | null, eventType: string | null): string {
  const ind = (inferredIndustry || "").toLowerCase();
  const ev = (eventType || "").toLowerCase();

  if (ind.includes("logistic") || ind.includes("delivery") || ind.includes("port") || ind.includes("freight") || ind.includes("shipping") || ev.includes("delivery")) {
    return "At FlytBase, we power aerial robots for physical AI — helping logistics teams automate drone operations for inspections and data collection at scale, turning that data into real, actionable insights.";
  }
  if (ind.includes("inspect") || ind.includes("infrastructure") || ind.includes("energy") || ind.includes("oil") || ind.includes("gas") || ind.includes("utility")) {
    return "At FlytBase, we power aerial robots for physical AI — helping inspection teams automate drone operations for security, inspections, and data collection. We act as the orchestrator that lets teams deploy, manage, and scale drone programs with reliability across multiple sites.";
  }
  if (ind.includes("aero") || ind.includes("aviation") || ind.includes("aircraft") || ind.includes("aerospace")) {
    return "At FlytBase, we power aerial robots for physical AI — enabling organizations to automate drone operations for security, inspections, and data collection, turning that data into actionable insights across your enterprise.";
  }
  if (ind.includes("security") || ind.includes("surveillance") || ind.includes("defense") || ev.includes("surveillance")) {
    return "At FlytBase, we power aerial robots for physical AI — helping security teams automate drone operations for persistent coverage and threat detection, with full visibility and audit trails.";
  }
  if (ind.includes("agri") || ind.includes("farm")) {
    return "At FlytBase, we power aerial robots for physical AI — enabling agricultural teams to automate drone operations for monitoring and data collection across multiple fields.";
  }
  if (ind.includes("govern") || ind.includes("public sector") || ev.includes("government")) {
    return "At FlytBase, we power aerial robots for physical AI — helping government and public sector teams automate drone operations for inspections, security, and critical infrastructure management.";
  }
  return "At FlytBase, we power aerial robots for physical AI — enabling organizations to automate drone operations for security, inspections, and data collection, turning that data into actionable insights.";
}

function buildNameDrop(inferredIndustry: string | null, deploymentRegion: string | null, country: string | null): string {
  const ind = (inferredIndustry || "").toLowerCase();
  const region = country || deploymentRegion;

  if (ind.includes("oil") || ind.includes("gas") || ind.includes("energy") || ind.includes("petrochemical") || ind.includes("utility")) {
    return "For example, we helped a Fortune 500 oil & gas company scale their autonomous drone program from multiple docks to enterprise-wide coverage — reducing inspection times from 6 hours to under 1 hour, and accelerating decision-making with faster, insight-driven reporting.";
  }
  if (ind.includes("aero") || ind.includes("aviation") || ind.includes("aircraft") || ind.includes("aerospace")) {
    return "We work with leading aerospace organizations to scale their drone programs with full compliance and operational rigor. We've seen teams cut mission planning time in half and improve safety reporting across the board.";
  }
  if (ind.includes("port") || ind.includes("maritime") || ind.includes("shipping") || ind.includes("logistic") || ind.includes("freight")) {
    return "We've helped logistics and shipping teams scale drone operations across multiple locations. One client went from pilot programs at a few sites to full deployments within months — strict SLAs maintained throughout.";
  }
  if (ind.includes("construct") || ind.includes("infrastructure") || ind.includes("survey") || ind.includes("real estate")) {
    return "We work with infrastructure and construction teams to scale drone programs across multiple sites. Teams typically see faster site assessments and better data collection within the first few months.";
  }
  if (region) {
    return `We've worked with teams across ${region} on similar programs — and we've learned what works at scale in your region.`;
  }
  return "We've worked with enterprise teams on scaling their drone operations — and we've learned what works at this level.";
}

function buildOpportunityParagraph(
  whyThisIsHot: string | null,
  strategicEntryPoint: string | null,
  unitsMentioned: number | null,
  deploymentRegion: string | null
): string {
  const parts: string[] = [];
  if (whyThisIsHot) parts.push(whyThisIsHot);
  if (strategicEntryPoint) parts.push(strategicEntryPoint);
  if (unitsMentioned && unitsMentioned > 0) {
    parts.push(`At your scale — ${unitsMentioned} units${deploymentRegion ? ` across ${deploymentRegion}` : ""} — that's typically where teams see the most operational friction. This is where automation really starts to matter.`);
  }
  return parts.join(" ") || "I think there might be a good fit worth exploring.";
}

export function buildEmail(params: EmailParams): BuiltEmail {
  const {
    partnerName, partnerEmail, pocName, companyName,
    inferredIndustry, deploymentRegion, country, eventType,
    unitsMentioned, articleTitle, articleUrl,
    whyThisIsHot, strategicEntryPoint,
  } = params;

  const subject = `Quick thought on ${companyName}'s drone operations`;
  const recipientName = pocName || partnerName || "there";

  const eventDescription = eventType ? eventType.replace(/_/g, " ").toLowerCase() : "recent work";
  const locationContext = country ? ` in ${country}` : deploymentRegion ? ` in ${deploymentRegion}` : "";
  const p1 = `Hi ${recipientName},\n\nI came across something interesting about ${companyName}'s recent work in ${eventDescription}${locationContext}. The scale and scope of what you're doing caught my attention.`;

  const flytbaseIntro = buildFlytbaseIntro(inferredIndustry ?? null, eventType ?? null);
  const nameDrop = buildNameDrop(inferredIndustry ?? null, deploymentRegion ?? null, country ?? null);
  const p2 = `${flytbaseIntro} ${nameDrop}`;

  const p3 = buildOpportunityParagraph(whyThisIsHot ?? null, strategicEntryPoint ?? null, unitsMentioned ?? null, deploymentRegion ?? null);

  const p4 = `Would it be worth exploring how autonomous drone operations could support your team's workflows? I'd be happy to share what we've learned.`;

  const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.75; color: #1a1a1a; max-width: 580px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">

  <p style="margin: 0 0 16px 0;">Hi ${recipientName},</p>
  <p style="margin: 0 0 16px 0;">I came across something interesting about ${companyName}'s recent work in ${eventDescription}${locationContext}. The scale and scope of what you're doing caught my attention.</p>
  <p style="margin: 0 0 16px 0;">${flytbaseIntro}</p>
  <p style="margin: 0 0 16px 0;">${nameDrop}</p>
  <p style="margin: 0 0 16px 0;">${p3}</p>
  <p style="margin: 0 0 32px 0;">${p4}</p>

  <p style="margin: 0 0 4px 0;">Thanks,</p>
  <p style="margin: 0 0 2px 0;"><strong>Ravikant Agrawal</strong></p>
  <p style="margin: 0 0 2px 0; color: #555555;">Business Development, FlytBase</p>
  <p style="margin: 0; color: #555555;">ravikant.agrawal@flytbase.com</p>

</body>
</html>`;

  const textBody = [
    `Hi ${recipientName},`,
    "",
    `I came across something interesting about ${companyName}'s recent work in ${eventDescription}${locationContext}. The scale and scope of what you're doing caught my attention.`,
    "",
    flytbaseIntro,
    "",
    nameDrop,
    "",
    p3,
    "",
    p4,
    "",
    "Thanks,",
    "Ravikant Agrawal",
    "Business Development, FlytBase",
    "ravikant.agrawal@flytbase.com",
  ].join("\n");

  return { subject, htmlBody, textBody };
}
