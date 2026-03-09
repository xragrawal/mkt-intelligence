# Setting Up BD Pulse in a New Supabase Project

This guide helps you replicate the entire database schema and configuration to a new Supabase project.

## 📋 Overview

BD Pulse uses 4 main tables:
1. **collected_articles** - Articles from Google News, LinkedIn, and Facebook
2. **collection_runs** - Metadata about collection jobs
3. **scored_articles** - Scoring cache from Step 2
4. **opportunity_packs** - Intelligence packs from Step 3

All tables have RLS (Row Level Security) enabled with permissive policies for public access.

---

## 🚀 Quick Start (Recommended)

### Step 1: Prepare your new Supabase project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Create a new project or select an existing one
3. Wait for the project to initialize
4. Go to **Settings → API**
5. Copy these values:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **Service Role Key** (under "Service Role" section - NOT the anon key)

### Step 2: Run the setup script

```bash
npx tsx scripts/setup-new-supabase-project.ts
```

Follow the prompts to:
- Enter your new Supabase URL and Service Role Key
- Choose whether to execute schema automatically or manually
- Optionally update your `.env` file

### Step 3: Deploy Edge Functions

```bash
npx supabase functions deploy
```

This deploys the following functions to your new project:
- `collect-news` - Google News collection
- `score-articles` - Article scoring
- `deep-dive` - Deep-dive analysis
- `send-partner-email` - Email sending

### Step 4: Restart the development server

```bash
npm run dev
```

---

## 📝 Manual SQL Execution (If automatic script fails)

If you prefer to execute the schema manually or the script doesn't work:

### Method 1: Supabase SQL Editor (Easiest)

1. Go to your Supabase project → **SQL Editor**
2. Click **"New query"**
3. Copy the entire contents of `scripts/replicate-schema.sql`
4. Paste into the SQL Editor
5. Click **"Run"** button

### Method 2: Supabase CLI

```bash
# Login to Supabase
supabase login

# Link to your new project
supabase link --project-ref=YOUR_PROJECT_ID

# Execute the migration
psql postgresql://postgres:[PASSWORD]@[HOST]/postgres < scripts/replicate-schema.sql
```

---

## 🔑 Environment Configuration

After setup, update your `.env` file with credentials from the new Supabase project:

```env
# Supabase Project
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJ..."  # anon key (for client)
SUPABASE_SERVICE_ROLE_KEY="eyJ..."       # service role key (for server - keep secret!)

# Social Media Server
FACEBOOK_COOKIES_PATH="facebook-cookies.json"
LINKEDIN_COOKIES_PATH="linkedin-cookies.json"

# Optional: Local server ports
SOCIAL_MEDIA_SERVER_PORT=3001
```

### ⚠️ Important Security Notes

- **VITE_SUPABASE_PUBLISHABLE_KEY**: Public key, safe in `.env` and browser
- **SUPABASE_SERVICE_ROLE_KEY**: Secret key, NEVER commit to git, keep in `.env.local` or server environment
- Add `.env.local` to `.gitignore` if it contains the service role key
- Rotate keys regularly in Supabase dashboard

---

## 🧪 Testing the Setup

### 1. Test database connection

```bash
# This will verify the tables exist
npm run dev
```

Then in the UI:
- Go to Step 1 → select a data source (Google News)
- Click "Collect Latest News" with default keywords
- Check the browser console for any errors

### 2. Test with LinkedIn/Facebook (optional)

First, log in to capture cookies:

```bash
# LinkedIn
npm run linkedin:login

# Facebook
npm run facebook:login
```

Then test collection with LinkedIn/Facebook sources selected.

### 3. Check data in Supabase

1. Go to **Table Editor** in Supabase dashboard
2. Verify these tables exist and have data:
   - `collected_articles`
   - `collection_runs`
   - `scored_articles`
   - `opportunity_packs`

---

## 📦 What Gets Created

### Tables

