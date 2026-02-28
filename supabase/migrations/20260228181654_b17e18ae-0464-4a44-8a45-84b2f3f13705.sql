
-- Add batch reference columns to opportunity_packs
ALTER TABLE public.opportunity_packs 
ADD COLUMN IF NOT EXISTS batch_id text,
ADD COLUMN IF NOT EXISTS keywords text[],
ADD COLUMN IF NOT EXISTS filter_days integer,
ADD COLUMN IF NOT EXISTS collection_ran_at timestamp with time zone;

-- Add batch reference columns to scored_articles so we can track collection context
-- (batch_id already exists, just need to ensure we store collection metadata)
