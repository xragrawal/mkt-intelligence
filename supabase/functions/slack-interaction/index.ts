import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

/**
 * Verifies the Slack request signature using HMAC-SHA256.
 * Prevents spoofed requests from non-Slack sources.
 */
async function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): Promise<boolean> {
  // Reject requests older than 5 minutes (replay attack prevention)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(sigBasestring)
  );
  const hex = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const computedSignature = `v0=${hex}`;

  // Constant-time comparison to prevent timing attacks
  if (computedSignature.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedSignature.length; i++) {
    mismatch |= computedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

async function updateSlackMessage(
  token: string,
  channel: string,
  ts: string,
  text: string,
  approved: boolean
) {
  await fetch("https://slack.com/api/chat.update", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel,
      ts,
      text,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: approved
              ? `✅ *Email approved and sent* — ${text}`
              : `❌ *Email rejected* — ${text}`,
          },
        },
      ],
    }),
  });
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

// ── Open Slack modal for editing email ────────────────────────────────────────
async function openEditModal(
  token: string,
  triggerId: string,
  approvalId: string,
  emailSubject: string,
  emailText: string
) {
  const res = await fetch("https://slack.com/api/views.open", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: "edit_email_modal",
        private_metadata: approvalId,
        title: { type: "plain_text", text: "Edit Email" },
        submit: { type: "plain_text", text: "Send Email" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "subject_block",
            label: { type: "plain_text", text: "Subject" },
            element: {
              type: "plain_text_input",
              action_id: "subject_input",
              initial_value: emailSubject,
            },
          },
          {
            type: "input",
            block_id: "body_block",
            label: { type: "plain_text", text: "Email Body" },
            hint: { type: "plain_text", text: "Plain text — edit freely before sending" },
            element: {
              type: "plain_text_input",
              action_id: "body_input",
              multiline: true,
              initial_value: emailText,
            },
          },
        ],
      },
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error("views.open error:", data.error);
  }
}

// ── Handle modal submission (edit & send) ─────────────────────────────────────
async function handleModalSubmission(payload: Record<string, unknown>) {
  const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SMTP_HOST = Deno.env.get("SMTP_HOST");
  const SMTP_PORT = Deno.env.get("SMTP_PORT");
  const SMTP_USER = Deno.env.get("SMTP_USER");
  const SMTP_PASS = Deno.env.get("SMTP_PASS");

  // deno-lint-ignore no-explicit-any
  const view = payload.view as any;
  if (view?.callback_id !== "edit_email_modal") return;

  const approvalId = view.private_metadata as string;
  // deno-lint-ignore no-explicit-any
  const values = view?.state?.values as Record<string, Record<string, any>>;
  const editedSubject: string = values?.subject_block?.subject_input?.value || "";
  const editedBody: string = values?.body_block?.body_input?.value || "";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: approval, error } = await supabase
    .from("pending_email_approvals")
    .select("*")
    .eq("id", approvalId)
    .single();

  if (error || !approval) {
    console.error("Approval not found for modal submission:", approvalId, error);
    return;
  }

  if (approval.status !== "pending") {
    console.log(`Approval ${approvalId} already processed: ${approval.status}`);
    return;
  }

  const companyName = (approval.email_params as Record<string, unknown>)?.companyName as string || "prospect";

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.error("SMTP credentials not configured");
    return;
  }

  const editedHtml = textToHtml(editedBody);

  const port = parseInt(SMTP_PORT, 10);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: `Ravikant Agrawal <${SMTP_USER}>`,
    to: approval.recipient_email,
    subject: editedSubject,
    text: editedBody,
    html: editedHtml,
  });

  // Update opportunity_packs status
  if (approval.opportunity_pack_id) {
    const now = new Date().toISOString();
    const { data: pack } = await supabase
      .from("opportunity_packs")
      .select("status_history")
      .eq("id", approval.opportunity_pack_id)
      .single();

    const history = Array.isArray(pack?.status_history) ? pack.status_history : [];
    history.push({ status: "shared_with_partners", changed_at: now });

    await supabase
      .from("opportunity_packs")
      .update({
        status: "shared_with_partners",
        status_history: history,
        status_updated_at: now,
      })
      .eq("id", approval.opportunity_pack_id);
  }

  // Mark approved and save edited content
  await supabase
    .from("pending_email_approvals")
    .update({
      status: "approved",
      email_subject: editedSubject,
      email_text: editedBody,
      email_html: editedHtml,
      updated_at: new Date().toISOString(),
    })
    .eq("id", approvalId);

  // Update Slack message
  if (approval.slack_channel_id && approval.slack_message_ts) {
    await updateSlackMessage(
      SLACK_BOT_TOKEN,
      approval.slack_channel_id,
      approval.slack_message_ts,
      `Email (edited) sent to ${approval.recipient_email} (${companyName})`,
      true
    );
  }

  console.log(`Email edited and sent to ${approval.recipient_email}`);
}

