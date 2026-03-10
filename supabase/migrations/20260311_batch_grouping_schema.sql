-- Migration: Batch Grouping Schema Changes
-- Adds columns needed for batch-grouped Step 3 queue and re-association tracking

-- 1. Persist regions in collection_runs (currently discarded after Step 1)
ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS regions TEXT[] DEFAULT '{}';

-- 2. Preserve original batch before re-association overwrites batch_id
ALTER TABLE collected_articles ADD COLUMN IF NOT EXISTS original_batch_id TEXT;

-- 3. New columns on opportunity_packs for batch grouping
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS batch_region TEXT;
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS added_to_queue_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS is_re_associated BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS re_associated_from_batch_id TEXT;

-- 4. Backfill added_to_queue_at from created_at for existing records
UPDATE opportunity_packs SET added_to_queue_at = created_at WHERE added_to_queue_at IS NULL;
