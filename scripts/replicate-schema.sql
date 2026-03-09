/**
 * BD Pulse LeadGen - Database Schema Replication Script
 *
 * This script recreates all tables, indexes, and RLS policies
 * for a fresh Supabase project setup.
 *
 * Usage:
 * 1. Copy the entire contents of this file
 * 2. Go to your new Supabase project → SQL Editor
 * 3. Create new query and paste this script
 * 4. Run it
 *
 * Or use CLI:
 * supabase db push --linked
 */

-- ============================================================================
-- TABLE 1: collected_articles
-- ============================================================================
-- Stores articles fetched from Google News, LinkedIn, and Facebook
CREATE TABLE IF NOT EXISTS public.collected_articles (
  id TEXT NOT NULL PRIMARY KEY,
  keyword TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT,
  publishing_agency TEXT,
  published_at TIMESTAMPTZ,
  source TEXT DEFAULT 'google_news', -- 'google_news', 'linkedin', or 'facebook'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  batch_id TEXT NOT NULL
);

-- Enable RLS
ALTER TABLE public.collected_articles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can read collected articles"
  ON public.collected_articles FOR SELECT USING (true);

CREATE POLICY "Anyone can insert collected articles"
  ON public.collected_articles FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can delete collected articles"
  ON public.collected_articles FOR DELETE USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_collected_articles_batch ON public.collected_articles(batch_id);
CREATE INDEX IF NOT EXISTS idx_collected_articles_source ON public.collected_articles(source);
CREATE INDEX IF NOT EXISTS idx_collected_articles_keyword ON public.collected_articles(keyword);

-- ============================================================================
-- TABLE 2: collection_runs
-- ============================================================================
-- Metadata about each collection run (Step 1)
CREATE TABLE IF NOT EXISTS public.collection_runs (
  id TEXT NOT NULL PRIMARY KEY,
  keywords TEXT[] NOT NULL,
  articles_collected INT NOT NULL DEFAULT 0,
  articles_stored INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  last_published_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.collection_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can read collection runs"
  ON public.collection_runs FOR SELECT USING (true);

CREATE POLICY "Anyone can insert collection runs"
  ON public.collection_runs FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update collection runs"
  ON public.collection_runs FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete collection runs"
  ON public.collection_runs FOR DELETE USING (true);

-- ============================================================================
-- TABLE 3: scored_articles
-- ============================================================================
-- Cache table for articles processed through Step 2 (scoring)
CREATE TABLE IF NOT EXISTS public.scored_articles (
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
  involved_parties TEXT[] DEFAULT ARRAY[]::TEXT[],
  deal_value text,
  poc_name text,
  use_case_category text,
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

-- Enable RLS
ALTER TABLE public.scored_articles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can read scored articles"
  ON public.scored_articles FOR SELECT USING (true);

CREATE POLICY "Anyone can insert scored articles"
  ON public.scored_articles FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update scored articles"
  ON public.scored_articles FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete scored articles"
  ON public.scored_articles FOR DELETE USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scored_articles_batch ON public.scored_articles(batch_id);
CREATE INDEX IF NOT EXISTS idx_scored_articles_article ON public.scored_articles(article_id);
CREATE INDEX IF NOT EXISTS idx_scored_articles_bd_impact ON public.scored_articles(bd_impact_score);
CREATE INDEX IF NOT EXISTS idx_scored_articles_confidence ON public.scored_articles(confidence);

-- ============================================================================
-- TABLE 4: flytbase_partners
-- ============================================================================
-- Partners database for lead matching by region
CREATE TABLE IF NOT EXISTS public.flytbase_partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  region TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flytbase_partners ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can read partners"
  ON public.flytbase_partners FOR SELECT USING (true);

CREATE POLICY "Anyone can insert partners"
  ON public.flytbase_partners FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update partners"
  ON public.flytbase_partners FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete partners"
  ON public.flytbase_partners FOR DELETE USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_flytbase_partners_region ON public.flytbase_partners(region);

-- ============================================================================
-- TABLE 5: opportunity_packs
-- ============================================================================
-- Persisted opportunity intelligence from Step 3 (deep-dive analysis)
CREATE TABLE IF NOT EXISTS public.opportunity_packs (
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
  matched_partner_name TEXT,
  matched_partner_email TEXT,
  status TEXT DEFAULT 'open',
  batch_id TEXT,
  keywords TEXT[],
  filter_days INT,
  collection_ran_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.opportunity_packs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can read opportunity packs"
  ON public.opportunity_packs FOR SELECT USING (true);

CREATE POLICY "Anyone can insert opportunity packs"
  ON public.opportunity_packs FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can delete opportunity packs"
  ON public.opportunity_packs FOR DELETE USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_opportunity_packs_company ON public.opportunity_packs(company_name);
CREATE INDEX IF NOT EXISTS idx_opportunity_packs_region ON public.opportunity_packs(deployment_region);

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Tables created:
-- 1. collected_articles - Articles from all sources (Google News, LinkedIn, Facebook)
-- 2. collection_runs - Metadata about collection jobs
-- 3. scored_articles - Cached scoring results from Step 2
-- 4. flytbase_partners - Partner database for lead matching by region
-- 5. opportunity_packs - Final opportunity intelligence from Step 3
--
-- All tables have RLS enabled with permissive policies for public access
-- Indexes created for optimal query performance on common filters
-- ============================================================================
