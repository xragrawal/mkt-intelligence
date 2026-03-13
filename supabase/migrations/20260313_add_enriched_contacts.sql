-- Add enriched_contacts column to opportunity_packs
-- Stores the full array of contacts extracted by Jina + GPT-4o + Apollo + Hunter
ALTER TABLE opportunity_packs
  ADD COLUMN IF NOT EXISTS enriched_contacts JSONB DEFAULT '[]'::jsonb;
