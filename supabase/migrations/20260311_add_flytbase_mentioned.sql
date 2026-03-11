-- Add flytbase_mentioned column to opportunity_packs
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS flytbase_mentioned BOOLEAN DEFAULT false;

-- Index for filtering by flytbase_mentioned status
CREATE INDEX IF NOT EXISTS idx_opp_packs_flytbase_mentioned ON opportunity_packs(flytbase_mentioned);
