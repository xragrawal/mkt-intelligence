import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      partnerName,
      partnerEmail,
      companyName,
      articleTitle,
      articleUrl,
      articleSource,
      deploymentRegion,
      inferredIndustry,
      eventType,
      whyThisIsHot,
      strategicEntryPoint,
      partnershipAngle,
      opportunityScore,
      crmReadyNotes,
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
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const subject = `🚀 New Opportunity: ${companyName} — ${eventType || "Deployment Signal"}`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a; background: #ffffff;">
  <div style="background: linear-gradient(135deg, #0f172a, #1e293b); color: #fff; padding: 24px 28px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0 0 4px 0; font-size: 20px;">🎯 Opportunity Intelligence</h1>
    <p style="margin: 0; font-size: 13px; opacity: 0.8;">FlytBase BD Signal</p>
  </div>
  
  <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px 28px;">
    <p style="margin: 0 0 16px 0;">Hi ${partnerName || "Partner"},</p>
    <p style="margin: 0 0 20px 0;">We've identified a new opportunity that matches your region and expertise:</p>
    
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 8px 0; font-weight: 600; color: #64748b; width: 140px;">Company</td>
        <td style="padding: 8px 0; font-weight: 600;">${companyName}</td>
      </tr>
      ${inferredIndustry ? `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;">Industry</td><td style="padding: 8px 0;">${inferredIndustry}</td></tr>` : ""}
      ${deploymentRegion ? `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;">Region</td><td style="padding: 8px 0;">${deploymentRegion}</td></tr>` : ""}
      ${eventType ? `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;">Signal</td><td style="padding: 8px 0;">${eventType}</td></tr>` : ""}
      ${opportunityScore ? `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b;">Score</td><td style="padding: 8px 0;"><strong>${opportunityScore}/100</strong></td></tr>` : ""}
    </table>

    ${whyThisIsHot ? `<div style="background: #f0fdf4; border-left: 3px solid #22c55e; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 16px;"><strong style="color: #15803d;">Why This Is Hot</strong><p style="margin: 4px 0 0 0; font-size: 14px;">${whyThisIsHot}</p></div>` : ""}
    
    ${strategicEntryPoint ? `<div style="background: #eff6ff; border-left: 3px solid #3b82f6; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 16px;"><strong style="color: #1d4ed8;">Strategic Entry Point</strong><p style="margin: 4px 0 0 0; font-size: 14px;">${strategicEntryPoint}</p></div>` : ""}
    
    ${partnershipAngle ? `<div style="background: #faf5ff; border-left: 3px solid #a855f7; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 16px;"><strong style="color: #7e22ce;">Partnership Angle</strong><p style="margin: 4px 0 0 0; font-size: 14px;">${partnershipAngle}</p></div>` : ""}

    ${crmReadyNotes ? `<div style="background: #f8fafc; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #e2e8f0;"><strong>CRM Notes</strong><p style="margin: 4px 0 0 0; font-size: 14px;">${crmReadyNotes}</p></div>` : ""}

    ${articleUrl ? `<p style="margin: 20px 0 0 0;"><a href="${articleUrl}" style="display: inline-block; background: #0f172a; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px;">Read Source Article →</a></p>` : ""}
    
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;">
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">This email was generated by FlytBase Signal Intelligence. ${articleSource ? `Source: ${articleSource}` : ""}</p>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: SMTP_USER,
      to: partnerEmail,
      subject,
      text: "Please view this email in an HTML-capable client.",
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
