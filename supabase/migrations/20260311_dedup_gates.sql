-- Deduplication Gates Migration
-- Implements all gap resolutions from the dedup architecture review

-- Gap 2+8: Normalized URL + title columns for Gate 3 dedup in deep-dive
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS normalized_article_url TEXT;
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS normalized_article_title TEXT;

-- Index for fast Gate 3 normalized URL lookups
CREATE INDEX IF NOT EXISTS idx_opp_packs_normalized_url ON opportunity_packs(normalized_article_url);

-- Backfill normalized URLs for existing records (strip common tracking params, lowercase)
UPDATE opportunity_packs
SET normalized_article_url = lower(
  regexp_replace(
    regexp_replace(
      regexp_replace(article_url, '[?&]utm_[^&]*', '', 'g'),
      '[?&](ref|fbclid|gclid)=[^&]*', '', 'g'
    ),
    '/+$', ''
  )
)
WHERE normalized_article_url IS NULL;

-- Backfill normalized titles for existing records
UPDATE opportunity_packs
SET normalized_article_title = lower(regexp_replace(article_title, '[^\w\s]', '', 'g'))
WHERE normalized_article_title IS NULL;

-- Gap 6: Track when each pack was last analyzed (for 60-day staleness indicator)
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS last_analyzed_at TIMESTAMPTZ;

-- Backfill: treat created_at as the initial analysis date
UPDATE opportunity_packs
SET last_analyzed_at = created_at
WHERE last_analyzed_at IS NULL;

-- Gap 10: Audit trail — full status lifecycle history
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb;

-- Backfill: seed status_history with the current status and created_at as the initial entry
UPDATE opportunity_packs
SET status_history = jsonb_build_array(
  jsonb_build_object(
    'status', status,
    'changed_at', created_at::text
  )
)
WHERE status_history = '[]'::jsonb OR status_history IS NULL;
