# Database Truncation for E2E Testing

## Quick Start

To truncate the database for fresh e2e testing:

```bash
npm run db:truncate
```

Or to check current database record counts:

```bash
npm run db:check
```

## One-Time Setup Required

The database truncation requires DELETE policies on two tables. These policies need to be applied once to your Supabase project.

### Step 1: Add DELETE Policies

Go to your **[Supabase SQL Editor](https://supabase.com/dashboard)** and run this SQL:

```sql
-- Add DELETE policies for collected_articles and collection_runs
CREATE POLICY "Anyone can delete collected articles"
  ON public.collected_articles FOR DELETE USING (true);

CREATE POLICY "Anyone can delete collection runs"
  ON public.collection_runs FOR DELETE USING (true);
```

### Step 2: Verify Policies Were Created

Run this SQL to confirm the policies exist:

```sql
SELECT * FROM pg_policies
WHERE tablename IN ('collected_articles', 'collection_runs');
```

You should see:
- "Anyone can delete collected articles" on collected_articles table
- "Anyone can delete collection runs" on collection_runs table

### Step 3: Now Truncation Will Work

After the policies are created, run:

```bash
npm run db:truncate
```

This will delete all records from:
- `collected_articles` (news articles)
- `collection_runs` (collection job metadata)
- `opportunity_packs` (already has DELETE policy)

## Script Details

- **`npm run db:truncate`** - Truncates all data tables for fresh testing
- **`npm run db:check`** - Shows current record counts in each table
- **`scripts/truncate-db.ts`** - The truncation script
- **`scripts/check-db.ts`** - The record count check script

## Troubleshooting

If `npm run db:truncate` says "0 records deleted":

1. Verify the DELETE policies were created using the query above
2. Make sure you're using the correct Supabase project (check `.env` variables)
3. Check that RLS is enabled on the tables:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables
   WHERE tablename IN ('collected_articles', 'collection_runs', 'opportunity_packs');
   ```
   All should show `rowsecurity = true`
