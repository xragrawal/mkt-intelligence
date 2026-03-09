-- Add DELETE policies for collected_articles and collection_runs
-- This allows truncating the database for fresh e2e testing

CREATE POLICY "Anyone can delete collected articles"
  ON public.collected_articles FOR DELETE USING (true);

CREATE POLICY "Anyone can delete collection runs"
  ON public.collection_runs FOR DELETE USING (true);
