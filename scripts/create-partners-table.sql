-- Create the missing flytbase_partners table
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

-- Also add the missing columns to opportunity_packs if needed
ALTER TABLE public.opportunity_packs
ADD COLUMN IF NOT EXISTS matched_partner_name TEXT,
ADD COLUMN IF NOT EXISTS matched_partner_email TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open',
ADD COLUMN IF NOT EXISTS batch_id TEXT,
ADD COLUMN IF NOT EXISTS keywords TEXT[],
ADD COLUMN IF NOT EXISTS filter_days INT,
ADD COLUMN IF NOT EXISTS collection_ran_at TIMESTAMPTZ;