| Table | Purpose | Rows |
|-------|---------|------|
| `collected_articles` | Raw articles from all sources | ~50 per collection run |
| `collection_runs` | Collection job metadata | 1 per run |
| `scored_articles` | Cached scoring results | Same as collected_articles |
| `opportunity_packs` | Final intelligence output | User-created from Step 3 |

### Indexes

Automatically created for query performance on:
- `batch_id` (collection runs)
- `source` (article source type)
- `keyword` (search keywords)
- `bd_impact_score` (scoring filter)
- `confidence` (confidence level)

### RLS Policies

All tables have permissive policies:
- ✅ Anyone can SELECT (read)
- ✅ Anyone can INSERT (write)
- ✅ Anyone can UPDATE (modify)
- ✅ Anyone can DELETE (remove)

This is suitable for internal tools. For production, restrict with authenticated users.

---

## 🔄 Migrating Existing Data

If you want to preserve data from your old Supabase project:

### Export data from old project

```bash
# Export collected_articles
supabase db dump --db-url "postgresql://..." > collected_articles.sql

# Or use Supabase dashboard:
# Table Editor → Select table → Export as CSV
```

### Import to new project

```bash
# Method 1: Using SQL
psql postgresql://[USER]@[HOST]/postgres < collected_articles.sql

# Method 2: Using Supabase UI
# Go to Table Editor → collected_articles → Insert new row → Bulk insert CSV
```

---

## 🐛 Troubleshooting

### Connection refused

**Problem**: Can't connect to Supabase
```
Error: Connection refused
```

**Solution**:
1. Verify the Supabase URL is correct (no trailing slash)
2. Check that the service role key is valid (not the anon key)
3. Ensure the project has finished initializing (wait 2-3 min)

### RLS policy violation

**Problem**: Getting RLS policy errors
```
Error: new row violates row-level security policy
```

**Solution**:
- Ensure you're using the **service role key** for server-side operations
- The `.env` file should have `SUPABASE_SERVICE_ROLE_KEY` set
- Restart the server: `npm run dev`

### Edge Functions not deploying

**Problem**: Functions fail to deploy
```
Error: Function deployment failed
```

**Solution**:
1. Ensure you're logged in: `supabase login`
2. Link the correct project: `supabase link`
3. Check function syntax: `supabase functions list`
4. Deploy with verbose output: `supabase functions deploy --debug`

### No articles collected

**Problem**: Step 1 returns 0 articles
```
No articles passed the pipeline. Try different keywords or a wider date range.
```

**Solution**:
1. Try different keywords (more specific)
2. Increase date range in Step 1 (14 or 30 days)
3. Check if Google News API is responsive: test in browser `https://news.google.com`
4. For LinkedIn/Facebook: ensure cookies are fresh (`npm run linkedin:login`)

---

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase CLI Reference](https://supabase.com/docs/guides/cli)
- [BD Pulse GitHub](https://github.com/flytbase/bd-pulse-leadgen)

---

## 🎯 Next Steps

After setup:

1. **Customize keywords**: Edit `src/lib/types.ts` → `DEFAULT_KEYWORDS`
2. **Adjust scoring rules**: Edit `supabase/functions/score-articles/index.ts`
3. **Configure regions**: Edit `src/lib/types.ts` → `CONTINENT_COUNTRY_MAP`
4. **Set up monitoring**: Use Supabase dashboard → Logs to monitor Edge Functions

---

## ✅ Verification Checklist

- [ ] New Supabase project created
- [ ] Service role key copied
- [ ] `replicate-schema.sql` executed
- [ ] All 4 tables visible in Table Editor
- [ ] Edge Functions deployed
- [ ] `.env` file updated with new credentials
- [ ] Dev server started: `npm run dev`
- [ ] Step 1 collection tested
- [ ] Data appears in `collected_articles` table

---

**Questions?** Check the Supabase docs or revisit this guide.

Good luck! 🚀
