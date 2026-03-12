-- BD Pulse schema patch for new Supabase project
-- Brings opportunity_packs and scored_articles in line with the current app/edge functions.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) opportunity_packs: lifecycle, dedup, enrichment, and audit fields
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.opportunity_packs
  ADD COLUMN IF NOT EXISTS status                 text        NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS status_updated_at      timestamptz          DEFAULT now(),
  ADD COLUMN IF NOT EXISTS notes                  text,
  ADD COLUMN IF NOT EXISTS normalized_article_url text,
  ADD COLUMN IF NOT EXISTS normalized_article_title text,
  ADD COLUMN IF NOT EXISTS last_analyzed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS status_history         jsonb       DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS enriched_contacts      jsonb,
  ADD COLUMN IF NOT EXISTS flytbase_mentioned     boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS added_to_queue_at      timestamptz,
  ADD COLUMN IF NOT EXISTS phones_mentioned       text[],
  ADD COLUMN IF NOT EXISTS author_social_handle   text,
  ADD COLUMN IF NOT EXISTS poc_name               text,
  ADD COLUMN IF NOT EXISTS use_case_category      text,
  ADD COLUMN IF NOT EXISTS batch_region           text,
  ADD COLUMN IF NOT EXISTS is_re_associated       boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS re_associated_from_batch_id text;

-- Indexes for dedup + status filtering
CREATE INDEX IF NOT EXISTS idx_opp_packs_normalized_url
  ON public.opportunity_packs (normalized_article_url);

CREATE INDEX IF NOT EXISTS idx_opportunity_packs_status
  ON public.opportunity_packs (status);

-- Trigger to keep status_updated_at in sync when status changes
CREATE OR REPLACE FUNCTION public.update_opportunity_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_opportunity_status_ts ON public.opportunity_packs;

CREATE TRIGGER update_opportunity_status_ts
BEFORE UPDATE ON public.opportunity_packs
FOR EACH ROW
EXECUTE FUNCTION public.update_opportunity_status_timestamp();

-- Backfill normalized URL (strip tracking params, lowercase, trim trailing slashes)
UPDATE public.opportunity_packs
SET normalized_article_url = lower(
  regexp_replace(
    regexp_replace(
      regexp_replace(article_url, '[?&]utm_[^&]*', '', 'g'),
      '[?&](ref|fbclid|gclid)=[^&]*', '', 'g'
    ),
    '/+$', ''
  )
)
WHERE normalized_article_url IS NULL
  AND article_url IS NOT NULL;

-- Backfill normalized title
UPDATE public.opportunity_packs
SET normalized_article_title = lower(regexp_replace(article_title, '[^\\w\\s]', '', 'g'))
WHERE normalized_article_title IS NULL
  AND article_title IS NOT NULL;

-- Backfill last_analyzed_at from created_at when missing
UPDATE public.opportunity_packs
SET last_analyzed_at = COALESCE(last_analyzed_at, created_at)
WHERE last_analyzed_at IS NULL;

-- Seed status_history for existing rows
UPDATE public.opportunity_packs
SET status_history = jsonb_build_array(
  jsonb_build_object(
    'status', status,
    'changed_at', created_at::text
  )
)
WHERE status_history IS NULL
   OR status_history = '[]'::jsonb;

-- Allow updates from the app (used for status changes from Step 3 & Slack flows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'opportunity_packs'
      AND policyname = 'Anyone can update opportunity packs'
  ) THEN
    CREATE POLICY "Anyone can update opportunity packs"
    ON public.opportunity_packs
    FOR UPDATE
    USING (true);
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) scored_articles: fields used by score-articles edge function
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.scored_articles
  ADD COLUMN IF NOT EXISTS phones_mentioned       text[],
  ADD COLUMN IF NOT EXISTS author_social_handle   text,
  ADD COLUMN IF NOT EXISTS source                 text;
