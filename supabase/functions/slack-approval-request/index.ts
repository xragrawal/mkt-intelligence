import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, type EmailParams } from "../_shared/email-builder.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

serve(async (req) => {
  console.log("slack-approval-request invoked:", req.method);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
    console.log("Secrets check — SLACK_BOT_TOKEN present:", !!SLACK_BOT_TOKEN);
    const SLACK_USER_ID = Deno.env.get("SLACK_USER_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SLACK_BOT_TOKEN || !SLACK_USER_ID) {
      throw new Error("Slack credentials not configured");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const body = await req.json();
    const {
      opportunityPackId,
      partnerName, partnerEmail, pocName, companyName,
      inferredIndustry, deploymentRegion, country, eventType,
      unitsMentioned, articleTitle, articleUrl,
      whyThisIsHot, strategicEntryPoint, useCaseCategory,
    } = body;

    if (!opportunityPackId) {
      return new Response(
        JSON.stringify({ error: "opportunityPackId is required to create a pending email approval" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!partnerEmail || !companyName) {
      return new Response(
        JSON.stringify({ error: "partnerEmail and companyName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build email preview
    const emailParams: EmailParams = {
      partnerName, partnerEmail, pocName, companyName,
      inferredIndustry, deploymentRegion, country, eventType,
      unitsMentioned, articleTitle, articleUrl,
      whyThisIsHot, strategicEntryPoint, useCaseCategory,
    };
    const { subject, htmlBody, textBody } = buildEmail(emailParams);

    // Store pending approval in DB
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: approval, error: dbError } = await supabase
      .from("pending_email_approvals")
      .insert({
        opportunity_pack_id: opportunityPackId,
        email_params: emailParams,
        email_subject: subject,
        email_html: htmlBody,
        email_text: textBody,
        recipient_email: partnerEmail,
        status: "pending",
      })
      .select("id")
      .single();

    if (dbError || !approval) {
      throw new Error(`DB insert error: ${JSON.stringify(dbError)}`);
    }

    const approvalId = approval.id;

    // Open DM channel with approver
    const openDMRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ users: SLACK_USER_ID }),
    });
    const openDMData = await openDMRes.json();
    if (!openDMData.ok) {
      throw new Error(`Slack conversations.open error: ${openDMData.error}`);
    }
    const channelId = openDMData.channel.id;

    // Truncate email body for Slack preview (Slack blocks have 3000 char limit)
    const previewText = textBody.length > 1800 ? textBody.slice(0, 1800) + "\n…(truncated)" : textBody;

    // Build Block Kit message
    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "📧 Email Approval Request — Flytbase LeadGen" },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Company:*\n${companyName}` },
          { type: "mrkdwn", text: `*Country:*\n${country || deploymentRegion || "—"}` },
          { type: "mrkdwn", text: `*POC:*\n${pocName || "—"}` },
          { type: "mrkdwn", text: `*Use Case:*\n${useCaseCategory || "—"}` },
          { type: "mrkdwn", text: `*To:*\n${partnerEmail}` },
          { type: "mrkdwn", text: `*Article:*\n<${articleUrl || ""}|${articleTitle || companyName}>` },
        ],
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Subject:* ${subject}\n\n\`\`\`${previewText}\`\`\``,
        },
      },
      { type: "divider" },
      {
        type: "actions",
        block_id: "approval_actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✏️ Edit & Send" },
            action_id: "edit_email",
            value: approvalId,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Approve & Send" },
            style: "primary",
            action_id: "approve_email",
            value: approvalId,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "❌ Reject" },
            style: "danger",
            action_id: "reject_email",
            value: approvalId,
          },
        ],
      },
    ];

    // Post to Slack DM
    const postRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        text: `Email approval needed for ${companyName} → ${partnerEmail}`,
        blocks,
      }),
    });
    const postData = await postRes.json();
    if (!postData.ok) {
      throw new Error(`Slack chat.postMessage error: ${postData.error}`);
    }

    // Store Slack message metadata for later update
    await supabase
      .from("pending_email_approvals")
      .update({
        slack_channel_id: channelId,
        slack_message_ts: postData.ts,
      })
      .eq("id", approvalId);

    return new Response(
      JSON.stringify({ success: true, approvalId, message: `Slack DM sent for approval` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("slack-approval-request error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
