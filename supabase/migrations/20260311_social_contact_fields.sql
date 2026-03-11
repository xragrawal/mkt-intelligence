-- Social Contact Fields Migration
-- Adds phone number extraction and author social handle capture for LinkedIn/Facebook posts

-- scored_articles
ALTER TABLE scored_articles ADD COLUMN IF NOT EXISTS phones_mentioned TEXT[];
ALTER TABLE scored_articles ADD COLUMN IF NOT EXISTS author_social_handle TEXT;

-- opportunity_packs
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS phones_mentioned TEXT[];
ALTER TABLE opportunity_packs ADD COLUMN IF NOT EXISTS author_social_handle TEXT;
