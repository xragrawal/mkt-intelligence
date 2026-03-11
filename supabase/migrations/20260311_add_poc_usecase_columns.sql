-- Add missing columns for PoC name and Use Case category
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS poc_name TEXT;
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS use_case_category TEXT;