// ── Handle approve / reject button actions ────────────────────────────────────
async function processInteraction(payload: Record<string, unknown>) {
  const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SMTP_HOST = Deno.env.get("SMTP_HOST");
  const SMTP_PORT = Deno.env.get("SMTP_PORT");
  const SMTP_USER = Deno.env.get("SMTP_USER");
  const SMTP_PASS = Deno.env.get("SMTP_PASS");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const actions = payload.actions as Array<{ action_id: string; value: string }>;
  if (!actions || actions.length === 0) return;

  const action = actions[0];
  const approvalId = action.value;
  const isApprove = action.action_id === "approve_email";

  // Fetch approval record
  const { data: approval, error } = await supabase
    .from("pending_email_approvals")
    .select("*")
    .eq("id", approvalId)
    .single();

  if (error || !approval) {
    console.error("Approval not found:", approvalId, error);
    return;
  }

  if (approval.status !== "pending") {
    console.log(`Approval ${approvalId} already processed: ${approval.status}`);
    return;
  }

  const companyName = (approval.email_params as Record<string, unknown>)?.companyName as string || "prospect";

  if (isApprove) {
    // Send the email
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      console.error("SMTP credentials not configured");
      return;
    }
    const port = parseInt(SMTP_PORT, 10);
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `Ravikant Agrawal <${SMTP_USER}>`,
      to: approval.recipient_email,
      subject: approval.email_subject,
      text: approval.email_text,
      html: approval.email_html,
    });

    // Update opportunity_packs status
    if (approval.opportunity_pack_id) {
      const now = new Date().toISOString();
      const { data: pack } = await supabase
        .from("opportunity_packs")
        .select("status_history")
        .eq("id", approval.opportunity_pack_id)
        .single();

      const history = Array.isArray(pack?.status_history) ? pack.status_history : [];
      history.push({ status: "shared_with_partners", changed_at: now });

      await supabase
        .from("opportunity_packs")
        .update({
          status: "shared_with_partners",
          status_history: history,
          status_updated_at: now,
        })
        .eq("id", approval.opportunity_pack_id);
    }

    // Mark approval as approved
    await supabase
      .from("pending_email_approvals")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", approvalId);

    // Update Slack message
    if (approval.slack_channel_id && approval.slack_message_ts) {
      await updateSlackMessage(
        SLACK_BOT_TOKEN,
        approval.slack_channel_id,
        approval.slack_message_ts,
        `Email sent to ${approval.recipient_email} (${companyName})`,
        true
      );
    }

    console.log(`Email approved and sent to ${approval.recipient_email}`);
  } else {
    // Rejected — mark status, leave opportunity_packs unchanged
    await supabase
      .from("pending_email_approvals")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", approvalId);

    if (approval.slack_channel_id && approval.slack_message_ts) {
      await updateSlackMessage(
        SLACK_BOT_TOKEN,
        approval.slack_channel_id,
        approval.slack_message_ts,
        `Email to ${approval.recipient_email} (${companyName}) was rejected`,
        false
      );
    }

    console.log(`Email rejected for ${approval.recipient_email}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  // Slack sends application/x-www-form-urlencoded for interactions
  const rawBody = await req.text();

  const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET");
  if (!SLACK_SIGNING_SECRET) {
    return new Response("Slack signing secret not configured", { status: 500 });
  }

  const timestamp = req.headers.get("x-slack-request-timestamp") || "";
  const signature = req.headers.get("x-slack-signature") || "";

  const valid = await verifySlackSignature(SLACK_SIGNING_SECRET, timestamp, rawBody, signature);
  if (!valid) {
    console.error("Invalid Slack signature");
    return new Response("Unauthorized", { status: 401 });
  }

  // Parse URL-encoded payload
  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");
  if (!payloadStr) {
    return new Response("No payload", { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return new Response("Invalid payload JSON", { status: 400 });
  }

  const payloadType = payload.type as string;

  // ── Modal submission (edit & send) ─────────────────────────────────────────
  if (payloadType === "view_submission") {
    // Process async — return 200 immediately so Slack closes the modal
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil(handleModalSubmission(payload));
    handleModalSubmission(payload).catch((e) => console.error("handleModalSubmission error:", e));
    return new Response("", { status: 200 });
  }

  // ── Button actions ──────────────────────────────────────────────────────────
  if (payloadType === "block_actions") {
    const actions = payload.actions as Array<{ action_id: string; value: string }>;
    const action = actions?.[0];

    if (action?.action_id === "edit_email") {
      // Must open modal synchronously — trigger_id expires in 3 seconds
      const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (SLACK_BOT_TOKEN && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: approval } = await supabase
          .from("pending_email_approvals")
          .select("email_subject, email_text")
          .eq("id", action.value)
          .single();

        if (approval) {
          await openEditModal(
            SLACK_BOT_TOKEN,
            payload.trigger_id as string,
            action.value,
            approval.email_subject || "",
            approval.email_text || ""
          );
        }
      }
      return new Response("", { status: 200 });
    }

    // approve / reject — process asynchronously
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil(processInteraction(payload));
    processInteraction(payload).catch((e) => console.error("processInteraction error:", e));
  }

  return new Response("", { status: 200 });
});
