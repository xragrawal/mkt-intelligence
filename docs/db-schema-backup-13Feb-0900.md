# Database Schema Backup
**Project:** `zdnzgaoeniznnopikndg` (bd-pulse-leadgen)  
**Backed up:** 2026-03-13  
**Purpose:** Restore reference if rolling back to pre-enrichment state.

---

## How to Restore

If you need to recreate any missing tables or columns in Supabase after a rollback, run the SQL statements in the **Restore SQL** section of each table below in the Supabase SQL Editor:  
`https://supabase.com/dashboard/project/zdnzgaoeniznnopikndg/sql`

To **reset all data** (without dropping tables), run:
```sql
TRUNCATE TABLE
  collected_articles,
  scored_articles,
  opportunity_packs,
  pending_email_approvals
RESTART IDENTITY CASCADE;
```

---

## Tables

### 1. `collected_articles`
Raw articles collected from Google News / LinkedIn per collection run.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` | NOT NULL | Primary key |
| `batch_id` | `text` | NOT NULL | FK to collection_runs |
| `keyword` | `text` | NOT NULL | Search keyword used |
| `title` | `text` | NOT NULL | Article title |
| `url` | `text` | NOT NULL | Article URL (unique per batch) |
| `snippet` | `text` | NULL | Short excerpt |
| `source` | `text` | NOT NULL | `google_news`, `linkedin`, etc. |
| `publishing_agency` | `text` | NULL | News outlet / publisher |
| `published_at` | `timestamptz` | NULL | Article publication date |
| `original_batch_id` | `uuid` | NULL | Set if article was re-associated from a prior batch |
| `created_at` | `timestamptz` | NOT NULL | Auto-set on insert |

**Restore SQL:**
```sql
CREATE TABLE IF NOT EXISTS collected_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL,
  keyword text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  snippet text,
  source text NOT NULL DEFAULT 'google_news',
  publishing_agency text,
  published_at timestamptz,
  original_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

### 2. `collection_runs`
Metadata for each batch of article collection.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` | NOT NULL | Primary key |
| `keywords` | `text[]` | NOT NULL | Search keywords used |
| `regions` | `text[]` | NOT NULL | Regions / editions searched |
| `status` | `text` | NOT NULL | `running`, `completed`, `failed` |
| `articles_collected` | `integer` | NOT NULL | Total fetched from API |
| `articles_stored` | `integer` | NOT NULL | Actually stored to DB |
| `started_at` | `timestamptz` | NOT NULL | Auto-set |
| `completed_at` | `timestamptz` | NULL | Set when done |
| `last_published_at` | `timestamptz` | NULL | Latest article date in batch |

**Restore SQL:**
```sql
CREATE TABLE IF NOT EXISTS collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keywords text[] NOT NULL,
  regions text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'running',
  articles_collected integer NOT NULL DEFAULT 0,
  articles_stored integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_published_at timestamptz
);
```

---

### 3. `scored_articles`
AI-scored articles from Step 2 — signal scoring / BD intelligence extraction.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` | NOT NULL | Primary key |
| `article_id` | `text` | NOT NULL | FK to collected_articles.id |
| `batch_id` | `text` | NOT NULL | FK to collection_runs.id |
| `is_relevant` | `boolean` | NOT NULL | Whether article passed scoring |
| `use_case_category` | `text` | NULL | e.g. "Inspection", "Delivery" |
| `buying_intent_type` | `text` | NULL | Signal type enum |
| `buying_intent_score` | `integer` | NULL | 0-100 |
| `bd_impact_score` | `integer` | NULL | 0-100 |
| `lead_clarity_score` | `integer` | NULL | 0-100 |
| `source_quality_score` | `integer` | NULL | 0-100 |
| `company` | `text` | NULL | Main company in article |
| `partner_or_si` | `text` | NULL | SI/Partner mentioned |
| `country` | `text` | NULL | Country of operation |
| `city` | `text` | NULL | City |
| `units_mentioned` | `integer` | NULL | Drone units mentioned |
| `deal_value` | `text` | NULL | Deal value if mentioned |
| `involved_parties` | `text[]` | NULL | All orgs mentioned |
| `poc_name` | `text` | NULL | Person of contact |
| `emails_mentioned` | `text[]` | NULL | Emails found in article |
| `phones_mentioned` | `text[]` | NULL | Phone numbers found |
| `author_social_handle` | `text` | NULL | Author's LinkedIn/Twitter |
| `why_it_matters` | `text` | NULL | AI summary |
| `drop_reason` | `text` | NULL | Reason if not relevant |
| `confidence` | `text` | NULL | `HIGH`, `MEDIUM`, `LOW` |
| `source` | `text` | NULL | Article source |
| `created_at` | `timestamptz` | NOT NULL | Auto-set |

