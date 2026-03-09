# Supabase Project Setup - Complete Guide

## 📦 What's Included

I've created a complete schema replication toolkit for setting up BD Pulse in a new Supabase project:

| File | Purpose | Size |
|------|---------|------|
| **scripts/replicate-schema.sql** | Complete database schema (191 lines) | 7.1 KB |
| **scripts/setup-new-supabase-project.ts** | Automated setup script | 6.9 KB |
| **scripts/setup-new-project.sh** | Shell wrapper for easy execution | 2.1 KB |
| **SETUP_NEW_PROJECT.md** | Detailed step-by-step guide | Full documentation |

---

## 🚀 Quickest Path (2-5 minutes)

### Option 1: Fully Automated (Recommended)

```bash
# Run the setup script
bash scripts/setup-new-project.sh
```

This will:
1. ✅ Prompt you for Supabase credentials
2. ✅ Test the connection
3. ✅ Execute the schema (or guide you to do it manually)
4. ✅ Update your `.env` file
5. ✅ Show next steps

### Option 2: Step-by-Step Manual

If you prefer direct control:

```bash
# Just run the TypeScript script
npx tsx scripts/setup-new-supabase-project.ts
```

### Option 3: Pure SQL in Supabase Dashboard

1. Go to your Supabase project → **SQL Editor**
2. Create new query
3. Open `scripts/replicate-schema.sql` and copy everything
4. Paste into the SQL Editor
5. Click **Run**

---

## 📋 What Gets Created

### 4 Core Tables

1. **collected_articles** (Step 1 output)
   - Articles from Google News, LinkedIn, Facebook
   - ~50 articles per collection run
   - Columns: id, keyword, url, title, snippet, source, batch_id, etc.

2. **collection_runs** (Job metadata)
   - One row per collection execution
   - Tracks keywords, article counts, timing
   - Columns: id, keywords[], articles_collected, articles_stored, status, etc.

3. **scored_articles** (Step 2 cache)
   - Scoring results to avoid re-scoring
   - One row per article (unique on article_id)
   - Columns: bd_impact_score, confidence, company, country, etc.

4. **opportunity_packs** (Step 3 output)
   - Final intelligence packs saved by user
   - Complete opportunity analysis
   - Columns: why_this_is_hot, risk_factors, opportunity_score, raw_json, etc.

### Automatically Indexed On

- `batch_id` - for filtering by collection run
- `source` - for filtering by article source (google_news, linkedin, facebook)
- `keyword` - for keyword searches
- `bd_impact_score` - for scoring filters
- `confidence` - for confidence level filters
- `article_id` - for deduplication

### All RLS Policies

Every table has permissive row-level security:
- ✅ SELECT (anyone can read)
- ✅ INSERT (anyone can write)
- ✅ UPDATE (anyone can modify)
- ✅ DELETE (anyone can remove)

Perfect for internal tools. For production, restrict with authenticated users.

---

## 🔑 Required Credentials

After setup, your `.env` file should contain:

```env
# New Supabase Project URLs & Keys
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
SUPABASE_SERVICE_ROLE_KEY="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."

# Optional: Cookie paths for LinkedIn/Facebook
FACEBOOK_COOKIES_PATH="facebook-cookies.json"
LINKEDIN_COOKIES_PATH="linkedin-cookies.json"

# Optional: Server port
SOCIAL_MEDIA_SERVER_PORT=3001
```

### ⚠️ Security Notes

- **Publishable Key** - Public, safe to commit
- **Service Role Key** - SECRET, never commit! Store in:
  - `.env.local` (git-ignored)
  - CI/CD secrets
  - Environment variables
  - Server-only files

---

## 🎯 Post-Setup Steps

### 1. Deploy Edge Functions

```bash
# Authenticate with Supabase
supabase login

# Link to your new project
supabase link --project-ref YOUR_PROJECT_ID

# Deploy functions
npx supabase functions deploy
```

This deploys:
- `collect-news` - Google News API integration
- `score-articles` - AI scoring with Claude API
- `deep-dive` - Deep intelligence analysis
- `send-partner-email` - Email notifications

### 2. Configure Environment

Update `.env` with:
- New Supabase URL
- New API keys
- AI model provider keys (Anthropic, etc.)
- Optional: LinkedIn/Facebook credentials

### 3. Restart Development Server

```bash
npm run dev
```

### 4. Test Collection

1. Open Step 1 (News Collection)
2. Select data sources (Google News, LinkedIn, Facebook)
3. Use default keywords or add custom ones
4. Click "Collect Latest News"
5. Verify articles appear in the pipeline

### 5. Verify Database

In Supabase Dashboard → Table Editor:
- Confirm all 4 tables have data
- Check `collected_articles` for your articles
- Verify `collection_runs` has a record for your collection job

---

## 🐛 Troubleshooting

### "Connection refused" / "Invalid credentials"

1. Double-check the Supabase URL (should be `https://xxxx.supabase.co`)
2. Verify you're using the **Service Role Key** (not the anon key)
3. Wait 2-3 minutes for the project to fully initialize
4. Try refreshing the Supabase dashboard

