# Signal — Market Intelligence & Lead Discovery

> Rebuild guide for the Signal application. A 3-step pipeline that collects news articles via Google News RSS, scores them for commercial relevance using AI, and generates structured Opportunity Intelligence Packs.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Database Schema](#database-schema)
4. [Step 1 — News Collection](#step-1--news-collection)
5. [Step 2 — AI Scoring](#step-2--ai-scoring)
6. [Step 3 — Deep Dive / Opportunity Intelligence](#step-3--deep-dive--opportunity-intelligence)
7. [LLM Abstraction Layer](#llm-abstraction-layer)
8. [Frontend Components](#frontend-components)
9. [Design System](#design-system)
10. [Type Definitions](#type-definitions)
11. [Configuration & Secrets](#configuration--secrets)

---

## Architecture Overview

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Step 1      │────▶│  Step 2          │────▶│  Step 3         │
│  collect-news│     │  score-articles   │     │  deep-dive      │
│  (Edge Fn)   │     │  (Edge Fn + SSE) │     │  (Edge Fn)      │
└──────┬───────┘     └──────┬───────────┘     └──────┬──────────┘
       │                    │                        │
       ▼                    ▼                        ▼
  collected_articles   scored_articles         opportunity_packs
       └─── collection_runs (batch tracking) ───────┘
```

- **Frontend**: Single-page React app with 3 sequential panels
- **Backend**: 3 Supabase Edge Functions (Deno) + PostgreSQL database
- **AI**: Dual-provider LLM abstraction (Claude / Gemini) for scoring and analysis
- **Data Source**: Google News RSS feeds (no API key required)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS 3, shadcn/ui components |
| State | React `useState` (no external state management) |
| Backend | Supabase Edge Functions (Deno runtime) |
| Database | PostgreSQL (via Supabase) |
| AI Scoring | Claude Sonnet 4 (default) or Gemini via Lovable AI Gateway |
| Data Source | Google News RSS (`news.google.com/rss/search`) |

---

## Database Schema

### `collection_runs`
Tracks each batch collection execution.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | text | — | PK, format: `batch_YYYYMMDDTHHMMSS` |
| keywords | text[] | — | Search keywords used |
| articles_collected | integer | 0 | Total fetched from RSS |
| articles_stored | integer | 0 | After all filters applied |
| status | text | `'running'` | `running` or `completed` |
| started_at | timestamptz | `now()` | |
| completed_at | timestamptz | null | |
| last_published_at | timestamptz | null | Most recent article date |

### `collected_articles`
Raw articles stored after the collection pipeline.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | text | — | PK, hash of normalized title + source |
| keyword | text | — | Which keyword matched |
| url | text | — | Article URL (Google News redirect) |
| title | text | — | Article headline |
| publishing_agency | text | null | Source publisher name |
| published_at | timestamptz | null | Publication date |
| batch_id | text | — | FK to collection_runs.id |
| created_at | timestamptz | `now()` | |

### `scored_articles`
AI-scored results from Step 2.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | `gen_random_uuid()` | PK |
| article_id | text | — | FK to collected_articles.id (unique constraint) |
| batch_id | text | — | FK to collection_runs.id |
| is_relevant | boolean | false | `bdImpactScore >= threshold && !dropReason` |
| drop_reason | text | null | Why article was filtered |
| company | text | null | Identified company name |
| partner_or_si | text | null | Partner / System Integrator |
| country | text | null | |
| city | text | null | |
| units_mentioned | integer | null | Number of units referenced |
| buying_intent_type | text | null | One of 8 signal types |
| buying_intent_score | integer | 0 | 0–50 |
| lead_clarity_score | integer | 0 | 0–30 |
| source_quality_score | integer | 0 | 0–20 |
| bd_impact_score | integer | 0 | Composite score (max 100) |
| why_it_matters | text | null | AI explanation |
| confidence | text | null | HIGH / MEDIUM / LOW |

### `opportunity_packs`
Deep-dive analysis results from Step 3.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | `gen_random_uuid()` | PK |
| article_url | text | — | Source article URL |
| article_title | text | — | Source article title |
| article_source | text | null | Publisher name |
| company_name | text | null | |
| inferred_industry | text | null | |
| deployment_region | text | null | |
| likely_buyer_type | text | null | |
| maturity_signal | text | null | EARLY / SCALING / ENTERPRISE_GRADE |
| event_type | text | null | |
| scale_description | text | null | |
| urgency_level | text | null | LOW / MEDIUM / HIGH |
| expansion_likelihood | text | null | LOW / MEDIUM / HIGH |
| why_this_is_hot | text | null | |
| strategic_entry_point | text | null | |
| partnership_angle | text | null | |
| risk_factors | text | null | |
| opportunity_score | integer | null | 0–100 |
| crm_ready_notes | text | null | Copy-pasteable CRM notes |
| raw_json | jsonb | null | Full LLM response |
| status | text | `'open'` | Lead status tracking |
| status_updated_at | timestamptz | `now()` | |
| batch_id | text | null | Reference to collection batch |
| keywords | text[] | null | Keywords used for collection |
| filter_days | integer | null | Date filter window used |
| collection_ran_at | timestamptz | null | When collection ran |
| notes | text | null | User notes |

### RLS Policies
All tables have RLS enabled with permissive public access (`true` for all operations). No authentication is required. Tables allow:
- `collected_articles`: SELECT, INSERT only
- `collection_runs`: SELECT, INSERT, UPDATE
- `scored_articles`: SELECT, INSERT, UPDATE
- `opportunity_packs`: SELECT, INSERT, UPDATE, DELETE

---

## Step 1 — News Collection

**Edge Function**: `supabase/functions/collect-news/index.ts`  
**Endpoint**: `POST /functions/v1/collect-news`  
**JWT Verification**: Disabled

### Request Body
```json
{
  "keywords": ["keyword1", "keyword2"],
  "filterDays": 30,
  "region": "Global"
}
```

### How It Works

1. **RSS Fetching**: For each keyword × edition combination, fetches `https://news.google.com/rss/search?q="<keyword>"&hl=<lang>&gl=<edition>&ceid=<edition>:<lang>`
2. **Edition Selection**: 20 supported editions (US, UK, Spain, Germany, France, India, Australia, Brazil, Japan, South Korea, Canada, Italy, Mexico, Saudi Arabia, UAE, Singapore, South Africa, Nigeria, Indonesia, China). When `region` is `"Global"`, all editions are searched. Otherwise, only the matching edition is used.
3. **XML Parsing**: Regex-based RSS XML parsing (no XML library). Extracts `<title>`, `<link>`, `<pubDate>`, `<source>`.
4. **Article ID Generation**: `sha256(normalizeTitle(title) + "|" + source)` — a simple hash (not cryptographic, just a fast integer-based hash).

### Deduplication Pipeline (5 layers)

1. **URL match**: Skip if same URL already seen
2. **Normalized title match**: Lowercase, strip punctuation, collapse whitespace
3. **Agency + timestamp match**: Same publisher + same `published_at`
4. **URL slug match**: Compare URL pathnames
5. **Fuzzy title similarity**: Extract "content words" (3+ chars, no stop words), compute overlap ratio. Threshold: 0.80

### Date Filtering
- Filter articles older than `filterDays` (default 30, range 1–365)
- Articles without `published_at` pass through

### Storage Cap
- Max 50 articles stored per run
- Cross-run dedup: checks existing DB articles by ID, URL, and fuzzy title before inserting
- Existing articles matching the current batch get their `batch_id` updated (re-associated)

### Response Structure
```json
{
  "run": { "id": "batch_...", "keywords": [...], "articles_collected": 1100, "articles_stored": 50, ... },
  "articles": [{ "id": "...", "title": "...", "url": "...", ... }],
  "allFetched": [{ ... }],
  "pipeline": { "totalFetched": 1100, "afterDedup": 400, "afterDateFilter": 300, "afterCap": 50, ... },
  "lastRunForKeywords": { "id": "...", "completedAt": "...", ... } | null
}
```

---

## Step 2 — AI Scoring

**Edge Function**: `supabase/functions/score-articles/index.ts`  
**Endpoint**: `POST /functions/v1/score-articles`  
**JWT Verification**: Disabled  
**Response Format**: Server-Sent Events (SSE)

### Request Body
```json
{
  "batchId": "batch_20250228T120000",
  "minScore": 60
}
```

### How It Works

1. **Fetch articles** from `collected_articles` where `batch_id` matches
2. **Check cache**: Look up `scored_articles` for already-scored articles
3. **Emit cached results** via SSE (skip those below threshold or with drop reasons)
4. **Pre-filter**: Drop articles with titles containing obvious non-relevant keywords (opinion, editorial, stock price, podcast, etc.)
5. **Single LLM call**: Send ALL remaining articles in one batch to the LLM with a structured tool call

### Scoring Formula
```
bdImpactScore = buyingIntentScore (0-50) + leadClarityScore (0-30) + sourceQualityScore (0-20)
```
- Maximum: 100
- Default threshold: 60 (configurable via `minScore`)

### Buying Intent Types (8 categories)
`LIVE_DEPLOYMENT`, `CONTRACT_AWARD`, `TENDER`, `PARTNER_ANNOUNCEMENT`, `EXPANSION`, `FUNDING`, `REGULATION`, `OTHER`

### Confidence Levels
`HIGH`, `MEDIUM`, `LOW`

### LLM Tool Schema
The LLM is called with a forced tool call `score_articles_batch` that returns:
```json
{
  "scores": [
    {
      "articleIndex": 0,
      "dropReason": null,
      "company": "Acme Corp",
      "partnerOrSI": null,
      "country": "US",
      "city": "Austin",
      "unitsMentioned": 50,
      "buyingIntentType": "LIVE_DEPLOYMENT",
      "leadClarityScore": 25,
      "buyingIntentScore": 40,
      "sourceQualityScore": 15,
      "bdImpactScore": 80,
      "whyItMatters": "...",
      "confidence": "HIGH"
    }
  ]
}
```

### SSE Event Types
| Event | Payload |
|-------|---------|
| `progress` | `{ current, total }` |
| `progress_note` | `{ message }` — e.g. "5 articles loaded from cache" |
| `result` | `{ data: { article, scan } }` — relevant scored article |
| `dropped` | `{ title, reason, score? }` — filtered out article |
| `complete` | `{ totalScored, totalRelevant, fromCache, preFiltered, scoreThreshold }` |
| `error` | `{ message }` |
| `[DONE]` | Stream end signal |

### Dedup in Scoring
The LLM prompt instructs: "If multiple articles cover the SAME company doing the SAME thing, give the BEST one a high score and give duplicates a `dropReason` of 'Duplicate coverage of same event'."

### Defensive Parsing
The LLM response is parsed defensively:
```typescript
const parsed = JSON.parse(result.toolCall.arguments);
const scores = Array.isArray(parsed) ? parsed : (parsed.scores || []);
```

---

## Step 3 — Deep Dive / Opportunity Intelligence

**Edge Function**: `supabase/functions/deep-dive/index.ts`  
**Endpoint**: `POST /functions/v1/deep-dive`  
**JWT Verification**: Disabled

### Request Body
```json
{
  "url": "https://...",
  "title": "Article Title",
  "source": "Publisher Name",
  "scanContext": {
    "company": "...",
    "country": "...",
    "buyingIntentType": "LIVE_DEPLOYMENT",
    "bdImpactScore": 85,
    "whyItMatters": "..."
  },
  "batchContext": {
    "batchId": "batch_...",
    "keywords": ["..."],
    "filterDays": 30,
    "collectionRanAt": "2025-01-01T..."
  }
}
```

### How It Works

1. Receives article metadata + Step 2 scoring context
2. Calls LLM with `create_opportunity_pack` forced tool call
3. Persists the structured result to `opportunity_packs` table
4. Returns the pack + database ID

### Opportunity Pack Structure
```typescript
{
  companyProfile: {
    companyName: string;
    inferredIndustry: string;
    deploymentRegion: string;
    likelyBuyerType: string;
    maturitySignal: "EARLY" | "SCALING" | "ENTERPRISE_GRADE";
  };
  deploymentSignal: {
    eventType: string;
    scale: string;
    urgencyLevel: "LOW" | "MEDIUM" | "HIGH";
    expansionLikelihood: "LOW" | "MEDIUM" | "HIGH";
  };
  bdOpportunityAssessment: {
    whyThisIsHot: string;
    strategicEntryPoint: string;
    partnershipAngle: string;
    riskFactors: string;
    opportunityScore: number; // 0-100
  };
  crmReadyNotes: string;
}
```

### Lead Status Tracking
Opportunity packs support lead management with these statuses:
- `open` — New lead
- `shared_with_partners` — Shared with partner
- `acted_internally` — Added to CRM
- `closed` — Closed
- `archived` — Archived
- `duplicate` — Duplicate

---

## LLM Abstraction Layer

**File**: `supabase/functions/_shared/llm.ts`

### Dual-Provider Architecture
```typescript
export type LLMProvider = "claude" | "gemini";
```

Provider selection: `LLM_PROVIDER` env var → defaults to `"claude"`

### Claude (Anthropic)
- **API**: `https://api.anthropic.com/v1/messages`
- **Auth**: `x-api-key` header
- **Default Model**: `claude-sonnet-4-20250514`
- **Secret**: `ANTHROPIC_API_KEY`
- **Tool format conversion**: OpenAI-style tools → Claude `input_schema` format

### Gemini (Lovable AI Gateway)
- **API**: `https://ai.gateway.lovable.dev/v1/chat/completions`
- **Auth**: `Authorization: Bearer <key>` header
- **Default Model**: `google/gemini-3-flash-preview`
- **Secret**: `LOVABLE_API_KEY` (auto-provisioned)
- **Tool format**: OpenAI-compatible (no conversion needed)

### Error Classes
- `RateLimitError` — HTTP 429
- `CreditsExhaustedError` — HTTP 402

### Call Signature
```typescript
callLLM({
  systemPrompt: string,
  userMessage: string,
  tools?: ToolDefinition[],
  toolChoice?: ToolChoice,
  provider?: "claude" | "gemini",
  model?: string,
}): Promise<{ toolCall?: { name, arguments }, content?: string }>
```

---

## Frontend Components

### Page Layout (`src/pages/Index.tsx`)
Single page with 3 sequential panels. State flows top-down:
- `collectionRun` → passed from Step1 to Step2
- `scoredArticles` → populated by Step2
- `selectedArticles` → user selection in Step2, consumed by Step3

### Component Tree
```
Index.tsx
├── Header.tsx                    — Sticky header with app name
├── Step1Panel.tsx                — Keyword input, region select, date filter, collection trigger
│   ├── PipelineRow              — Shows pipeline stage counts
│   ├── PipelineArrow            — Shows dropped counts between stages
│   └── ArticleTableDialog       — Modal table of fetched/stored articles
├── Step2Panel.tsx                — Score trigger, filter/sort, results display
│   └── ArticleCard.tsx          — Individual scored article card (detail view)
└── Step3Panel.tsx                — Deep dive trigger, lead management
    └── OpportunityCard.tsx      — Expandable opportunity pack display
```

### View Modes
Both Step 2 and Step 3 support two view modes:
- **Table view**: Compact tabular display
- **Detail view**: Card-based layout with more information

### Step 1 UI Features
- Keyword pill input (add/remove)
- Date range selector (7, 14, 30, 60, 90 days)
- Region selector (Global + 20 specific regions)
- Pipeline breakdown visualization
- Modal dialogs for stored/fetched article lists
- Last run info for same keywords

### Step 2 UI Features
- Score button with SSE progress
- Filter by buying intent type
- Sort by impact score or date
- Select/deselect articles for Step 3
- Dropped articles collapsible section with reasons
- Scoring stats summary (processed, cached, pre-filtered, relevant)

### Step 3 UI Features
- Deep dive button for selected articles
- Lead status management (Open, Shared, CRM, Closed, Archived, Duplicate)
- Status filter tabs with counts
- Delete opportunity packs
- Copy CRM notes to clipboard
- Loads existing packs from DB on mount

---

## Design System

### Theme (Dark-only)
All defined in `src/index.css` as HSL CSS variables:

| Token | HSL Value | Usage |
|-------|-----------|-------|
| `--background` | `220 20% 7%` | Page background |
| `--foreground` | `210 20% 92%` | Primary text |
| `--card` | `220 18% 10%` | Card backgrounds |
| `--primary` | `160 70% 45%` | Teal/green accent |
| `--muted` | `220 15% 14%` | Muted backgrounds |
| `--destructive` | `0 72% 51%` | Error/delete |

### Signal Type Colors
Each buying intent type has a dedicated color:
| Signal | CSS Variable |
|--------|-------------|
| Live Deployment | `--signal-deployment: 145 65% 42%` |
| Contract Award | `--signal-contract: 210 80% 55%` |
| Tender | `--signal-tender: 45 90% 55%` |
| Partner | `--signal-partner: 280 60% 60%` |
| Expansion | `--signal-expansion: 175 65% 45%` |
| Funding | `--signal-funding: 25 90% 55%` |
| Regulation | `--signal-regulation: 220 10% 55%` |
| Other | `--signal-other: 220 10% 40%` |

### Fonts
- **Display**: Space Grotesk (headings, scores)
- **Body**: Inter (body text, labels)

---

## Type Definitions

**File**: `src/lib/types.ts`

### Key Constants
```typescript
DEFAULT_KEYWORDS = ["DJI Dock", "DJI 3"]
DEFAULT_FILTER_DAYS = 30
FILTER_DAY_OPTIONS = [7, 14, 30, 60, 90]
MAX_ARTICLES_STORED = 50
MIN_BD_IMPACT_SCORE = 60
```

### Region Support
21 options: `Global`, `US`, `UK`, `Canada`, `Australia`, `India`, `Singapore`, `South Africa`, `Nigeria`, `Spain`, `Germany`, `France`, `Italy`, `Mexico`, `Brazil`, `Japan`, `South Korea`, `Indonesia`, `China`, `Saudi Arabia`, `UAE`

---

## Configuration & Secrets

### Edge Function Config (`supabase/config.toml`)
All 3 functions have `verify_jwt = false` (public access).

### Required Secrets
| Secret | Used By | Purpose |
|--------|---------|---------|
| `ANTHROPIC_API_KEY` | `_shared/llm.ts` | Claude API access (when using Claude provider) |
| `LOVABLE_API_KEY` | `_shared/llm.ts` | Lovable AI Gateway access (when using Gemini provider) |
| `LLM_PROVIDER` | `_shared/llm.ts` | Optional: `"claude"` (default) or `"gemini"` |
| `SUPABASE_URL` | All edge functions | Auto-provisioned |
| `SUPABASE_SERVICE_ROLE_KEY` | All edge functions | Auto-provisioned |

### Environment Variables (Frontend)
| Variable | Usage |
|----------|-------|
| `VITE_SUPABASE_URL` | Edge function base URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Auth header for edge function calls |

---

## API Endpoint Summary

| Endpoint | Method | Auth | Response |
|----------|--------|------|----------|
| `/functions/v1/collect-news` | POST | None (JWT disabled) | JSON |
| `/functions/v1/score-articles` | POST | Bearer (anon key) | SSE stream |
| `/functions/v1/deep-dive` | POST | None (via `supabase.functions.invoke`) | JSON |

---

## Data Flow Summary

```
User Input (keywords, days, region)
        │
        ▼
   collect-news ──────▶ collected_articles (max 50)
        │                     + collection_runs
        │
        ▼
   score-articles ────▶ scored_articles (cached)
        │                 SSE stream to frontend
        │                 Threshold: bdImpactScore ≥ 60
        │
        ▼ (user selects articles)
   deep-dive ─────────▶ opportunity_packs
                         Lead status management
                         CRM-ready notes
```
