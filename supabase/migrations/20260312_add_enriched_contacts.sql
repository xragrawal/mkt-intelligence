-- Add enriched_contacts column to store an array of EnrichedContact JSON objects
ALTER TABLE opportunity_packs
ADD COLUMN IF NOT EXISTS enriched_contacts JSONB DEFAULT '[]'::jsonb;