**Restore SQL:**
```sql
CREATE TABLE IF NOT EXISTS scored_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id text NOT NULL,
  batch_id text NOT NULL,
  is_relevant boolean NOT NULL DEFAULT false,
  use_case_category text,
  buying_intent_type text,
  buying_intent_score integer,
  bd_impact_score integer,
  lead_clarity_score integer,
  source_quality_score integer,
  company text,
  partner_or_si text,
  country text,
  city text,
  units_mentioned integer,
  deal_value text,
  involved_parties text[],
  poc_name text,
  emails_mentioned text[],
  phones_mentioned text[],
  author_social_handle text,
  why_it_matters text,
  drop_reason text,
  confidence text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

### 4. `opportunity_packs`
Step 3 enriched analysis results (deep-dive AI output per article).

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` | NOT NULL | Primary key |
| `article_url` | `text` | NOT NULL | Source article |
| `article_title` | `text` | NOT NULL | Article headline |
| `article_source` | `text` | NULL | `google_news`, `linkedin`, etc. |
| `batch_id` | `uuid` | NULL | Collection run that triggered this |
| `batch_region` | `text` | NULL | Region of the collection batch |
| `collection_ran_at` | `timestamptz` | NULL | When batch ran |
| `keywords` | `text[]` | NULL | Keywords that surfaced this |
| `filter_days` | `integer` | NULL | Day window used in collection |
| `is_re_associated` | `boolean` | NULL | Article re-linked from old batch |
| `re_associated_from_batch_id` | `uuid` | NULL | Original batch before re-association |
| `company_name` | `text` | NULL | Primary company |
| `inferred_industry` | `text` | NULL | e.g. "Public Safety" |
| `deployment_region` | `text` | NULL | Geographic region |
| `likely_buyer_type` | `text` | NULL | e.g. "Government", "Enterprise" |
| `maturity_signal` | `text` | NULL | `EARLY`, `SCALING`, `ENTERPRISE_GRADE` |
| `event_type` | `text` | NULL | Deployment signal type |
| `scale_description` | `text` | NULL | Scale of operation |
| `urgency_level` | `text` | NULL | `LOW`, `MEDIUM`, `HIGH` |
| `expansion_likelihood` | `text` | NULL | `LOW`, `MEDIUM`, `HIGH` |
| `opportunity_score` | `integer` | NULL | 0-100 BD score |
| `why_this_is_hot` | `text` | NULL | AI narrative |
| `strategic_entry_point` | `text` | NULL | Suggested BD approach |
| `partnership_angle` | `text` | NULL | Partnership opportunity |
| `risk_factors` | `text` | NULL | Risk summary |
| `crm_ready_notes` | `text` | NULL | CRM copy |
| `notes` | `text` | NULL | Manual notes |
| `status` | `text` | NOT NULL | `open`, `shared_with_partners`, `acted_internally`, `closed`, `archived`, `duplicate`, `deleted` |
| `status_history` | `jsonb` | NULL | Array of `{status, changed_at, note}` |
| `status_updated_at` | `timestamptz` | NULL | Last status change |
| `matched_partner_name` | `text` | NULL | Assigned BD contact name |
| `matched_partner_email` | `text` | NULL | Assigned BD contact email |
| `poc_name` | `text` | NULL | Person of contact from article |
| `phones_mentioned` | `text[]` | NULL | Phone numbers |
| `author_social_handle` | `text` | NULL | Author social |
| `use_case_category` | `text` | NULL | Use case tag |
| `flytbase_mentioned` | `boolean` | NULL | Was Flytbase named in article |
| `normalized_article_url` | `text` | NULL | Canonicalized URL for dedup |
| `normalized_article_title` | `text` | NULL | Canonicalized title for dedup |
| `added_to_queue_at` | `timestamptz` | NULL | When first queued |
| `last_analyzed_at` | `timestamptz` | NULL | When last deep-dived |
| `raw_json` | `jsonb` | NULL | Full AI output blob |
| `enriched_contacts` | `jsonb` | NULL | Array of EnrichedContact objects from enrich agent |
| `created_at` | `timestamptz` | NOT NULL | Auto-set |

