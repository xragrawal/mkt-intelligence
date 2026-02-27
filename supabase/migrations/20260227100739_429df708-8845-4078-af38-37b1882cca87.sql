
-- Cache table for scored articles to avoid re-scoring
CREATE TABLE public.scored_articles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id text NOT NULL,
  batch_id text NOT NULL,
  is_relevant boolean NOT NULL DEFAULT false,
  drop_reason text,
  company text,
  partner_or_si text,
  country text,
  city text,
  units_mentioned integer,
  buying_intent_type text,
  lead_clarity_score integer DEFAULT 0,
  buying_intent_score integer DEFAULT 0,
  source_quality_score integer DEFAULT 0,
  bd_impact_score integer DEFAULT 0,
  why_it_matters text,
  confidence text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(article_id)
);

ALTER TABLE public.scored_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read scored articles" ON public.scored_articles FOR SELECT USING (true);
CREATE POLICY "Anyone can insert scored articles" ON public.scored_articles FOR INSERT WITH CHECK (true);

CREATE INDEX idx_scored_articles_batch ON public.scored_articles(batch_id);
CREATE INDEX idx_scored_articles_article ON public.scored_articles(article_id);
