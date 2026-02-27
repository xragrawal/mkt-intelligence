
-- Collected articles from Step 1
CREATE TABLE public.collected_articles (
  id TEXT NOT NULL PRIMARY KEY, -- sha256 of URL
  keyword TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  publishing_agency TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  batch_id TEXT NOT NULL
);

ALTER TABLE public.collected_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read collected articles"
  ON public.collected_articles FOR SELECT USING (true);

CREATE POLICY "Anyone can insert collected articles"
  ON public.collected_articles FOR INSERT WITH CHECK (true);

-- Collection run metadata
CREATE TABLE public.collection_runs (
  id TEXT NOT NULL PRIMARY KEY, -- batch_id
  keywords TEXT[] NOT NULL,
  articles_collected INT NOT NULL DEFAULT 0,
  articles_stored INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  last_published_at TIMESTAMPTZ
);

ALTER TABLE public.collection_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read collection runs"
  ON public.collection_runs FOR SELECT USING (true);

CREATE POLICY "Anyone can insert collection runs"
  ON public.collection_runs FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update collection runs"
  ON public.collection_runs FOR UPDATE USING (true);

-- Persisted opportunity intelligence packs from Step 3
CREATE TABLE public.opportunity_packs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_url TEXT NOT NULL,
  article_title TEXT NOT NULL,
  article_source TEXT,
  company_name TEXT,
  inferred_industry TEXT,
  deployment_region TEXT,
  likely_buyer_type TEXT,
  maturity_signal TEXT,
  event_type TEXT,
  scale_description TEXT,
  urgency_level TEXT,
  expansion_likelihood TEXT,
  why_this_is_hot TEXT,
  strategic_entry_point TEXT,
  partnership_angle TEXT,
  risk_factors TEXT,
  opportunity_score INT,
  crm_ready_notes TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunity_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read opportunity packs"
  ON public.opportunity_packs FOR SELECT USING (true);

CREATE POLICY "Anyone can insert opportunity packs"
  ON public.opportunity_packs FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can delete opportunity packs"
  ON public.opportunity_packs FOR DELETE USING (true);
