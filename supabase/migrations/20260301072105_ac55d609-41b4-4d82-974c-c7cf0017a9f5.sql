
-- Add source column to collected_articles to distinguish between Google News and LinkedIn
ALTER TABLE public.collected_articles 
ADD COLUMN source text NOT NULL DEFAULT 'google_news';

-- Add index for filtering by source
CREATE INDEX idx_collected_articles_source ON public.collected_articles(source);

-- Update existing articles to be marked as google_news (already default, but explicit)
UPDATE public.collected_articles SET source = 'google_news' WHERE source = 'google_news';
