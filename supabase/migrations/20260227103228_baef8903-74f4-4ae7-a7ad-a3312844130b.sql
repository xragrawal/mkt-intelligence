-- Allow upserts on scored_articles (needed for caching)
CREATE POLICY "Anyone can update scored articles"
ON public.scored_articles
FOR UPDATE
USING (true);
