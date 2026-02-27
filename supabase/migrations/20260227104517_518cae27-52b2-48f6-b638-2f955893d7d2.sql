-- Add lead lifecycle status to opportunity_packs
ALTER TABLE public.opportunity_packs 
ADD COLUMN status text NOT NULL DEFAULT 'open',
ADD COLUMN status_updated_at timestamp with time zone DEFAULT now(),
ADD COLUMN notes text;

-- Create index for status filtering
CREATE INDEX idx_opportunity_packs_status ON public.opportunity_packs(status);

-- Add trigger to auto-update status_updated_at
CREATE OR REPLACE FUNCTION public.update_opportunity_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_opportunity_status_ts
BEFORE UPDATE ON public.opportunity_packs
FOR EACH ROW
EXECUTE FUNCTION public.update_opportunity_status_timestamp();

-- Add UPDATE policy for opportunity_packs (currently missing)
CREATE POLICY "Anyone can update opportunity packs"
ON public.opportunity_packs
FOR UPDATE
USING (true);