-- Add source column to collected_articles for tracking data source
ALTER TABLE public.collected_articles ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'google_news';

-- Add source column to scored_articles for persistence through scoring pipeline
ALTER TABLE public.scored_articles ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'unknown';

-- Add article_source column to market_trends for trend tracking
ALTER TABLE public.market_trends ADD COLUMN IF NOT EXISTS article_source TEXT;
