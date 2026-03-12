-- Stores email payloads pending Slack approval before sending
CREATE TABLE IF NOT EXISTS public.pending_email_approvals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_pack_id TEXT        NOT NULL,
  email_params        JSONB       NOT NULL,   -- full params used to generate the email
  email_subject       TEXT        NOT NULL,
  email_html          TEXT        NOT NULL,
  email_text          TEXT        NOT NULL,
  recipient_email     TEXT        NOT NULL,
  slack_channel_id    TEXT,                   -- DM channel opened with approver
  slack_message_ts    TEXT,                   -- message timestamp for chat.update
  status              TEXT        NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: service role only (edge functions use service role key)
ALTER TABLE public.pending_email_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.pending_email_approvals
  USING (true)
  WITH CHECK (true);
