# Supabase Setup Guide

## Current Status
✅ Project ID: `foquizlrnwmseabjvpok`
✅ Migrations: 17 migration files
✅ Functions: 5 edge functions (collect-news, score-articles, deep-dive, collect-linkedin, send-partner-email)
⚠️ Connection: Currently inactive

## Quick Fix: Reactivate Project

### Step 1: Go to Supabase Dashboard
1. Visit [Supabase Dashboard](https://supabase.com/dashboard)
2. Sign in with your account
3. You should see your project `bdpulse` or similar in the list

### Step 2: Check Project Status
- If the project shows a **⏸ Paused** badge, click it to resume
- If the project shows as inactive, click **Settings** → check billing/subscription status
- Make sure the project is in **Active** state

### Step 3: Verify Connection
Once activated, test the connection:

```bash
# Test Supabase connection
curl -i https://foquizlrnwmseabjvpok.supabase.co/rest/v1/ \
  -H "apikey: $(grep VITE_SUPABASE_PUBLISHABLE_KEY .env | cut -d'"' -f2)"
```

Expected response: 200 OK

## Supabase Project Details

**Project ID:** `foquizlrnwmseabjvpok`
**Region:** Check dashboard for exact region

### Environment Variables (Already Set in .env)
```
VITE_SUPABASE_PROJECT_ID=foquizlrnwmseabjvpok
VITE_SUPABASE_URL=https://foquizlrnwmseabjvpok.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

### Database Schema (Applied via Migrations)
- ✅ `collected_articles` - News articles from Step 1
- ✅ `collection_runs` - Metadata for collection jobs
- ✅ `opportunity_packs` - Analyzed opportunities from Step 3
- ✅ `flytbase_partners` - Partner data
- ✅ `market_trends` - Market trend data
- Plus additional tables for other features

### Edge Functions Deployed
- `collect-news` - Fetches articles from Google News
- `score-articles` - AI scoring for articles
- `deep-dive` - Deep analysis for opportunities
- `collect-linkedin` - LinkedIn data collection
- `send-partner-email` - Email notifications

## Troubleshooting

### "Project is currently not active"
1. **Check subscription**: Go to Settings → Billing
   - Ensure you have an active subscription or free plan
   - Resume paused projects if applicable

2. **Check project status**: Settings → Project Settings
   - Status should be "Active"

3. **Reconnect CLI**:
   ```bash
   npx supabase projects list
   npx supabase projects link --project-ref foquizlrnwmseabjvpok
   ```

### Connection Test Failed
1. Verify your API key is valid (check .env file)
2. Ensure project is in the correct region
3. Try different API endpoint:
   ```bash
   curl -i https://foquizlrnwmseabjvpok.supabase.co/auth/v1/health
   ```

### Database Tables Not Showing
1. Verify migrations have been applied:
   ```bash
   npm run db:check
   ```
   Should show all tables with record counts

2. Apply pending migrations:
   ```bash
   npx supabase db pull
   npx supabase db push
   ```

## Next Steps After Activation

### 1. Apply Database Policies (for truncation)
Run this SQL in Supabase SQL Editor:
```sql
CREATE POLICY "Anyone can delete collected articles"
  ON public.collected_articles FOR DELETE USING (true);

CREATE POLICY "Anyone can delete collection runs"
  ON public.collection_runs FOR DELETE USING (true);
```

### 2. Test Database Connection
```bash
npm run db:check
```

### 3. Deploy Edge Functions
```bash
npx supabase functions deploy collect-news
npx supabase functions deploy score-articles
npx supabase functions deploy deep-dive
```

### 4. Run Application
```bash
npm run dev
```

## Support

- **Supabase Docs**: https://supabase.com/docs
- **Project Dashboard**: https://supabase.com/dashboard/project/foquizlrnwmseabjvpok
- **Settings**: https://supabase.com/dashboard/project/foquizlrnwmseabjvpok/settings
