CREATE TABLE public.flytbase_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  region text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flytbase_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read partners" ON public.flytbase_partners FOR SELECT USING (true);
CREATE POLICY "Anyone can insert partners" ON public.flytbase_partners FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update partners" ON public.flytbase_partners FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete partners" ON public.flytbase_partners FOR DELETE USING (true);

ALTER TABLE public.opportunity_packs
  ADD COLUMN matched_partner_name text,
  ADD COLUMN matched_partner_email text;

INSERT INTO public.flytbase_partners (name, region, email) VALUES
  ('Alpha Partners', 'Brazil', 'contact@alphapartnersxx.com'),
  ('Zenith Group', 'Japan', 'contact@zenithxx.com');