-- Add use_case_category to scored_articles
ALTER TABLE public.scored_articles ADD COLUMN IF NOT EXISTS use_case_category text;

-- Create market_trends table for accumulating trend data
CREATE TABLE IF NOT EXISTS public.market_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_category text NOT NULL,
  article_id text NOT NULL,
  batch_id text NOT NULL,
  article_title text NOT NULL,
  article_url text NOT NULL,
  company text,
  country text,
  bd_impact_score integer,
  buying_intent_type text,
  why_it_matters text,
  flytbase_mentioned boolean DEFAULT false,
  tagged_at timestamp with time zone DEFAULT now(),
  tagged_by text DEFAULT 'manual',
  notes text
);

ALTER TABLE public.market_trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read market trends" ON public.market_trends FOR SELECT USING (true);
CREATE POLICY "Anyone can insert market trends" ON public.market_trends FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update market trends" ON public.market_trends FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete market trends" ON public.market_trends FOR DELETE USING (true);

-- Unique constraint to prevent double-tagging
CREATE UNIQUE INDEX IF NOT EXISTS market_trends_article_id_key ON public.market_trends (article_id);