**Restore SQL:**
```sql
CREATE TABLE IF NOT EXISTS opportunity_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_url text NOT NULL,
  article_title text NOT NULL,
  article_source text,
  batch_id uuid,
  batch_region text,
  collection_ran_at timestamptz,
  keywords text[],
  filter_days integer,
  is_re_associated boolean DEFAULT false,
  re_associated_from_batch_id uuid,
  company_name text,
  inferred_industry text,
  deployment_region text,
  likely_buyer_type text,
  maturity_signal text,
  event_type text,
  scale_description text,
  urgency_level text,
  expansion_likelihood text,
  opportunity_score integer,
  why_this_is_hot text,
  strategic_entry_point text,
  partnership_angle text,
  risk_factors text,
  crm_ready_notes text,
  notes text,
  status text NOT NULL DEFAULT 'open',
  status_history jsonb,
  status_updated_at timestamptz,
  matched_partner_name text,
  matched_partner_email text,
  poc_name text,
  phones_mentioned text[],
  author_social_handle text,
  use_case_category text,
  flytbase_mentioned boolean,
  normalized_article_url text,
  normalized_article_title text,
  added_to_queue_at timestamptz,
  last_analyzed_at timestamptz,
  raw_json jsonb,
  enriched_contacts jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

> [!NOTE]
> The `enriched_contacts` column was added as part of the enrichment feature. If rolling back pre-enrichment, you can leave this column empty — it won't break anything. Alternatively, drop it with:
> ```sql
> ALTER TABLE opportunity_packs DROP COLUMN IF EXISTS enriched_contacts;
> ```

---

### 5. `flytbase_partners`
Reference table of Flytbase BD/sales contacts.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` | NOT NULL | Primary key |
| `name` | `text` | NOT NULL | Partner name |
| `email` | `text` | NOT NULL | Contact email |
| `region` | `text` | NOT NULL | Geographic region |
| `created_at` | `timestamptz` | NOT NULL | Auto-set |

**Restore SQL:**
```sql
CREATE TABLE IF NOT EXISTS flytbase_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  region text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

### 6. `market_trends`
Manually tagged market trend entries (legacy / reference).

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` | NOT NULL | Primary key |
| `article_id` | `text` | NOT NULL | FK to collected_articles |
| `article_title` | `text` | NOT NULL | |
| `article_url` | `text` | NOT NULL | |
| `batch_id` | `text` | NOT NULL | |
| `use_case_category` | `text` | NOT NULL | |
| `buying_intent_type` | `text` | NULL | |
| `bd_impact_score` | `integer` | NULL | |
| `company` | `text` | NULL | |
| `country` | `text` | NULL | |
| `why_it_matters` | `text` | NULL | |
| `notes` | `text` | NULL | |
| `flytbase_mentioned` | `boolean` | NULL | |
| `tagged_by` | `text` | NULL | |
| `tagged_at` | `timestamptz` | NULL | |

**Restore SQL:**
```sql
CREATE TABLE IF NOT EXISTS market_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id text NOT NULL,
  article_title text NOT NULL,
  article_url text NOT NULL,
  batch_id text NOT NULL,
  use_case_category text NOT NULL,
  buying_intent_type text,
  bd_impact_score integer,
  company text,
  country text,
  why_it_matters text,
  notes text,
  flytbase_mentioned boolean,
  tagged_by text,
  tagged_at timestamptz
);
```

---

## `enriched_contacts` JSON Schema

The `enriched_contacts` column in `opportunity_packs` stores an array of objects with the following structure:

```json
[
  {
    "personName": "string | null",
    "title": "string | null",
    "company": "string",
    "companyWebsite": "string | null",
    "companyDomain": "string | null",
    "linkedinUrl": "string | null",
    "country": "string | null",
    "email": "string | null",
    "emailConfidence": "Verified | Estimated | Not Found",
    "hunterVerified": "boolean | null",
    "source": "article | apollo",
    "leadType": "Deployment Lead | Technology Partner | Potential Customer | Government / Regulator | Informational / Low Priority",
    "leadPriority": "High | Medium | Low",
    "notes": "string | null"
  }
]
```

---

## Supabase Dashboard Links

- **Tables:** https://supabase.com/dashboard/project/zdnzgaoeniznnopikndg/editor
- **SQL Editor:** https://supabase.com/dashboard/project/zdnzgaoeniznnopikndg/sql
- **Edge Functions:** https://supabase.com/dashboard/project/zdnzgaoeniznnopikndg/functions
- **Secrets/Env Vars:** https://supabase.com/dashboard/project/zdnzgaoeniznnopikndg/settings/vault
