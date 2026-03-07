ALTER TABLE public.scored_articles ADD COLUMN IF NOT EXISTS involved_parties text[] DEFAULT NULL;
ALTER TABLE public.scored_articles ADD COLUMN IF NOT EXISTS deal_value text DEFAULT NULL;