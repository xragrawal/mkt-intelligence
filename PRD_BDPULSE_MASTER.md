# BD Pulse LeadGen — Master Product Requirements Document

**Version**: 2.0
**Date**: 2026-03-11
**Status**: Living Document
**Owner**: FlytBase Growth / BD Team

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Problem Statement](#2-problem-statement)
3. [Target Users](#3-target-users)
4. [Product Vision — Full 4-Step Pipeline](#4-product-vision--full-4-step-pipeline)
5. [Step 1 — Signal Collection](#5-step-1--signal-collection)
6. [Step 2 — AI Scoring & Noise Filtering](#6-step-2--ai-scoring--noise-filtering)
7. [Step 3 — Deep Dive & Action Queue](#7-step-3--deep-dive--action-queue)
8. [Step 4 — Enrichment, Email & CRM (Planned)](#8-step-4--enrichment-email--crm-planned)
9. [Deduplication Architecture](#9-deduplication-architecture)
10. [Data Model](#10-data-model)
11. [AI Prompts & Tool Schemas](#11-ai-prompts--tool-schemas)
12. [LLM Provider Strategy](#12-llm-provider-strategy)
13. [Technical Architecture](#13-technical-architecture)
14. [Non-Functional Requirements](#14-non-functional-requirements)
15. [Key Constants & Configuration](#15-key-constants--configuration)
16. [Roadmap & Priorities](#16-roadmap--priorities)

---

## 1. Product Overview

**BD Pulse LeadGen** is an AI-powered market intelligence and lead generation tool built for FlytBase's Business Development team. It continuously monitors public signals (news articles, LinkedIn posts, Facebook posts) to surface high-quality commercial opportunities where FlytBase's drone automation software is a strong fit.

The tool automates the entire pipeline from raw signal collection to CRM-ready prospecting — reducing manual research effort and ensuring the BD team contacts the right companies at the right time without duplicate outreach.

### Core Value Proposition

- **For BD/Sales**: Surfaces high-signal buying intent before competitors do
- **For Operations**: Eliminates noise, duplicate articles, and redundant outreach
- **For Management**: Provides a trackable pipeline from article to contacted prospect

---

## 2. Problem Statement

### Current Manual Approach Pain Points

1. **Manual Google Alerts / RSS monitoring** — time-consuming, low signal-to-noise ratio
2. **No structured scoring** — analysts read every article without consistent evaluation criteria
3. **No deduplication** — same news story appearing across 5 sources gets reviewed 5 times
4. **No contact enrichment** — finding POC emails requires separate manual research
5. **No outreach tracking** — no systematic way to know if a company has already been contacted
6. **Duplicate emails** — without a shared log, multiple team members may email the same prospect
7. **No CRM integration** — prospect intelligence lives in Slack/spreadsheets, not accessible during sales calls

### The Gap This Product Fills

```
Raw Internet Signals
    ↓ (currently: manual browsing)
High-Signal BD Opportunities
    ↓ (currently: ad-hoc judgment)
Enriched Contact Information
    ↓ (currently: manual email drafting)
Personalized Outreach
    ↓ (currently: no tracking)
CRM Record + Tracked Contact History
```

---

## 3. Target Users

### Primary: FlytBase BD Analysts
- Run weekly/bi-weekly signal collection runs
- Review scored articles, action high-priority opportunities
- Send outreach emails to prospects and partners

### Secondary: FlytBase Sales Team
- Consume CRM-ready notes from the pipeline
- Use enriched contact data for follow-up calls
- Need dedup protection to avoid stepping on each other's outreach

### Tertiary: FlytBase Management
- Monitor which verticals/regions are generating the most signals
- Track pipeline conversion (signal → contacted → response → deal)

---

## 4. Product Vision — Full 4-Step Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1 — SIGNAL COLLECTION                                 │
│  Input: Keywords, Sources, Date Range, Regions              │
│  Output: Raw articles/posts stored in DB                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│  STEP 2 — AI SCORING & NOISE FILTERING                      │
│  Input: Raw articles from Step 1                            │
│  Output: Scored articles with relevance, company, POC data  │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│  STEP 3 — DEEP DIVE & ACTION QUEUE                          │
│  Input: High-score articles selected by user                │
│  Output: Full Opportunity Intelligence Pack per article     │
│  Actions: Delete, Mark Duplicate, Snooze, Move to Step 4    │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│  STEP 4 — ENRICHMENT, EMAIL & CRM  [PLANNED]               │
│  Input: Opportunity packs approved in Step 3                │
│  Actions:                                                   │
│    • Enrich contact data (email, LinkedIn, phone)           │
│    • Auto-generate personalized outreach email              │
│    • User reviews + sends email                             │
│    • Track contact history (who, when, which article)       │
│    • Push record to CRM (HubSpot/Salesforce)                │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Article progresses forward, never backward** — once in Step 3, it stays there
2. **No duplicate queue entries** — same article can never have two active Step 3 cards
3. **No duplicate outreach** — same company/contact cannot be emailed twice without explicit override
4. **Re-surface, don't repeat** — articles not yet actioned surface again in subsequent runs; actioned articles do not
5. **Human in the loop** — AI classifies and drafts; human approves and sends

---

## 5. Step 1 — Signal Collection

### 5.1 Purpose

Fetch articles and social posts matching user-defined keywords from selected sources and date ranges. Store unique articles in the database for downstream scoring.

### 5.2 User Inputs

| Input | Type | Default | Notes |
|-------|------|---------|-------|
| Keywords | string[] | `["DJI Dock", "DJI 3"]` | Each keyword treated as a phrase (multi-word preserved) |
| Sources | enum[] | All | `google_news`, `linkedin`, `facebook` |
| Filter Days | number | 30 | Articles older than N days are dropped |
| Regions | string[] | Global | Continent or country-level filter |

### 5.3 Supported Sources

| Source | Type | Notes |
|--------|------|-------|
| Google News | RSS / Web | 20 regional editions supported |
| LinkedIn | Social Posts | Scraped via Playwright/browser automation |
| Facebook | Social Posts | Scraped via Playwright/browser automation |

### 5.4 Keyword Handling

- Multi-word keywords are treated as **exact phrases** (not split into individual words)
- Google News: wrapped in quotes `"DJI Dock"` for exact phrase search
- LinkedIn/Facebook: URL-encoded with spaces preserved
- UI hint: "Each keyword searched as phrase — enter 'DJI Dock' as one keyword, 'DJI 3' as another"

### 5.5 Google News Regions

20 editions: US, UK, Spain, Germany, France, India, Australia, Brazil, Japan, South Korea, Canada, Italy, Mexico, Saudi Arabia, UAE, Singapore, South Africa, Nigeria, Indonesia, China

### 5.6 Deduplication at Collection (Within-Batch)

Applied in sequence before storing:

1. **URL Normalization**: Strip tracking params (`utm_*`, `ref`, `fbclid`, `gclid`). Skip if normalized URL seen.
2. **Title Normalization**: Lowercase, remove non-alphanumeric chars. Skip if identical.
3. **URL Slug Match**: Extract URL pathname only. Skip if slug already seen.
4. **Agency + Timestamp**: Skip if same `publishing_agency` + `published_at` already seen.
5. **Fuzzy Title Similarity**: Extract content words (≥3 chars, exclude 44 stop words). Calculate `overlap / min(setA.size, setB.size)`. Skip if ≥ **0.8 (80%) threshold**.

### 5.7 Cross-Batch Deduplication

When articles match existing DB records (same URL or fuzzy title ≥ 0.8):

- **Do NOT insert a new DB row** (prevents DB duplicates)
- **Re-associate** the existing article to the current batch (updates `batch_id`, saves old one in `original_batch_id`)
- Re-association allows the article to flow through Step 2 scoring again
- Exception (future Gate 1): Do NOT re-associate if the article is already in `opportunity_packs` (already actioned)

### 5.8 Limits

- Max articles stored per run: **50** (after dedup + date filter)
- Excess articles are counted but not stored

### 5.9 Pipeline Metrics Returned

```
totalFetched, afterDedup, afterDateFilter, afterCap,
droppedByDedup, droppedByDateFilter, droppedByCap,
crossBatchDupes, newArticles
```

### 5.10 Collection Run Record

Stored in `collection_runs` table:
```
id (UUID), keywords[], regions[], status, started_at, completed_at,
articles_collected, articles_stored
```

### 5.11 UI: Step 1 Panel

- Source selection grid (checkbox cards with icons)
- Keyword input with phrase hint
- Region multi-select (continent → country drill-down)
- Filter days selector: 7 / 14 / 30 / 60 / 90 days
- Run button → SSE progress updates
- Summary card after completion showing pipeline breakdown metrics

---

## 6. Step 2 — AI Scoring & Noise Filtering

### 6.1 Purpose

Score all articles collected in Step 1 using AI to assign a BD relevance score, extract structured metadata (company, POC, buying intent), and filter out noise. Present relevant articles to the user for Deep Dive selection.

### 6.2 Scoring Architecture

- **Batch processing**: Up to 20 articles sent to LLM in a single call
- **Streaming**: Results streamed back via SSE as each batch completes
- **Caching**: Results cached in `scored_articles` table; repeated runs return cache (no LLM cost)
- **Source-specific prompts**: Google News and LinkedIn use different system prompts and tool schemas (see Section 11)

### 6.3 Pre-Filter (Before LLM)

Articles with these strings in title are dropped without LLM call (cost saving):

```
"opinion:", "editorial:", "review:", "stock price", "share price",
"market cap", "analyst rating", "buy/sell", "etf", "index fund",
"podcast", "webinar replay", "infographic"
```

### 6.4 Scoring Dimensions

| Dimension | Max Score | What it measures |
|-----------|-----------|------------------|
| `buyingIntentScore` | 50 | Strength of deployment/procurement signal |
| `leadClarityScore` | 30 | How clearly the buyer/company is identifiable |
| `sourceQualityScore` | 20 | Reliability and authority of the source |
| `bdImpactScore` | 100 | Sum of all three |

### 6.5 Drop Threshold

- Default: **60 / 100**
- Configurable via `minScore` parameter
- Articles below threshold are dropped with a reason
- LLM can also explicitly drop by setting `dropReason` regardless of score

### 6.6 Metadata Extracted Per Article

| Field | Type | Description |
|-------|------|-------------|
| `company` | string | Primary buyer/deployer organization |
| `partnerOrSI` | string | System integrator or partner involved |
| `country` / `city` | string | Geographic location |
| `involvedParties` | string[] | ALL parties (buyer, vendor, agency, partner) |
| `dealValue` | string | Monetary value if mentioned (e.g. "$2.5M") |
| `pocName` | string | Key person's name + org/role |
| `emailsMentioned` | string[] | Any emails explicitly in the article text |
| `useCaseCategory` | string | Short label (e.g. "Port Security", "Pipeline Inspection") |
| `buyingIntentType` | enum | See below |
| `confidence` | HIGH/MEDIUM/LOW | LLM confidence in its own analysis |
| `whyItMatters` | string | One-sentence BD relevance explanation |

### 6.7 Buying Intent Types

```
LIVE_DEPLOYMENT | CONTRACT_AWARD | TENDER | PARTNER_ANNOUNCEMENT |
EXPANSION | FUNDING | REGULATION | OTHER
```

### 6.8 Deduplication at Scoring

LLM is instructed to: "If multiple articles cover the SAME company doing the SAME thing, give the BEST one a high score and mark duplicates with `dropReason = 'Duplicate coverage of same event'`."

LinkedIn-specific: Pre-dedup by URL canonicalization before LLM call. LLM further instructed to mark duplicates at company + project level.

### 6.9 Status Flag (Future Gate 2)

When returning scored articles, the system should check `opportunity_packs` for each article:
- If found with any status → return `alreadyInQueue: true` + `packStatus`
- Step 2 UI shows "Already in queue" badge instead of Deep Dive button
- If status = `emailed` → show "Email sent [date]"
- If status = `archived` → optionally hide from Step 2

### 6.10 UI: Step 2 Panel

**Relevant Articles Section**:
- Table view with columns: Source badge, Title, Company, Country, Signal type, Score, POC, Why it matters, Confidence
- Detail expand view with full scoring breakdown
- Select checkbox for Deep Dive
- "Already in queue" badge (future) for articles already in Step 3
- Region post-filter (client-side, no re-scoring)

**Dropped Articles Section** (collapsible):
- Shows all dropped articles with reason
- For "duplicate" drop reason: shows "— kept: [linked title]" pointing to the article that was kept
- Count badges: pre-filtered, LLM-dropped, total dropped

**Statistics Bar**:
- Total fetched / after scoring / relevant / dropped / from cache

---

## 7. Step 3 — Deep Dive & Action Queue

### 7.1 Purpose

For each article selected in Step 2, run a deep AI analysis to produce a full Opportunity Intelligence Pack. This queue is where the user triages opportunities — marking duplicates, deleting noise, and selecting articles ready for outreach.

### 7.2 Deep Dive Analysis (per article)

Input to the deep-dive edge function:
- Article title + URL + snippet
- Scoring metadata from Step 2 (company, POC, involved parties, why it matters)
- Batch context (keywords, regions, collection date)

Output — Opportunity Intelligence Pack:
- Full company profile
- Deployment signal details
- BD opportunity assessment with actionable entry points
- People of Contact (structured with name, role, org, email if available)
- Involved Parties (structured with party type, relationship)
- CRM-ready notes (5 bullet points, paste-ready)
- Opportunity score (0–100)
- FlytBase mentioned flag

### 7.3 Opportunity Score Ranges

| Range | Meaning |
|-------|---------|
| 90–100 | Active tender/contract, large scale, high urgency, named parties |
| 70–89 | Pilot with expansion signals, government-funded, mid-large scale |
| 50–69 | Single deployment, some expansion language, early-stage |
| 30–49 | Speculative signals, regulatory signal only |
| 0–29 | Generic interest, no procurement signal |
| Deduct 10–20 | If FlytBase is already mentioned (existing relationship) |

### 7.4 Maturity Signals

| Signal | Meaning |
|--------|---------|
| `EARLY` | Pilot, POC, feasibility study, first-ever deployment |
| `SCALING` | Multi-site rollout, fleet expansion, phase 2+, growing unit counts |
| `ENTERPRISE_GRADE` | Multi-year contracts, 50+ drone fleet, national programs |

### 7.5 Action Queue — Lead Statuses

| Status | Meaning | Next Step |
|--------|---------|-----------|
| `open` | In queue, not yet actioned | Review and decide |
| `shared_with_partners` | Forwarded to a FlytBase partner | Monitor for response |
| `acted_internally` | Added to internal CRM / BD pipeline | Follow up internally |
| `closed` | Opportunity closed / won | Record outcome |
| `archived` | Parked for later | Revisit in future run |
| `duplicate` | Marked as duplicate of another record | Suppress from view |
| `deleted` | Removed from queue | Hard-delete or soft-hide |

### 7.6 Duplicate Prevention in Step 3 (Gate 3 — P0)

**Rule**: One article can NEVER have more than one active `opportunity_packs` row.

Implementation:
- Before inserting: check if `article_id` (or `article_url`) already exists in `opportunity_packs`
- If found: return existing record + show toast "This article is already in your queue"
- Upsert pattern, never insert duplicate

### 7.7 Batch Grouping (Planned)

Articles in the queue grouped by which `collection_run` produced them:
- Current batch header: blue border + "New Additions" badge
- Previous batches: collapsed by default, expandable
- Each batch header shows: date, keywords, region, status counters
- "Earlier Analysis" section at bottom for records without a batch_id

### 7.8 UI: Step 3 Panel

- Batch-grouped accordion layout
- Card view per opportunity with:
  - Article title + source badge + signal type badge
  - Company, region, industry, scale
  - Opportunity score (color-coded)
  - Urgency + expansion likelihood pills
  - "Why This Is Hot" summary
  - Strategic entry point
  - People of Contact section
  - Involved Parties section
  - CRM-ready notes (copyable)
  - Action buttons: Share with Partner / Add to CRM / Archive / Delete
- Partner matching: auto-suggest FlytBase partners by region
- Batch filter + global status filter

---

## 8. Step 4 — Enrichment, Email & CRM (Planned)

### 8.1 Purpose

Transform opportunity packs into sent outreach, with full tracking to prevent duplicate contact and feed into the CRM.

### 8.2 Sub-Steps

#### 8.2.1 Contact Enrichment

Given the People of Contact extracted in Step 3 deep-dive:
- **Enrich with**: professional email (via Apollo, Hunter.io, or similar), LinkedIn profile URL, phone number, current company verification
- **Input**: name + organization from deep-dive output
- **Output**: enriched contact record with verified email
- **Fallback**: domain-pattern email guess if enrichment fails (e.g. `firstname@company.com`)

Sources to consider: Apollo.io API, Hunter.io API, Clearbit, LinkedIn Sales Navigator (manual).

#### 8.2.2 Personalized Email Generation

Auto-generate a contextual outreach email using the full opportunity pack:

**Email Generation Inputs**:
- Article title + URL
- Company profile (name, industry, deployment region, buyer type)
- Deployment signal (event type, scale, urgency)
- Why this is hot
- Strategic entry point
- Involved parties
- POC name + role

**Email Generation Prompt Guidelines**:
- Tone: Founder-level curiosity, not sales pitch
- Reference the specific article/event ("Saw that [Company] recently deployed drones at [Location]...")
- Connect to a concrete FlytBase value prop (BVLOS autonomy, dock hardware compatibility, fleet management)
- 3-5 sentences max
- Clear CTA: propose a 20-min call or ask a specific question
- Avoid: buzzwords, generic openers, asking "how are you?"
- Must include: article reference, specific deployment context, FlytBase angle, CTA

**Template Variables**:
```
{{poc_name}}, {{company_name}}, {{event_type}}, {{deployment_region}},
{{scale}}, {{use_case}}, {{why_this_is_hot}}, {{strategic_entry_point}}
```

#### 8.2.3 Email Review & Send

- User sees generated email draft
- Can edit before sending
- "Send" triggers email via configured SMTP or SendGrid/Postmark
- Status updated to `emailed` in `opportunity_packs`
- Contact record created in `contacted_companies` table

#### 8.2.4 Contact History Tracking

Critical for duplicate prevention:

**`contacted_companies` table** (new — see Section 10):
```
id, company_name, company_domain, contact_name, contact_email,
emailed_at, article_id, opportunity_pack_id, email_subject,
email_body_snippet, status (sent/bounced/replied/opted_out)
```

**Gate 4 — Pre-Send Dedup Check**:
```
On email send → extract company_domain from recipient email
→ Query contacted_companies WHERE company_domain = X
→ If found:
    Show warning: "You emailed [Company] on [date] about [article].
                   Send anyway?"
    User chooses: Proceed / Cancel
→ If not found:
    Send + log to contacted_companies
```

#### 8.2.5 CRM Integration

After email sent (or on manual trigger):

**Push to CRM Record**:
- CRM target: HubSpot (primary) or Salesforce
- Payload:
  - Company: `company_name`, `company_domain`, `deployment_region`, `inferred_industry`
  - Contact: `contact_name`, `contact_email`, `contact_role`
  - Deal/Activity: `article_url`, `event_type`, `opportunity_score`, `why_this_is_hot`, `emailed_at`
  - Notes: full `crm_ready_notes` from deep-dive
- Integration method: HubSpot API (create Company + Contact + Activity)
- Dedup: Check by company domain before creating new Company record

### 8.3 UI: Step 4 Panel

- List of opportunities approved in Step 3 (status = ready for outreach)
- Per card:
  - Company + article summary
  - Enrichment status (pending / found / not found)
  - Contact info (editable)
  - Email draft (editable rich text)
  - Send button
  - CRM push status
- Bulk actions: enrich all, send all (with confirmation)
- Contact history tab: list of all sent emails with dates, article references, statuses

---

## 9. Deduplication Architecture

### 9.1 Overview

Four independent deduplication gates operating at different layers:

```
Gate 1: collect-news      → Article-level, cross-run
Gate 2: score-articles    → Surface "already queued" in Step 2
Gate 3: deep-dive         → Hard prevent duplicate Step 3 entries
Gate 4: email send        → Company/contact-level outreach dedup
```

### 9.2 Gate 1 — Collect-News Re-association Logic

**Current behavior**: Re-associate all previously-seen articles to new batch.

**Target behavior**:
```
Article matches existing DB record?
  → YES: Is article_id in opportunity_packs?
      → YES (already actioned): Do NOT re-associate. Skip silently.
      → NO (not yet actioned): Re-associate to new batch (current behavior ✅)
  → NO (new article): Insert normally
```

**Why**: Prevents already-actioned articles from flooding Step 2 on every run.

### 9.3 Gate 2 — Score-Articles Status Enrichment

**Target behavior**: For every article being returned to Step 2, attach opportunity_pack status if one exists.

```
For each scored article:
  → Query opportunity_packs WHERE article_url = article.url
  → If found: attach { alreadyInQueue: true, packStatus: "open"|"emailed"|etc }
  → If not found: return normally
```

**UI impact**: Step 2 shows "Already in queue" badge with status, hides Deep Dive button.

### 9.4 Gate 3 — Deep-Dive Upsert (P0 — Must Have)

**Target behavior**:
```
User clicks Deep Dive on article →
  → Check opportunity_packs WHERE article_url = X (or article_id = Y)
  → If found: return existing record + toast "Already in your queue"
  → If not found: run deep-dive LLM + insert new record
```

**Implementation**: Unique constraint on `article_url` in `opportunity_packs` + upsert pattern in deep-dive function.

### 9.5 Gate 4 — Email Send Company Dedup

**Target behavior**:
```
User clicks Send Email →
  → Extract domain from recipient email address
  → Query contacted_companies WHERE company_domain = X AND status != 'bounced'
  → If match found:
      Show modal: "⚠️ You contacted [Name] at [Company] on [date]
                   regarding: [article title]. Send anyway?"
      Options: [Send Anyway] [Cancel]
  → If no match: proceed to send
```

**Note**: This is a warn-and-confirm, not a hard block — valid follow-ups or different contacts at same company should be possible.

### 9.6 Scenario Coverage Matrix

| Scenario | Gate 1 | Gate 2 | Gate 3 | Gate 4 |
|----------|--------|--------|--------|--------|
| Article fetched, not yet scored | N/A | N/A | N/A | N/A |
| Article scored, not deep-dived — re-run | ✅ Re-associate (bring forward) | ✅ Show normally | N/A | N/A |
| Article deep-dived (in Step 3, open) — re-run | 🎯 Don't re-associate | 🎯 Show "In queue" badge | 🎯 Upsert, no duplicate | N/A |
| Article deep-dived, email sent — re-run | 🎯 Don't re-associate | 🎯 Show "Email sent" badge | 🎯 Return existing record | N/A |
| Different article, same company — send email | N/A | N/A | N/A | 🎯 Warn before sending |
| Same article, LinkedIn — run twice (14-day window) | 🎯 Skip if actioned | 🎯 Badge if queued | 🎯 Upsert | 🎯 Warn |
| Article scored, dropped — re-run | Cache hit → show as dropped again (silently) | | | |

---

## 10. Data Model

### 10.1 collection_runs

```sql
id            UUID PRIMARY KEY
keywords      TEXT[]
regions       TEXT[]
status        TEXT  -- 'running' | 'completed' | 'failed'
started_at    TIMESTAMPTZ DEFAULT NOW()
completed_at  TIMESTAMPTZ
articles_collected INT
articles_stored    INT
```

### 10.2 collected_articles

```sql
id                  TEXT PRIMARY KEY  -- SHA256(normalized_title + source)
batch_id            TEXT NOT NULL     -- FK to collection_runs.id
original_batch_id   TEXT              -- preserved before re-association
keyword             TEXT
url                 TEXT
title               TEXT
snippet             TEXT
publishing_agency   TEXT
published_at        TIMESTAMPTZ
source              TEXT  -- 'google_news' | 'linkedin' | 'facebook'
created_at          TIMESTAMPTZ DEFAULT NOW()
```

### 10.3 scored_articles

```sql
id                   UUID PRIMARY KEY
article_id           TEXT  -- FK to collected_articles.id
batch_id             TEXT
is_relevant          BOOLEAN
drop_reason          TEXT
company              TEXT
partner_or_si        TEXT
country              TEXT
city                 TEXT
involved_parties     TEXT[]
deal_value           TEXT
poc_name             TEXT
emails_mentioned     TEXT[]
use_case_category    TEXT
buying_intent_type   TEXT
buying_intent_score  INT
lead_clarity_score   INT
source_quality_score INT
bd_impact_score      INT
confidence           TEXT  -- 'HIGH' | 'MEDIUM' | 'LOW'
why_it_matters       TEXT
source               TEXT  -- propagated from collected_articles
units_mentioned      INT
created_at           TIMESTAMPTZ DEFAULT NOW()
```

### 10.4 opportunity_packs

```sql
id                          UUID PRIMARY KEY
article_title               TEXT NOT NULL
article_url                 TEXT NOT NULL UNIQUE  -- Gate 3 enforcement
batch_id                    TEXT
article_source              TEXT    -- 'google_news' | 'linkedin' | 'facebook'
batch_region                TEXT
collection_ran_at           TIMESTAMPTZ
keywords                    TEXT[]
filter_days                 INT
is_re_associated            BOOLEAN DEFAULT FALSE
re_associated_from_batch_id TEXT
added_to_queue_at           TIMESTAMPTZ DEFAULT NOW()

-- Company Profile
company_name                TEXT
inferred_industry           TEXT
deployment_region           TEXT
likely_buyer_type           TEXT
maturity_signal             TEXT   -- 'EARLY' | 'SCALING' | 'ENTERPRISE_GRADE'

-- Deployment Signal
event_type                  TEXT
scale_description           TEXT
urgency_level               TEXT   -- 'LOW' | 'MEDIUM' | 'HIGH'
expansion_likelihood        TEXT   -- 'LOW' | 'MEDIUM' | 'HIGH'

-- BD Assessment
why_this_is_hot             TEXT
strategic_entry_point       TEXT
partnership_angle           TEXT
risk_factors                TEXT
opportunity_score           INT

-- CRM
crm_ready_notes             TEXT
flytbase_mentioned          BOOLEAN

-- Action Tracking
status                      TEXT DEFAULT 'open'
  -- 'open' | 'shared_with_partners' | 'acted_internally' |
  -- 'closed' | 'archived' | 'duplicate' | 'deleted'
status_updated_at           TIMESTAMPTZ
matched_partner_name        TEXT
matched_partner_email       TEXT
notes                       TEXT

-- Full LLM Output
raw_json                    JSONB  -- full deep-dive response including peopleOfContact, involvedParties

created_at                  TIMESTAMPTZ DEFAULT NOW()
```

### 10.5 market_trends

```sql
id                UUID PRIMARY KEY
article_id        TEXT
article_title     TEXT
article_url       TEXT
batch_id          TEXT
company           TEXT
country           TEXT
use_case_category TEXT NOT NULL
buying_intent_type TEXT
bd_impact_score   INT
why_it_matters    TEXT
flytbase_mentioned BOOLEAN
article_source    TEXT
tagged_by         TEXT
tagged_at         TIMESTAMPTZ
notes             TEXT
```

### 10.6 flytbase_partners

```sql
id         UUID PRIMARY KEY
name       TEXT NOT NULL
email      TEXT NOT NULL
region     TEXT NOT NULL
created_at TIMESTAMPTZ DEFAULT NOW()
```

### 10.7 contacted_companies (Planned — Step 4)

```sql
id                   UUID PRIMARY KEY
company_name         TEXT
company_domain       TEXT  -- indexed for Gate 4 dedup
contact_name         TEXT
contact_email        TEXT
contact_role         TEXT
emailed_at           TIMESTAMPTZ
article_id           TEXT   -- FK to collected_articles.id
opportunity_pack_id  UUID   -- FK to opportunity_packs.id
email_subject        TEXT
email_body_snippet   TEXT   -- first 500 chars of sent email
status               TEXT   -- 'sent' | 'bounced' | 'replied' | 'opted_out'
crm_pushed          BOOLEAN DEFAULT FALSE
crm_record_id        TEXT   -- HubSpot/Salesforce record ID
created_at           TIMESTAMPTZ DEFAULT NOW()
```

---

## 11. AI Prompts & Tool Schemas

### 11.1 Score-Articles — Google News System Prompt

```
You are a Business Development intelligence analyst for FlytBase, a drone technology company. Score news articles for commercial opportunity relevance.

CRITICAL TRANSLATION RULE:
ALL output fields MUST be in English regardless of the original article language. This applies to EVERY text field: company, partnerOrSI, country, city, involvedParties, whyItMatters, buyingIntentType — everything.

SCORING RULES:
- buyingIntentScore (0-50): How strong is the buying/deployment signal?
- leadClarityScore (0-30): How clearly can you identify the buyer/company?
- sourceQualityScore (0-20): How reliable/authoritative is the source?
- bdImpactScore = buyingIntentScore + leadClarityScore + sourceQualityScore (max 100)

Articles with bdImpactScore BELOW the provided threshold should have dropReason set.

DROP these (give low scores):
- Opinion pieces or editorials
- Generic market analysis with no identifiable company
- Product reviews/updates without deployment/contract/tender/partner action
- Stock-only or financial commentary articles

IMPORTANT DEDUP RULE:
If multiple articles cover the SAME company doing the SAME thing, give the BEST one a high score and give duplicates a dropReason of "Duplicate coverage of same event".

INVOLVED PARTIES EXTRACTION RULE:
- involvedParties MUST list ALL meaningful party names mentioned: the buyer, deployer, operator, government agency, police department, military branch, contractor, system integrator, service provider, municipality, utility company, etc.
- Be EXHAUSTIVE: if an article mentions "Bahia Civil Police", "OCA Drones", "City of Salvador" — list ALL of them.
- EXCLUDE "DJI", "Skydio", "Autel", and other drone manufacturers — unless they are the BUYER/DEPLOYER.
- EXCLUDE "FlytBase".
- Prioritize: BUYER, OPERATOR, CONTRACTOR, GOVERNMENT AGENCY, SYSTEM INTEGRATOR, SERVICE PROVIDER, RESELLER/DEALER.

POINT OF CONTACT (PoC) EXTRACTION RULE:
- pocName: Extract the name of any key person mentioned, with company/role.
- Format: "Name @ Company" or "Name, Role at Company"
- Pick the most senior/relevant decision-maker.
- Set to null if no specific person name is mentioned.

BUYING INTENT TYPES: LIVE_DEPLOYMENT, CONTRACT_AWARD, TENDER, PARTNER_ANNOUNCEMENT, EXPANSION, FUNDING, REGULATION, OTHER
CONFIDENCE: HIGH, MEDIUM, LOW

You will receive MULTIPLE articles at once. Score each independently, then deduplicate.
```

### 11.2 Score-Articles — LinkedIn System Prompt

```
You are a Business Development intelligence analyst for FlytBase, a drone technology company. Score LinkedIn posts for commercial opportunity relevance and lead strength.

CRITICAL TRANSLATION RULE:
ALL output fields MUST be in English regardless of the original post language.

SCORING RULES:
- buyingIntentScore (0-50): How strong is the buying/deployment signal?
- leadClarityScore (0-30): How clearly can you identify who to contact?
- sourceQualityScore (0-20): How credible is this signal based on poster seniority?
- bdImpactScore = sum (max 100)

PRIORITIZE posts where:
- A BUYER ORGANIZATION is clearly implied
- Describes LIVE DEPLOYMENT, RFP/tender, contract, large pilot, expansion, or partnership
- Highlights UNIQUE or STANDOUT USE CASE (unusual industry, high-stakes, at-scale)
- Posted by a clear decision-maker (Head of Security, VP Operations, Chief Drone Pilot, etc.)

TREAT AS WEAK / DROP:
- Generic thought leadership or vendor marketing with no concrete initiative
- "Cool drone video" or generic PR with no actionable organization or program
- Obvious resharing or lightweight commentary on same announcement

DEDUP STRATEGY:
- If multiple posts refer to the SAME company doing the SAME project/event, mark only the highest-signal one
- For duplicates: dropReason = "Duplicate lead for same company & project"

INPUT FORMAT:
Single JSON object with:
- source: "linkedin"
- threshold: numeric bdImpactScore threshold
- posts: array with index, authorName, authorHeadline, authorCompany, content, url, reactionsCount, commentsCount, publishedAt

MAPPING RULES (LinkedIn):
- involvedParties: single array including BOTH buyer organization and partners/SIs
- pocName: ALL key people mentioned (author + quoted stakeholders) — "Name1 @ Org1; Name2, Role at Org2"
- whyItMatters: one concise English sentence
```

### 11.3 Score-Articles — Tool Schema

```json
{
  "type": "function",
  "function": {
    "name": "score_articles_batch",
    "description": "Score multiple news articles for BD relevance in one call",
    "parameters": {
      "type": "object",
      "properties": {
        "scores": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["articleIndex", "buyingIntentType", "leadClarityScore",
                         "buyingIntentScore", "sourceQualityScore", "bdImpactScore",
                         "whyItMatters", "confidence"],
            "properties": {
              "articleIndex":        { "type": "number" },
              "dropReason":          { "type": ["string", "null"] },
              "company":             { "type": ["string", "null"] },
              "partnerOrSI":         { "type": ["string", "null"] },
              "country":             { "type": ["string", "null"] },
              "city":                { "type": ["string", "null"] },
              "unitsMentioned":      { "type": ["number", "null"] },
              "involvedParties":     { "type": "array", "items": { "type": "string" } },
              "dealValue":           { "type": ["string", "null"] },
              "pocName":             { "type": ["string", "null"] },
              "emailsMentioned":     { "type": "array", "items": { "type": "string" } },
              "useCaseCategory":     { "type": ["string", "null"] },
              "buyingIntentType":    { "type": "string",
                                       "enum": ["LIVE_DEPLOYMENT","CONTRACT_AWARD","TENDER",
                                                "PARTNER_ANNOUNCEMENT","EXPANSION","FUNDING",
                                                "REGULATION","OTHER"] },
              "leadClarityScore":    { "type": "number" },
              "buyingIntentScore":   { "type": "number" },
              "sourceQualityScore":  { "type": "number" },
              "bdImpactScore":       { "type": "number" },
              "whyItMatters":        { "type": "string" },
              "confidence":          { "type": "string", "enum": ["HIGH","MEDIUM","LOW"] }
            }
          }
        }
      },
      "required": ["scores"]
    }
  }
}
```

### 11.4 LinkedIn Scoring Tool Schema

Same structure as 11.3 but function name `score_linkedin_posts_batch`. The `involvedParties` field merges buyer + partner (no separate `company`/`partnerOrSI` fields).

### 11.5 Deep-Dive — System Prompt

```
You are a senior commercial intelligence analyst for FlytBase, a drone technology company.

Given a news article (title, source, and scanning context), produce a deep Opportunity Intelligence Pack.

GLOBAL RULES:
- Focus ONLY on actionable signals: live deployments, contract awards, tenders, scaling, partner deployments
- Ignore macro trends and generic commentary
- NO HALLUCINATION — if a value is uncertain, prefix with "Assumed:"
- Set values to null if not explicitly supported by the article
- ALL output text MUST be in English
- Output MUST include two exhaustive lists:
  - People of Contact: all people mentioned
  - Involved Parties: all companies/organizations mentioned

FIELD-LEVEL RULES:

[companyName] — Primary deploying/procuring organization (not FlytBase, not OEM)
[inferredIndustry] — Specific verticals: Security & Surveillance, Logistics & Delivery,
  Infrastructure Inspection, Agriculture, Emergency Services, Defense & Military,
  Construction, Energy & Utilities, Mining, Public Safety, Smart Cities
[deploymentRegion] — Format: "City, Country" or "Region, Country". English place names.
[likelyBuyerType] — Government Agency | Military/Defense | Enterprise (Private) | SME |
  Utility/Infrastructure Operator | Logistics Provider | Emergency Services | Academic/Research
[maturitySignal] — EARLY | SCALING | ENTERPRISE_GRADE
[eventType] — Contract Award | Tender/RFP Published | Pilot Announced | Fleet Expansion |
  Regulatory Approval | Partnership/Integration | Funding Secured | Deployment Launch | Use Case Demo
[scale] — Quantify when possible. Prefix inferred values with "Assumed:"
[urgencyLevel] — HIGH (active tender/deadline) | MEDIUM (6-12mo signal) | LOW (exploratory)
[expansionLikelihood] — HIGH | MEDIUM | LOW
[whyThisIsHot] — Start with article reference. Max 2-3 sentences. FlytBase-specific angle.
[strategicEntryPoint] — Specific, actionable. Name companies/roles where possible.
[partnershipAngle] — Is an SI/OEM/telecom already involved? Direct vs. via partner approach.
[riskFactors] — Specific risks only: incumbent lock-in, regulatory barriers, budget constraints.
[opportunityScore] — Integer 0-100 per scoring ranges in PRD.
[crmReadyNotes] — 3-5 bullet points: • [Label]: [Value]

[peopleOfContact] — ALL people mentioned:
  { name, titleOrRole, organization, email, phone, linkedinUrl, mentionContext }
  Do NOT invent contact details.

[involvedParties] — ALL companies/organizations:
  { name, partyType, countryOrRegion, relationshipToPrimaryCompany, mentionContext }
  partyType: Buyer/Operator | Vendor/OEM | System Integrator | Government/Regulator |
             Partner | Customer | Investor/Funder | Media/Publisher | Other
```

### 11.6 Deep-Dive Tool Schema

```json
{
  "type": "function",
  "function": {
    "name": "create_opportunity_pack",
    "parameters": {
      "type": "object",
      "required": ["peopleOfContact","involvedParties","companyProfile",
                   "deploymentSignal","bdOpportunityAssessment","crmReadyNotes","flytbaseMentioned"],
      "properties": {
        "peopleOfContact": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name","titleOrRole","organization","email","phone","linkedinUrl","mentionContext"],
            "properties": {
              "name":           { "type": "string" },
              "titleOrRole":    { "type": ["string","null"] },
              "organization":   { "type": ["string","null"] },
              "email":          { "type": ["string","null"] },
              "phone":          { "type": ["string","null"] },
              "linkedinUrl":    { "type": ["string","null"] },
              "mentionContext": { "type": "string" }
            }
          }
        },
        "involvedParties": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name","partyType","countryOrRegion","relationshipToPrimaryCompany","mentionContext"],
            "properties": {
              "name":                          { "type": "string" },
              "partyType":                     { "type": "string",
                                                 "enum": ["Buyer/Operator","Vendor/OEM",
                                                          "System Integrator","Government/Regulator",
                                                          "Partner","Customer","Investor/Funder",
                                                          "Media/Publisher","Other"] },
              "countryOrRegion":               { "type": ["string","null"] },
              "relationshipToPrimaryCompany":  { "type": ["string","null"] },
              "mentionContext":                 { "type": "string" }
            }
          }
        },
        "companyProfile": {
          "type": "object",
          "required": ["companyName","inferredIndustry","deploymentRegion","likelyBuyerType","maturitySignal"],
          "properties": {
            "companyName":      { "type": ["string","null"] },
            "inferredIndustry": { "type": ["string","null"] },
            "deploymentRegion": { "type": ["string","null"] },
            "likelyBuyerType":  { "type": ["string","null"] },
            "maturitySignal":   { "type": "string", "enum": ["EARLY","SCALING","ENTERPRISE_GRADE"] }
          }
        },
        "deploymentSignal": {
          "type": "object",
          "required": ["eventType","scale","urgencyLevel","expansionLikelihood"],
          "properties": {
            "eventType":             { "type": ["string","null"] },
            "scale":                 { "type": ["string","null"] },
            "urgencyLevel":          { "type": "string", "enum": ["LOW","MEDIUM","HIGH"] },
            "expansionLikelihood":   { "type": "string", "enum": ["LOW","MEDIUM","HIGH"] }
          }
        },
        "bdOpportunityAssessment": {
          "type": "object",
          "required": ["whyThisIsHot","strategicEntryPoint","partnershipAngle","riskFactors","opportunityScore"],
          "properties": {
            "whyThisIsHot":         { "type": ["string","null"] },
            "strategicEntryPoint":  { "type": ["string","null"] },
            "partnershipAngle":     { "type": ["string","null"] },
            "riskFactors":          { "type": ["string","null"] },
            "opportunityScore":     { "type": "number" }
          }
        },
        "crmReadyNotes":     { "type": "string" },
        "flytbaseMentioned": { "type": "boolean" }
      }
    }
  }
}
```

---

## 12. LLM Provider Strategy

### 12.1 Supported Providers

| Provider ID | Label | Default Model | API Key |
|-------------|-------|--------------|---------|
| `gemini_direct` | Gemini 2.5 Flash | `gemini-2.5-flash` | `GOOGLE_AI_API_KEY` |
| `claude` | Claude Sonnet 4 | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |
| `openai` | GPT-5 mini | `gpt-5-mini` | `OPENAI_API_KEY` |
| `lovable` | Lovable AI Gateway | `google/gemini-3-flash-preview` | `LOVABLE_API_KEY` |

### 12.2 Recommended Configuration

| Function | Provider | Reason |
|----------|----------|--------|
| `score-articles` | `gemini_direct` | Cheapest at scale, fast, reliable structured output |
| `deep-dive` | `claude` (Sonnet 4.6) | Highest quality reasoning for nuanced BD analysis |
| Default (env fallback) | `gemini_direct` | Cost-optimal for unknown workloads |

### 12.3 Cost Estimates (per run, ~50 articles)

| Task | Model | Input Tokens | Cost Est. |
|------|-------|-------------|-----------|
| Score 50 articles | Gemini 2.5 Flash | ~75K | ~$0.01 |
| Deep-dive 10 articles | Claude Sonnet | ~15K | ~$0.05 |
| Full pipeline (50 articles, 10 deep-dives) | Mixed | — | **~$0.06** |

### 12.4 Provider Abstraction

All LLM calls go through `supabase/functions/_shared/llm.ts` which:
- Normalizes tool schema format across providers
- Handles rate limits (429) and credit exhaustion (402) with typed errors
- Sanitizes JSON Schema for Gemini (removes `additionalProperties`, normalizes nullable types)
- Supports per-call provider override via `provider` option

---

## 13. Technical Architecture

### 13.1 Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| Backend Functions | Supabase Edge Functions (Deno) |
| Database | Supabase (PostgreSQL) |
| Realtime Updates | SSE (Server-Sent Events) |
| LLM Abstraction | Custom shared module (`_shared/llm.ts`) |
| Web Scraping | Playwright (LinkedIn/Facebook collection) |
| Package Manager | Bun |

### 13.2 Edge Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `collect-news` | HTTP POST | Fetch articles from configured sources |
| `score-articles` | HTTP POST (SSE) | Score articles with LLM, stream results |
| `deep-dive` | HTTP POST | Generate full opportunity pack per article |
| `send-partner-email` | HTTP POST | Send outreach email to a partner/prospect |

### 13.3 Frontend Pages & Components

| Page/Component | Purpose |
|----------------|---------|
| `src/pages/Index.tsx` | Main pipeline page (Steps 1–3) |
| `src/pages/Trends.tsx` | Market trends view |
| `src/components/signal/Step1Panel.tsx` | Collection UI |
| `src/components/signal/Step2Panel.tsx` | Scoring UI |
| `src/components/signal/Step3Panel.tsx` | Action queue UI |
| `src/components/signal/ArticleCard.tsx` | Article display in Step 1 |
| `src/components/signal/OpportunityCard.tsx` | Opportunity pack card in Step 3 |
| `src/lib/types.ts` | All TypeScript interfaces |
| `src/lib/llm-context.tsx` | LLM provider selector context |
| `src/integrations/supabase/types.ts` | Auto-generated DB types |

### 13.4 Data Flow

```
User Input (keywords, sources, regions, days)
    ↓
collect-news edge function
    → Fetches articles from sources
    → Deduplicates within batch (URL, title, fuzzy)
    → Cross-batch dedup against DB
    → Stores in collected_articles
    → Updates collection_runs
    ↓ (SSE stream)
Frontend Step 1 → shows pipeline metrics
    ↓
score-articles edge function (SSE stream)
    → Pre-filters by keyword list
    → Checks scored_articles cache
    → Batches uncached articles → LLM
    → Stores in scored_articles
    → Streams results to Step 2
    ↓
Frontend Step 2 → user selects articles for deep-dive
    ↓
deep-dive edge function
    → Runs full analysis per article
    → Stores in opportunity_packs
    ↓
Frontend Step 3 → user triages queue
    ↓ [planned]
Step 4: enrich → draft email → send → log → CRM push
```

### 13.5 Environment Variables

```
GOOGLE_AI_API_KEY      — Gemini Direct
ANTHROPIC_API_KEY      — Claude
OPENAI_API_KEY         — OpenAI
LOVABLE_API_KEY        — Lovable AI Gateway
LLM_PROVIDER           — Override default provider (optional)
SUPABASE_URL           — Supabase project URL
SUPABASE_SERVICE_ROLE_KEY — Supabase admin key
```

---

## 14. Non-Functional Requirements

### 14.1 Performance

- Step 1 (collection): Complete within 60 seconds for 50 articles across 3 sources
- Step 2 (scoring): First result streamed within 5 seconds; 50 articles scored within 45 seconds
- Step 3 (deep-dive): Single article analysis within 10 seconds
- UI: No loading state longer than 3 seconds without a progress indicator

### 14.2 Reliability

- LLM errors: retry once with exponential backoff; surface error to user on second failure
- Rate limits (429): surface user-friendly message: "Rate limited — try again shortly"
- Credits exhausted (402): surface message: "AI credits exhausted. Please add credits."
- DB errors: all inserts wrapped in try/catch with error logging

### 14.3 Cost Controls

- Max articles per run capped at 50
- Scoring uses cache — same articles never scored twice (LLM cost saved on re-runs)
- Pre-filter drops ~10–20% of articles before LLM (saves tokens)
- Batch scoring sends up to 20 articles per LLM call (vs. 1 per call = 20x cheaper)

### 14.4 Data Integrity

- Article IDs are deterministic (SHA256 of normalized title + source) — prevents DB duplicates
- All text output from LLM must be in English (enforced via prompt rule)
- Hallucination prevention: "Assumed:" prefix convention enforced in deep-dive prompt
- Unique constraint on `opportunity_packs.article_url` (Gate 3)

### 14.5 Accessibility & Usability

- All source badges with color coding (not color-only — includes text label)
- Relative date display for LinkedIn/Facebook posts ("2 days ago") — not parsed as absolute date
- Status changes reflected immediately in UI without page reload
- Mobile-responsive (though primary use is desktop/projected screen)
- Projector-friendly typography scaling at 1920px and 2560px breakpoints

---

## 15. Key Constants & Configuration

| Constant | Value | Location | Notes |
|----------|-------|----------|-------|
| `DEFAULT_MIN_SCORE` | 60 | score-articles | BD Impact Score threshold |
| `DEFAULT_FILTER_DAYS` | 30 | collect-news | Articles older than this dropped |
| `MAX_ARTICLES_STORED` | 50 | collect-news | Cap per collection run |
| `FUZZY_TITLE_THRESHOLD` | 0.8 | collect-news | 80% word overlap = duplicate |
| `SCORING_BATCH_SIZE` | 20 | score-articles | Articles per LLM call |
| `FILTER_DAY_OPTIONS` | 7,14,30,60,90 | types.ts | UI date range picker options |
| `DEFAULT_KEYWORDS` | ["DJI Dock","DJI 3"] | types.ts | Pre-populated on first load |
| BuyingIntent types | 8 types | types.ts | See Section 6.7 |
| LeadStatus types | 7 statuses | types.ts | See Section 7.5 |
| Opportunity score | 0–100 | deep-dive | See Section 7.3 |

---

## 16. Roadmap & Priorities

### P0 — Critical Missing (Implement First)

| Item | Section | Impact |
|------|---------|--------|
| Gate 3: Deep-dive upsert | §9.4 | Prevents duplicate Step 3 cards — risk of duplicate emails |
| Gate 2: `alreadyInQueue` flag in Step 2 | §9.3 | User trust: shows article status in Step 2 |

### P1 — High Value

| Item | Section | Impact |
|------|---------|--------|
| Gate 4: Email send company dedup warning | §9.5 | Prevents duplicate outreach |
| Step 4 design + implementation | §8 | Core missing pipeline stage |
| Batch grouping UI in Step 3 | §7.7 | Distinguishes new vs backlog items |

### P2 — Important Improvements

| Item | Section | Impact |
|------|---------|--------|
| Gate 1: Skip re-association for actioned articles | §9.2 | Reduces Step 2 noise on repeat runs |
| Contact enrichment integration (Apollo/Hunter) | §8.2.1 | Speeds up outreach |
| CRM integration (HubSpot) | §8.2.5 | Pipeline tracking |

### P3 — Future

| Item | Notes |
|------|-------|
| Suppress re-surfaced drops in Step 2 stats | Reduces noise in dropped article counts |
| Email open/reply tracking | Requires email provider webhook |
| LinkedIn outreach (direct message) | Alternative to email for LinkedIn-sourced leads |
| Automated daily/weekly runs | Cron-based collection without manual trigger |
| Multi-user / team support | Shared queue, assignment, ownership tracking |
| Analytics dashboard | Signal volume trends, conversion rates, ROI |

---

*This PRD was generated on 2026-03-11 and reflects the current state of the BD Pulse LeadGen codebase plus the envisioned Step 4 additions.*

---

## 17. Delta — Deduplication & Data Integrity Hardening (2026-03-11)

This section documents the 10 gaps identified during a systematic architecture review of the deduplication gates and the decisions/implementations that resolved each. **No existing PRD sections were modified** — this section captures the delta only.

---

### 17.1 Gap Review Summary

| Gap # | Area | Problem Identified | Decision |
|--------|------|--------------------|----------|
| 1 | Gate 1 — Re-association | "Actioned" was ambiguous; any non-open status could silently re-surface articles the user had already evaluated | Permanent suppress for all non-deleted statuses; deleted articles get a 60-day grace period then allowed fresh |
| 2 | Gate 3 — Unique Key | `article_url` UNIQUE constraint alone is too fragile; tracking pixels, UTM params, and URL variants bypass it | Dual-check: normalized URL (primary) + 80% fuzzy title similarity (secondary) |
| 3 | Domain Extraction | `extract_domain()` in score-articles relied on fragile string splitting, silently failing on malformed URLs | Replaced with `URL` constructor with `try/catch`; malformed URLs fall back gracefully |
| 4 | Cross-Card Company Visibility | User had no way to see if another card for the same company already existed in their queue | `sameCompanyMap` useMemo in Step 3; "N other cards" badge on each card with a matching company name |
| 5 | Stale Article Filter Bypass | Concern that articles older than `filterDays` could slip through via re-association path | Confirmed not a gap: `existingToReassociate` is already a subset of `toStore`, which passed the `filterDays` check upstream. No code change needed. |
| 6 | Stale Analysis — Re-analyze | Cards older than 60 days have outdated intelligence with no way to refresh | `forceRefresh` mode in deep-dive: re-runs LLM, updates the existing row, preserves status/notes/history. 60-day "Analysis outdated" amber badge in Step 3 UI. |
| 7 | Concurrent User Race Condition | Two browser tabs running the same batch could produce duplicate rows in `opportunity_packs` | Deferred to backlog — single-operator tool currently. Mitigated by Gate 3 upsert semantics. |
| 8 | Soft-Delete vs Hard-Delete | "Deleted" in Step 3 was a status flag, not a true delete — but behaviour on re-encounter was undefined | Deleted < 60 days = block re-entry (user recently rejected). Deleted > 60 days = allow fresh start (things may have changed). |
| 9 | Person vs Company Dedup | Dedup only checked article URL; the same person/company appearing across multiple articles from different URLs could produce redundant cards | Addressed at the visibility layer (Gap 4 badge). Full company-level suppression deferred — a different article from the same company may have new intelligence worth reviewing. |
| 10 | Audit Trail | No history of how a record moved through statuses (open → shared → closed). Debugging and reporting blind. | `status_history JSONB[]` column on `opportunity_packs`. Every status change appends `{ status, changed_at, note? }`. Seeded on insert. |

---

### 17.2 Gate 1 — Re-association Logic (Gap 1 + 8)

**Before:** `existingToReassociate` was re-associated unconditionally, regardless of current status in `opportunity_packs`.

**After:** Before re-associating, `collect-news` batch-queries `opportunity_packs` for all candidate article URLs and applies the following suppression rules:

```
status = open / shared_with_partners / acted_internally / closed / duplicate
  → permanently block (user has seen this, no value in re-surfacing)

status = deleted AND status_updated_at within 60 days
  → block (user recently rejected — respect that decision)

status = deleted AND status_updated_at > 60 days ago (or NULL)
  → allow re-association (fresh start — things may have changed)
```

Only articles that pass this filter (`filteredForReassociation`) proceed to re-association.

**Design principle**: As the system scales, blocking at Gate 1 prevents unnecessary LLM calls downstream and keeps the Step 2 / Step 3 queue clean.

---

### 17.3 Gate 3 — Normalized URL + Fuzzy Title (Gap 2)

**Before:** Gate 3 relied solely on `article_url TEXT UNIQUE`. A URL with UTM params, a tracking pixel, or a CDN variant would bypass the constraint and create a duplicate row.

**After:** Two-stage check on every deep-dive invocation (when `forceRefresh = false`):

1. **Normalized URL** — strip UTM params, `ref`, `fbclid`, `gclid`, trailing slashes, lowercase. Stored in `normalized_article_url` column. Exact match check.
2. **Fuzzy title similarity** — if normalized URL is not found, compute word-overlap similarity against all existing pack titles. Threshold: **80%**. Catches variant headlines of the same article.

Status-aware response on match:
- `deleted` < 60 days → `{ gateStatus: "blocked" }` — caller skips silently with toast
- `deleted` > 60 days → fall through to LLM (fresh start)
- `archived` → `{ gateStatus: "archived" }` — caller prompts user to restore before re-analyzing
- any other status → `{ gateStatus: "existing" }` — caller skips with toast

New schema columns added: `normalized_article_url TEXT`, `normalized_article_title TEXT`, `idx_opp_packs_normalized_url` index.

---

### 17.4 Refresh Analysis — forceRefresh Mode (Gap 6)

**Problem:** Intelligence in an `opportunity_pack` becomes stale over time (new information, changed company status). There was no way to re-run the deep-dive without creating a duplicate record.

**Solution:** `deep-dive` edge function accepts `forceRefresh: true` + `packId`. When set:
- Gate 3 is bypassed entirely
- LLM runs fresh against the article URL
- Existing row is **updated** (not inserted): intelligence fields overwritten, `last_analyzed_at` refreshed
- `status`, `notes`, `status_history` are **preserved** — user's actions are never lost

**UI:** Refresh button (↺) on every card in Step 3, both table and detail views. Amber "Analysis outdated" badge appears automatically when `last_analyzed_at` > 60 days ago.

New schema column: `last_analyzed_at TIMESTAMPTZ` (backfilled from `created_at`).

---

### 17.5 Same-Company Cross-Card Visibility (Gap 4)

**Problem:** A user could be looking at an opportunity card for "Acme Drones" without knowing two other cards for the same company already exist in the queue — potentially leading to duplicate outreach.

**Solution:** Client-side `sameCompanyMap` (`useMemo` in Step 3Panel) builds a `company_name → [dbId, ...]` map across all loaded results. Each card that has ≥1 other card for the same company shows a "N other cards" badge (blue, with building icon).

**Scope:** Visual indicator only. Suppression is not applied — a different article from the same company may contain genuinely new intelligence worth reviewing. Full company-level dedup is deferred to Step 4 / CRM layer.

**Edge case handled:** A company appearing in one batch with an irrelevant article (never reaches Step 3) does not trigger the badge for a later relevant article from the same company — because the map is built from `opportunity_packs` records only.

---

### 17.6 Audit Trail — Status History (Gap 10)

**Before:** Only the current `status` was stored. No way to know when a record moved from `open` → `shared_with_partners` → `closed`, or who changed it.

**After:** `status_history JSONB DEFAULT '[]'` column on `opportunity_packs`. Every status transition appends:

```json
{ "status": "shared_with_partners", "changed_at": "2026-03-11T10:23:00Z", "note": "optional" }
```

- Seeded on insert: `[{ "status": "open", "changed_at": "<insert_time>" }]`
- Backfilled for existing records: initial entry uses `created_at` as `changed_at`
- `handleStatusChange` in Step 3Panel fetches current history, appends, writes both `status` and `status_history` atomically

---

### 17.7 Batch-Grouped Action Queue (Step 3 UI)

**Problem:** Step 3 displayed all `opportunity_packs` as a single flat list ordered by `created_at DESC`. Users could not distinguish articles from the current run vs. historical backlog.

**Solution:** Batch-grouped accordion UI in Step 3Panel:

- All records loaded on mount (no filtering — nothing is hidden)
- Records grouped by `batch_id` via `useMemo` — purely a visual layer, source `results` array unchanged
- **Current batch** (matching `collectionRun.id`): blue border, "NEW ADDITIONS" amber badge, auto-expanded
- **Previous batches**: collapsed by default, sorted newest → oldest, show date / keywords / region / status pill counts
- **NULL batch_id records**: grouped under "Earlier Analysis" section, always at the bottom
- Expand/collapse per batch — independent toggles
- Status filter tabs work globally across all batch groups

New schema columns: `batch_region TEXT`, `added_to_queue_at TIMESTAMPTZ`, `is_re_associated BOOLEAN`, `re_associated_from_batch_id TEXT`.

---

### 17.8 Migrations Delivered

| File | Contents |
|------|----------|
| `supabase/migrations/20260311_dedup_gates.sql` | `normalized_article_url`, `normalized_article_title`, `last_analyzed_at`, `status_history` + backfills |
| `supabase/migrations/20260311_batch_grouping_schema.sql` | `batch_region`, `added_to_queue_at`, `is_re_associated`, `re_associated_from_batch_id`; `regions` on `collection_runs`; `original_batch_id` on `collected_articles` |

---

### 17.9 Design Principles Established

These decisions codify principles that should guide future development:

1. **Block early, block cheap** — suppress duplicates at Gate 1 (collect-news) before they trigger LLM calls in Steps 2 and 3.
2. **60-day staleness benchmark** — the system-wide constant for "things may have changed": deleted suppression window, staleness badge, re-analyze trigger.
3. **Never lose user actions** — status, notes, and history are always preserved across refreshes, re-analyses, and re-associations.
4. **Dedup is article-level; awareness is company-level** — gates operate on URL/title identity. Company-level intelligence is surfaced as a visual hint, not a hard block.
5. **Visual grouping is not filtering** — batch groups in Step 3 are a derived view. The underlying `results` array always contains all records.

*Delta section added 2026-03-11.*