### "RLS policy violation" on inserts

This means you're using the wrong key or the policies aren't set up. Solutions:
1. Ensure `.env` has `SUPABASE_SERVICE_ROLE_KEY` set (for server-side)
2. Restart the app: `npm run dev`
3. If in browser: use the publishable key (RLS policies are public)

### No articles after collection

1. Try more specific keywords
2. Increase the date range (14 or 30 days)
3. Check Google News is accessible (test at https://news.google.com)
4. For social media: refresh cookies (`npm run linkedin:login`)
5. Check server logs for errors

### Edge Functions won't deploy

```bash
# Check login status
supabase projects list

# Verify functions exist
supabase functions list

# Deploy with verbose output
supabase functions deploy --debug
```

---

## 📊 Database Schema Diagram

```
collected_articles (raw data from Step 1)
  ├── batch_id → collection_runs.id
  ├── source: 'google_news' | 'linkedin' | 'facebook'
  └── {article details}

collection_runs (job metadata)
  ├── id (batch_id)
  └── {collection job details}

scored_articles (processed in Step 2)
  ├── article_id → collected_articles.id
  ├── batch_id → collection_runs.id
  └── {scoring results}

opportunity_packs (final output from Step 3)
  ├── article_url → collected_articles.url
  └── {opportunity details}
```

---

## 🔄 Migrating Existing Data

To preserve data from your old Supabase project:

### Export from Old Project

```bash
# Using Supabase CLI
supabase db dump --db-url "postgresql://..." > backup.sql

# Or via Supabase dashboard:
# Table Editor → Select table → Click menu → Export as CSV
```

### Import to New Project

```bash
# Via SQL
psql postgresql://[USER]@[HOST]/postgres < backup.sql

# Or via Supabase UI:
# Table Editor → Click table name → Insert new row → Bulk insert CSV
```

---

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] New Supabase project created
- [ ] Service role key obtained
- [ ] `scripts/replicate-schema.sql` executed in SQL Editor
- [ ] All 4 tables visible in Supabase Table Editor
- [ ] Table Editor shows columns and data
- [ ] `.env` file updated with new credentials
- [ ] `npm run dev` starts without errors
- [ ] Step 1 collection works (articles appear in table)
- [ ] `collected_articles` table has > 0 rows after collection
- [ ] Edge Functions deployed: `supabase functions list`

---

## 📚 File Reference

### scripts/replicate-schema.sql
Complete SQL migration. Creates:
- 4 tables with primary keys, indexes
- RLS policies for each table
- Proper data types (TEXT, UUID, TIMESTAMPTZ, etc.)
- Comments explaining each section

Can be executed:
- In Supabase SQL Editor (copy/paste)
- Via CLI: `psql ... < replicate-schema.sql`
- Via the setup script (automatic)

### scripts/setup-new-supabase-project.ts
Interactive TypeScript setup script. Features:
- Prompts for Supabase credentials
- Tests database connection
- Executes schema via API or guides manual execution
- Updates `.env` file with credentials
- Shows next steps

Run: `npx tsx scripts/setup-new-supabase-project.ts`

### scripts/setup-new-project.sh
Shell wrapper for the TypeScript script. Simple:
- Checks prerequisites (npx, files)
- Runs the TypeScript setup
- Provides friendly prompts and colors
- Shows next steps

Run: `bash scripts/setup-new-project.sh`

### SETUP_NEW_PROJECT.md
Comprehensive 500+ line guide with:
- Step-by-step instructions for 3 methods
- Security best practices
- Environment configuration
- Testing procedures
- Troubleshooting guide
- Data migration instructions
- Verification checklist

---

## 🎓 Learning Resources

- [Supabase Docs](https://supabase.com/docs)
- [Row-Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase CLI Reference](https://supabase.com/docs/guides/cli)
- [PostgreSQL Basics](https://www.postgresql.org/docs/current/tutorial.html)

---

## 💡 Tips & Best Practices

1. **Backup before migration**: Export existing data before setting up new project
2. **Use separate projects**: Dev/staging/production
3. **Rotate API keys regularly**: Every 90 days
4. **Monitor functions**: Check logs in Supabase dashboard
5. **Test in dev first**: Before deploying to production
6. **Document customizations**: Any changes to Edge Functions
7. **Version control**: Keep `.env.local` out of git

---

## 📞 Support

If you encounter issues:

1. Check **SETUP_NEW_PROJECT.md** for detailed troubleshooting
2. Review Supabase dashboard logs: **Functions → View logs**
3. Test manually: Run `supabase functions invoke collect-news`
4. Check `.env` file is correct: Compare with `.env.example`
5. Verify Supabase project initialization complete (2-3 min)

---

## ✨ You're All Set!

Your new Supabase project is ready for BD Pulse.

Next: Read **SETUP_NEW_PROJECT.md** for detailed instructions and start collecting! 🚀

