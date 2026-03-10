# Product Requirements Document: Step 3 Batch-Grouped Action Queue

**Document Version:** 1.0  
**Last Updated:** March 10, 2026  
**Status:** Ready for Implementation  
**Priority:** High  

---

## 📋 Executive Summary

Currently, Step 3 (Opportunity Intelligence Queue) displays all actionable articles as a flat list, making it impossible for users to distinguish between newly analyzed articles and existing backlog. This causes user confusion and wastes time as users re-review previously known articles.

This PRD outlines a redesign to organize the Step 3 queue by batch collection, with clear visual indicators for new additions, enabling users to focus on recent discoveries while maintaining access to historical backlog.

---

## 🎯 Problem Statement

### Current State Issues:

1. **Lack of Context**: Users don't know which batch/keywords produced which articles
2. **No Temporal Information**: No indication of when articles were added to the queue
3. **Backlog Confusion**: Can't distinguish new articles from previously reviewed backlog
4. **Re-Review Waste**: Users waste time re-reading articles they've already evaluated
5. **Batch Context Lost**: Keywords and search parameters not visible in Step 3
6. **No Batch Status**: Can't see at-a-glance how many articles from each batch are actioned vs. open

### Impact:

- User friction in the workflow (confusion, wasted time)
- Reduced actionability (users might skip articles due to information overload)
- Lost context from original search (can't recall why an article was collected)

---

## 🚀 Goals & Objectives

### Primary Goals:

1. ✅ **Eliminate Confusion**: Users instantly understand what's new vs. backlog
2. ✅ **Provide Batch Context**: Display original keywords and collection date with each batch
3. ✅ **Preserve Action Queue Model**: Maintain persistent backlog until user actions each article
4. ✅ **Improve Workflow Efficiency**: Focus on new additions while preserving backlog access
5. ✅ **Support Re-Associated Articles**: Enable re-associated high-quality articles to naturally flow into queue

### Success Metrics:

- User doesn't ask "which articles are new?" in testing
- Time spent reviewing Step 3 decreases by 30%+
- All users intuitively understand queue organization
- Zero confusion between new/backlog in user feedback

---

## 👥 User Stories

### Story 1: User Returns After Batch Collection
```
AS A: Business Development Manager
I WANT TO: Quickly identify newly added articles from my recent search
SO THAT: I can prioritize review and action on fresh opportunities

Acceptance Criteria:
- New articles from latest batch are visually distinct (badge/color)
- Batch date and keywords are visible
- Old backlog is still accessible but not prominent
- Count of new articles is shown (e.g., "8 new additions")
```

### Story 2: User Manages Backlog
```
AS A: Business Development Manager  
I WANT TO: See which articles from each previous batch are still open vs. actioned
SO THAT: I can resume where I left off without duplicating work

Acceptance Criteria:
- Status counter shown per batch: [Open: X] [Shared: Y] [Acted: Z]
- Collapsed sections for completed batches
- Expandable to review completed articles if needed
- Quick undo capability for recently actioned items
```

### Story 3: User References Batch Context
```
AS A: Business Development Manager
I WANT TO: Remember what keywords I searched for each batch
SO THAT: I can understand why an article was collected

Acceptance Criteria:
- Original keywords displayed in batch header
- Collection date shown
- Search region/filters shown if applicable
- Link to original batch run details (optional future feature)
```

### Story 4: User Handles Re-Associated Articles
```
AS A: Business Development Manager
I WANT TO: See articles re-associated from previous batches appear in my queue
SO THAT: High-quality articles aren't lost in dedup logic

Acceptance Criteria:
- Re-associated high-quality articles enter current batch queue
- Clearly marked as "re-associated from Batch X" in article detail
- No confusion between new-collected and re-associated
- Treated identically for actioning (shared/acted/archived)
```

---

## 📐 Design Specification

### Visual Hierarchy

```
Step 3: Opportunity Intelligence Queue
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 BATCH C - Mar 10, 2026 (8 new articles)
   Keywords: drones-agriculture | Region: Global
   Status: [8 Open] [0 Shared] [0 Acted]
   
   ⭐ NEW ADDITIONS FROM THIS BATCH
   
   ├─ Article X: "DJI Deploys Drones in AWS Data Centers"
   │  └─ Score: 85/100 | Company: AWS | Region: USA
   │  └─ Source: Google News | Date: Mar 10
   │  └─ [Share] [Act] [Archive] [⋮]
   │
   ├─ Article Y: "Logistics Startup Raises Series B with Drone Focus"
   │  └─ Score: 78/100 | Company: LogiDrones Inc | Region: USA
   │  └─ Source: LinkedIn | Date: Mar 9
   │  └─ [Share] [Act] [Archive] [⋮]
   │
   └─ [+6 more articles from this batch]
   
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 BATCH B - Mar 5, 2026 (12 articles, 8 remaining)
   Keywords: logistics-startups | Region: USA
   Status: [5 Open] [3 Shared] [4 Acted]
   
   BACKLOG - Previously Collected Articles
   
   ├─ Article M: "Government Awards Multi-Year Drone Contract"
   │  └─ Score: 88/100 | Company: DOD | Region: USA
   │  └─ Status: Shared with John Smith (Sales) | Date: Mar 5
   │  └─ [Undo] [Act] [Archive] [⋮]
   │
   ├─ Article N: "Airport Announces AI Drone Trial Program"
   │  └─ Score: 75/100 | Company: LAX | Region: USA
   │  └─ Status: Acted - Forwarded to BD Manager | Date: Mar 4
   │  └─ [Undo] [Share Again] [Archive] [⋮]
   │
   └─ [+10 more articles from this batch]
   
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 BATCH A - Mar 1, 2026 (20 articles - All Completed)
   Keywords: government-drones | Region: Global
   Status: [0 Open] [0 Shared] [20 Acted/Archived]
   
   [Archived/Completed - Click to Expand]
```

### Component Structure

```
<Step3Panel>
  <QueueHeader>
    Total: 45 articles | New: 8 | Open: 13 | Actioned: 24
  </QueueHeader>
  
  <BatchGroups>
    {batches.map(batch => (
      <BatchSection key={batch.id} batch={batch}>
        <BatchHeader>
          Date | Keywords | Status counters | Collapse toggle
        </BatchHeader>
        
        {batch.isCurrentBatch && <NewAdditionsBadge />}
        
        <ArticlesList>
          {articles.map(article => (
            <ArticleCard>
              Title | Score | Company | Status indicator | Actions
            </ArticleCard>
          ))}
        </ArticlesList>
        
        {articles.length > visibleCount && (
          <ExpandButton>See all {totalCount} articles</ExpandButton>
        )}
      </BatchSection>
    ))}
  </BatchGroups>
</Step3Panel>
```

### Color & Visual Indicators

| Element | Style | Meaning |
|---------|-------|---------|
| **[⭐ NEW ADDITIONS]** | Gold badge, bold text | Articles added in current batch |
| **Batch header (current)** | Light blue background | Most recent batch |
| **Batch header (old)** | Default background | Previous batches |
| **Open status** | Default text color | Not yet actioned |
| **Shared status** | 📤 Green indicator | Shared with partner/colleague |
| **Acted status** | ✅ Purple indicator | Internal action taken |
| **Archived status** | Greyed out text | Removed from active queue |
| **Re-associated** | 🔄 Small badge | Previously collected, scored again |

### Batch Header Layout

```
📌 BATCH C - Mar 10, 2026 (8 new articles)
   Keywords: drones-agriculture, mining-operations | Region: USA, Canada
   Status: [8 Open] [0 Shared] [0 Acted] [0 Archived]
   └─ Added: Mar 10 2:34 PM | Batch ID: batch_xyz123
```

**Fields Displayed:**
- Batch icon + number
- Collection date (human readable)
- Article count in parentheses
- Keywords (clickable → show original search params)
- Collection region/filters
- Status counters (clickable to filter by status)
- Collection timestamp
- Batch ID (for reference/debugging)

### Default Behaviors

1. **Current Batch**: Expanded by default, "⭐ NEW ADDITIONS" badge visible
2. **Previous Batches**: Collapsed by default (show header + status, hide articles)
3. **Completed Batches**: Collapsed, with note "All actioned - archive to hide"
4. **Scroll Behavior**: Auto-scroll to "⭐ NEW ADDITIONS" section on load
5. **Sort Order**: Newest batch first (reverse chronological)

---

## 🔧 Implementation Requirements

### Database Schema Changes

#### New Fields on `opportunity_packs` Table:
```sql
-- Track which batch articles were deep-dived in
ALTER TABLE opportunity_packs ADD COLUMN batch_id TEXT REFERENCES collection_runs(id);

-- Track original batch context
ALTER TABLE opportunity_packs ADD COLUMN batch_keywords TEXT[] DEFAULT '{}';
ALTER TABLE opportunity_packs ADD COLUMN batch_region TEXT;
ALTER TABLE opportunity_packs ADD COLUMN batch_filter_days INT;

-- Track when article was added to queue (for sorting)
ALTER TABLE opportunity_packs ADD COLUMN added_to_queue_at TIMESTAMP DEFAULT NOW();

-- Mark if article was re-associated in this batch
ALTER TABLE opportunity_packs ADD COLUMN is_re_associated BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunity_packs ADD COLUMN re_associated_from_batch_id TEXT;
```

#### Existing Fields Already Present (no change):
- `created_at` (when deep-dive analysis happened)
- `batch_id` (already tracks original batch)
- `status` (open, shared_with_partners, acted_internally, closed, archived, duplicate, deleted)

### API/Query Changes

#### 1. New Query: Fetch Batches with Articles for Step 3

**Endpoint**: `GET /api/step3/batches`

```typescript
interface BatchWithArticles {
  batchId: string;
  collectionRunId: string;
  batchDate: string;
  keywords: string[];
  region: string;
  filterDays?: number;
  articleCount: number;
  statusBreakdown: {
    open: number;
    shared_with_partners: number;
    acted_internally: number;
    closed: number;
    archived: number;
    duplicate: number;
    deleted: number;
  };
  articles: OpportunityPack[];
  isCurrentBatch: boolean;
  createdAt: string;
}
```

**Query Logic**:
```typescript
// Fetch all opportunity_packs grouped by batch_id
// Join with collection_runs to get batch context (keywords, dates, regions)
// Order by batch creation date DESC
// Include status counts per batch
// Mark the most recent batch as "current"
```

#### 2. Modified Step 2 Logic: Re-Associate High-Quality Articles

**File**: `supabase/functions/score-articles/index.ts`

**Change**: Properly handle re-associated articles

```typescript
// When processing articles:
const reAssociatedArticles = await supabase
  .from('collected_articles')
  .select('id, url, title, batch_id')
  .in('id', articleIds)
  .neq('batch_id', currentBatchId);

// For re-associated articles:
// 1. Check if already scored and score >= MIN_BD_IMPACT_SCORE
// 2. If yes: Use cached score, include in results
// 3. If no: Re-score with current batch context
// 4. If score < MIN_BD_IMPACT_SCORE: Skip (quality gate)

// Result: High-quality re-associated articles flow to Step 3
```

#### 3. Enhanced Deep-Dive Function

**File**: `supabase/functions/deep-dive/index.ts`

**Changes**:
```typescript
// When creating opportunity_pack record, also store:
{
  batch_id: currentBatchId,
  batch_keywords: collectionRun.keywords,
  batch_region: collectionRun.region,
  batch_filter_days: collectionRun.filter_days,
  is_re_associated: isReAssociatedArticle,
  re_associated_from_batch_id: originalBatchId,
  added_to_queue_at: NOW(),
  // ... existing fields
}
```

### Frontend Component Changes

#### Step 3 Panel Restructure

**File**: `src/components/signal/Step3Panel.tsx`

**Major Changes**:
1. Replace flat article list with batch-grouped structure
2. Add `loadBatchGroups()` function (replaces current `loadExistingPacks()`)
3. Add batch expansion/collapse state management
4. Add new components:
   - `<BatchSection>` - Wrapper for each batch
   - `<BatchHeader>` - Header with metadata
   - `<NewAdditionsBadge>` - Visual indicator
   - `<StatusBreakdown>` - Counter pills
5. Implement auto-scroll to new additions
6. Update article card with re-association indicator

**Key State Changes**:
```typescript
interface BatchData {
  batchId: string;
  collectionRunId: string;
  batchDate: string;
  keywords: string[];
  region: string;
  statusBreakdown: StatusCounts;
  articles: EnrichedResult[];
  isCurrentBatch: boolean;
  isExpanded: boolean;
}

// Replace:
// const [results, setResults] = useState<EnrichedResult[]>([])

// With:
const [batches, setBatches] = useState<BatchData[]>([]);
const [expandedBatches, setExpandedBatches] = useState<Set<string>>(
  new Set([latestBatchId]) // Current batch always expanded
);
```

---

## 📊 Data Flow Diagram

```
Step 1: Collection
  ├─ Collects articles
  ├─ Detects re-associated articles
  └─ Stores batch metadata (keywords, region, date)
      ↓
Step 2: Scoring
  ├─ Scores NEW articles
  ├─ For re-associated: Check cache
  │  ├─ If score >= threshold: Include
  │  └─ If score < threshold: Exclude (quality gate)
  └─ Results sent to Step 3
      ↓
Step 3: Deep-Dive & Queue
  ├─ User selects high-quality articles
  ├─ Deep-dive analysis generates opportunity_packs
  ├─ Records stored with:
  │  ├─ batch_id (current batch)
  │  ├─ batch_keywords
  │  ├─ batch_region
  │  ├─ is_re_associated flag
  │  └─ added_to_queue_at timestamp
  ├─ Display grouped by batch
  └─ User actions on articles
      ├─ Share with partners → status: shared_with_partners
      ├─ Act internally → status: acted_internally
      ├─ Close/Archive → status: closed/archived
      └─ Delete → status: deleted
```

---

## ✅ Test Cases

### Test Case Group 1: Batch Grouping & Display

#### TC1.1: Single Batch Display
**Objective**: Verify articles from single batch display correctly

**Setup**:
- Collect Batch A with 5 articles
- Score and deep-dive all 5
- Navigate to Step 3

**Steps**:
1. Open Step 3
2. Observe batch display

**Expected Results**:
- ✓ Batch A header visible with: date, keywords, region
- ✓ All 5 articles listed under batch
- ✓ Status counters show: [5 Open] [0 Shared] [0 Acted]
- ✓ Badge shows "⭐ NEW ADDITIONS"
- ✓ Batch header shows full keywords
- ✓ Collection date matches batch creation date

**Assertion**: Single batch displays completely with all context

---

#### TC1.2: Multiple Batches Display (Newest First)
**Objective**: Verify multiple batches display in reverse chronological order

**Setup**:
- Batch A (Mar 1): 10 articles
- Batch B (Mar 5): 8 articles
- Batch C (Mar 10): 5 articles
- All analyzed and in Step 3

**Steps**:
1. Open Step 3
2. Observe batch order

**Expected Results**:
- ✓ Batch C appears first (top)
- ✓ Batch B appears second
- ✓ Batch A appears last (bottom)
- ✓ Each batch shows correct article count
- ✓ Date stamps are accurate
- ✓ Total count shows 23 articles

**Assertion**: Batches display in reverse chronological order (newest first)

---

#### TC1.3: Current Batch vs. Backlog Distinction
**Objective**: Verify current batch is visually distinct from backlog

**Setup**:
- Previous batches (A, B) in Step 3 with various actions
- User just completed Batch C (newest, 6 new articles)
- Navigate to Step 3

**Steps**:
1. Open Step 3
2. Examine visual styling

**Expected Results**:
- ✓ Batch C has special styling (light blue background OR bold header)
- ✓ "⭐ NEW ADDITIONS" badge visible on Batch C only
- ✓ Batch C is expanded by default
- ✓ Previous batches (A, B) have normal styling
- ✓ Previous batches appear collapsed (headers visible, articles hidden)
- ✓ Clicking batch header toggles collapse/expand

**Assertion**: Current batch visually distinct, previous batches collapsed by default

---

#### TC1.4: Batch Header Information Completeness
**Objective**: Verify all batch context is visible in header

**Setup**:
- Batch with these attributes:
  - Keywords: ["drones-agriculture", "contract-awards"]
  - Region: "USA"
  - Filter days: 30
  - 12 articles
  - Created: Mar 10, 2:34 PM

**Steps**:
1. Open Step 3
2. Examine batch header

**Expected Results**:
- ✓ Batch date displayed: "Mar 10, 2026"
- ✓ Keywords shown: "drones-agriculture, contract-awards"
- ✓ Region shown: "USA"
- ✓ Article count shown: "12 articles"
- ✓ Collection timestamp shown: "Mar 10 2:34 PM"
- ✓ Batch ID visible (for reference)
- ✓ Keywords are readable (not truncated)

**Assertion**: All batch context visible and accurate

---

### Test Case Group 2: Status Counters & Filtering

#### TC2.1: Status Breakdown Counters
**Objective**: Verify status counters accurately reflect article statuses

**Setup**:
- Batch with 12 articles:
  - 5 open
  - 3 shared with partners
  - 2 acted internally
  - 1 archived
  - 1 deleted

**Steps**:
1. Open Step 3
2. Examine batch header status counters

**Expected Results**:
- ✓ Counter shows: "[5 Open] [3 Shared] [2 Acted] [1 Archived] [1 Deleted]"
- ✓ Counters are accurate
- ✓ Counts add up to 12 total articles
- ✓ Each counter is clickable (to filter if implemented later)
- ✓ Open articles are visually distinct (default styling)
- ✓ Shared articles show partner name next to article
- ✓ Acted articles show action taken next to article

**Assertion**: Status counters accurate and reflect article statuses

---

#### TC2.2: Batch Collapse/Expand Behavior
**Objective**: Verify batch sections collapse and expand correctly

**Setup**:
- 3 batches (A, B, C)
- Current batch C expanded, A and B collapsed

**Steps**:
1. Open Step 3
2. Click Batch A header → expand
3. Verify articles appear
4. Click Batch A header again → collapse
5. Verify articles disappear
6. Repeat for Batch B

**Expected Results**:
- ✓ Clicking batch header toggles expand/collapse
- ✓ Current batch (C) is expanded by default
- ✓ Previous batches (A, B) are collapsed by default
- ✓ Collapse preserves state: can re-expand to see articles
- ✓ Collapse animation smooth (if implemented)
- ✓ Collapsed batch shows: header + status counters only
- ✓ Expanded batch shows: header + all articles + counters

**Assertion**: Batch collapse/expand works as intended

---

### Test Case Group 3: New Additions Identification

#### TC3.1: Current Batch Identified as "New Additions"
**Objective**: Verify only current batch shows "NEW ADDITIONS" badge

**Setup**:
- Step 3 with 3 batches (A, B, C)
- Batch C is most recent (current)

**Steps**:
1. Open Step 3
2. Look for "⭐ NEW ADDITIONS" badge

**Expected Results**:
- ✓ Badge appears on Batch C only
- ✓ Badge NOT on Batch A or B
- ✓ Badge text is clear: "⭐ NEW ADDITIONS FROM THIS BATCH"
- ✓ Badge visually prominent (gold/yellow color)
- ✓ Badge positioned near article list (not in header)
- ✓ Badge visible when batch is expanded
- ✓ Badge NOT visible when batch is collapsed

**Assertion**: "NEW ADDITIONS" badge correctly identifies current batch

---

#### TC3.2: New Articles Auto-Scroll on Load
**Objective**: Verify Step 3 auto-scrolls to new additions on page load

**Setup**:
- Step 3 with 3 batches (lots of articles)
- Batch C (current) has 8 new articles
- Batch C is below the fold (requires scrolling)

**Steps**:
1. Close and reopen Step 3
2. Observe page load behavior

**Expected Results**:
- ✓ Page auto-scrolls to Batch C
- ✓ "⭐ NEW ADDITIONS" badge is in viewport
- ✓ First new article is visible
- ✓ Scroll is smooth (not jarring)
- ✓ User doesn't need to manually scroll to find new articles

**Assertion**: Auto-scroll to new additions works on load

---

#### TC3.3: User Distinguishes New from Backlog Visually
**Objective**: Verify user can instantly tell new vs. backlog articles

**Setup**:
- Batch C with 8 new articles
- Batch B with 12 backlog articles
- Both expanded

**Steps**:
1. Open Step 3
2. Without reading text, identify which articles are new

**Expected Results**:
- ✓ New articles (Batch C) have visual distinction:
  - Under "⭐ NEW ADDITIONS" heading OR
  - Slightly different background color OR
  - Small badge on each card
- ✓ Backlog articles (Batch B) have standard styling
- ✓ Distinction is intuitive (no reading required)
- ✓ User can glance and immediately know which to review first

**Assertion**: Visual design makes new vs. backlog obvious

---

### Test Case Group 4: Re-Associated Article Handling

#### TC4.1: Re-Associated High-Quality Article Appears in Queue
**Objective**: Verify high-quality re-associated articles flow to Step 3

**Setup**:
- Article X from Batch A (Mar 1):
  - Original score: 82/100 (high quality)
  - Status: "open" in opportunity_packs
- Batch B (Mar 10):
  - Collects Article X again (duplicate detection)
  - Marks as "re-associated"
  - Step 2 scoring: Uses cached score (82)
  - Score >= MIN_BD_IMPACT_SCORE

**Steps**:
1. Run Step 1: Observe Article X as "re-associated" count
2. Run Step 2: Article X included (cached high score)
3. Run Step 3 deep-dive on Article X
4. Check Step 3 queue

**Expected Results**:
- ✓ Article X appears in Step 3 queue under Batch B
- ✓ Article X marked as "🔄 Re-associated from Batch A"
- ✓ Original score (82) retained
- ✓ Article X actionable (can share/act/archive)
- ✓ Article X doesn't appear duplicated in Step 3
- ✓ Step 3 shows both Batch A and Batch B entries with context

**Assertion**: High-quality re-associated articles flow through queue naturally

---

#### TC4.2: Re-Associated Low-Quality Article Blocked from Queue
**Objective**: Verify low-quality re-associated articles don't clutter queue

**Setup**:
- Article Y from Batch A (Mar 1):
  - Original score: 35/100 (low quality, below MIN_BD_IMPACT_SCORE)
  - Status: NOT in opportunity_packs (filtered out)
- Batch B (Mar 10):
  - Collects Article Y again
  - Marks as "re-associated"
  - Step 2 scoring: Uses cached score (35)
  - Score < MIN_BD_IMPACT_SCORE

**Steps**:
1. Run Step 1: Observe Article Y as "re-associated" count
2. Run Step 2: Article Y filtered out (low score)
3. Check Step 3 queue

**Expected Results**:
- ✓ Article Y does NOT appear in Step 3 queue
- ✓ No error or warning (expected behavior)
- ✓ Batch B status counters don't include Article Y
- ✓ Quality gate works (prevents junk in queue)

**Assertion**: Low-quality re-associated articles properly filtered

---

#### TC4.3: Re-Associated Article Shows Source Batch
**Objective**: Verify re-associated articles indicate original batch

**Setup**:
- Article X re-associated from Batch A to Batch B
- User views it in Step 3

**Steps**:
1. Expand Batch B in Step 3
2. Find Article X
3. Click article to view details

**Expected Results**:
- ✓ Article shows "🔄 Re-associated from Batch A"
- ✓ Original batch (A) is linked or referenced
- ✓ Shows both the original batch context and current batch
- ✓ User understands why article appears in multiple batches

**Assertion**: Re-associated articles clearly indicate source

---

### Test Case Group 5: Edge Cases

#### TC5.1: Batch with Only Re-Associated Articles
**Objective**: Verify batch with 100% re-associated articles displays correctly

**Setup**:
- Batch C collects 20 articles
- All 20 are re-associated from previous batches
- All 20 have high quality (included in Step 2)
- All 20 deep-dived and in Step 3

**Steps**:
1. Run Step 1-3 with above scenario
2. Check Step 3 display

**Expected Results**:
- ✓ Batch C appears in Step 3 with 20 articles
- ✓ Each article marked as "🔄 Re-associated from [batch]"
- ✓ Status counters show [20 Open]
- ✓ No error or unusual state
- ✓ Articles are actionable
- ✓ User understands all 20 are re-associated

**Assertion**: Batches with 100% re-associated articles work correctly

---

#### TC5.2: Empty Batch (No Articles Reached Step 3)
**Objective**: Verify batch with no articles reaching Step 3

**Setup**:
- Batch D collected 50 articles
- Step 2 scored: all below MIN_BD_IMPACT_SCORE
- 0 articles reach Step 3

**Steps**:
1. Run Step 1-2 with above scenario
2. Check Step 3 display

**Expected Results**:
- ✓ Batch D does NOT appear in Step 3 (no articles)
- ✓ OR Batch D appears with 0 articles and message: "No qualifying articles"
- ✓ No error
- ✓ Queue isn't cluttered with empty batches

**Assertion**: Empty batches handled gracefully

---

#### TC5.3: Very Old Batch (Collapsed by Default)
**Objective**: Verify very old batches remain collapsed and accessible

**Setup**:
- Batch A from 60 days ago
- Batch B from 30 days ago
- Batch C from today
- All have articles in queue

**Steps**:
1. Open Step 3
2. Check Batch A collapse state
3. Manually expand Batch A

**Expected Results**:
- ✓ Batch A is collapsed by default
- ✓ Batch A header visible with status counts
- ✓ Articles hidden until expanded
- ✓ Clicking Batch A header expands it
- ✓ All articles visible once expanded
- ✓ No performance lag when expanding old batch

**Assertion**: Old batches remain accessible but collapsed

---

#### TC5.4: Batch with Mixed Statuses
**Objective**: Verify batch with articles in all statuses displays correctly

**Setup**:
- Batch B with 20 articles:
  - 5 open
  - 4 shared with John
  - 3 shared with Jane
  - 5 acted internally
  - 2 archived
  - 1 deleted

**Steps**:
1. Open Step 3
2. Expand Batch B

**Expected Results**:
- ✓ Counter shows: "[5 Open] [7 Shared] [5 Acted] [2 Archived] [1 Deleted]"
- ✓ All 20 articles visible with status indicators
- ✓ Shared articles show partner name: "Shared with John", "Shared with Jane"
- ✓ Acted articles show action: "Acted - Forwarded to BD Manager"
- ✓ Archived articles slightly greyed out
- ✓ Deleted articles very faint or marked as deleted
- ✓ Status indicators are consistent with counters

**Assertion**: Mixed-status batches display all variations correctly

---

### Test Case Group 6: User Actions on Articles

#### TC6.1: Share Article Updates Status Counter
**Objective**: Verify status counter updates when article is shared

**Setup**:
- Batch C with Article X in "open" status
- Status counter shows [1 Open] [0 Shared]

**Steps**:
1. Click Article X "Share" action
2. Select partner: "John Smith"
3. Confirm share
4. Observe batch header

**Expected Results**:
- ✓ Modal appears to select partner
- ✓ Partner selected: "John Smith"
- ✓ Article status changes to "shared_with_partners"
- ✓ Status counter updates: [0 Open] [1 Shared]
- ✓ Article shows "📤 Shared with John Smith"
- ✓ "Undo" button appears for recent actions
- ✓ No page reload required

**Assertion**: Sharing updates status in real-time

---

#### TC6.2: Act on Article Updates Status Counter
**Objective**: Verify "acted" status works correctly

**Setup**:
- Batch C with Article Y in "open" status

**Steps**:
1. Click Article Y "Act" action
2. Select action: "Forwarded to Sales Team"
3. Confirm
4. Observe batch header

**Expected Results**:
- ✓ Modal appears to select action type
- ✓ Action selected and confirmed
- ✓ Article status changes to "acted_internally"
- ✓ Status counter updates: [0 Open] [0 Shared] [1 Acted]
- ✓ Article shows "✅ Acted - Forwarded to Sales Team"
- ✓ "Undo" button available
- ✓ No page reload required

**Assertion**: Acting on article updates status correctly

---

#### TC6.3: Archive Article Removes from Queue
**Objective**: Verify archived articles are hidden but not deleted

**Setup**:
- Batch C with Article Z in "open" status

**Steps**:
1. Click Article Z "Archive" action
2. Confirm
3. Observe batch display

**Expected Results**:
- ✓ Article Z disappears from view (or greyed out)
- ✓ Status counter updates: decrements "Open" count
- ✓ Article status changes to "archived"
- ✓ "Undo" button available
- ✓ Archive is reversible
- ✓ Archived article can be expanded/shown if toggle exists

**Assertion**: Archive removes from active queue but preserves data

---

### Test Case Group 7: Data Persistence & Batch Context

#### TC7.1: Batch Keyword Persistence
**Objective**: Verify batch keywords are correctly stored and displayed

**Setup**:
- Batch A collected with keywords: ["drones-agriculture", "contract-awards"]
- User searches later in Step 3

**Steps**:
1. Create Batch A with above keywords
2. Wait 1 hour
3. Open Step 3
4. Check Batch A header

**Expected Results**:
- ✓ Keywords displayed: "drones-agriculture, contract-awards"
- ✓ Keywords persist across sessions
- ✓ Keywords match original search
- ✓ Keywords readable (not truncated)
- ✓ Keywords clickable (opens original search if feature exists)

**Assertion**: Batch keywords correctly persisted and displayed

---

#### TC7.2: Batch Region Persistence
**Objective**: Verify batch region/filter is stored and displayed

**Setup**:
- Batch B collected with region filter: "USA, Canada"
- Filter days: 30 days

**Steps**:
1. Create Batch B with above filters
2. Navigate away and back to Step 3
3. Check Batch B header

**Expected Results**:
- ✓ Region displayed: "USA, Canada"
- ✓ Filter days displayed: "30 days"
- ✓ Data persists across sessions
- ✓ Matches original batch configuration
- ✓ Information is readable in header

**Assertion**: Batch region/filters correctly persisted

---

#### TC7.3: Status Changes Persist Across Sessions
**Objective**: Verify status changes are saved and persistent

**Setup**:
- Article in Batch A marked as "shared_with_partners"
- User closes browser and reopens application

**Steps**:
1. Share Article X with John Smith
2. Confirm save
3. Close application
4. Reopen application
5. Navigate to Step 3

**Expected Results**:
- ✓ Article X still shows "Shared with John Smith"
- ✓ Status is "shared_with_partners" (not "open")
- ✓ Status counter reflects change: no longer in "Open" count
- ✓ Change persisted to database
- ✓ No data loss across sessions

**Assertion**: Status changes are persistent

---

### Test Case Group 8: Performance & Scalability

#### TC8.1: Large Queue Performance (100+ articles)
**Objective**: Verify Step 3 performs well with large number of articles

**Setup**:
- 5 batches with 20 articles each (100 total)
- First batch expanded, others collapsed

**Steps**:
1. Open Step 3
2. Measure load time
3. Expand a large batch (20 articles)
4. Measure render time
5. Collapse and expand again
6. Scroll through queue

**Expected Results**:
- ✓ Initial load time < 2 seconds
- ✓ Expanding batch < 500ms
- ✓ Scrolling smooth (60 FPS)
- ✓ No lag when expanding/collapsing
- ✓ All 100 articles render correctly
- ✓ No memory leaks or performance degradation

**Assertion**: Step 3 handles 100+ articles efficiently

---

#### TC8.2: Many Batches (20+ batches)
**Objective**: Verify Step 3 handles many batches without performance loss

**Setup**:
- 20 batches across 3 months
- 5-10 articles per batch
- All with various statuses

**Steps**:
1. Open Step 3
2. Scroll through all batches
3. Expand several batches
4. Check performance

**Expected Results**:
- ✓ All 20 batches visible in list
- ✓ Scrolling smooth
- ✓ Expanding batches responsive
- ✓ No lag or slowdown
- ✓ UI remains responsive
- ✓ Older batches remain accessible

**Assertion**: Step 3 handles many batches (20+) efficiently

---

### Test Case Group 9: Integration with Step 2

#### TC9.1: Re-Associated Article Flows from Step 2 to Step 3
**Objective**: Verify end-to-end flow for re-associated articles

**Setup**:
- Article X from Batch A (scored 85)
- Batch B re-associates Article X
- Step 2 includes Article X (high quality)
- User selects Article X for deep-dive

**Steps**:
1. Run Step 1: Observe re-associated count
2. Run Step 2: Verify Article X appears in results
3. Run Step 3: Deep-dive Article X
4. Check Step 3 queue

**Expected Results**:
- ✓ Article X in Step 1 re-associated count
- ✓ Article X appears in Step 2 results
- ✓ User can select Article X
- ✓ Article X successfully deep-dived
- ✓ Article X appears in Step 3 under Batch B
- ✓ Article X marked as "Re-associated from Batch A"
- ✓ Full context visible

**Assertion**: Re-associated articles flow through entire pipeline

---

#### TC9.2: Low-Quality Re-Associated Article Filtered
**Objective**: Verify low-quality re-associated articles filtered in Step 2

**Setup**:
- Article Y from Batch A (scored 35, below threshold)
- Batch B re-associates Article Y
- Step 2 filters based on score

**Steps**:
1. Run Step 1: Observe Article Y as re-associated
2. Run Step 2: Check results
3. Check Step 3 queue

**Expected Results**:
- ✓ Article Y in Step 1 re-associated count
- ✓ Article Y NOT in Step 2 results (low score)
- ✓ Article Y NOT selectable
- ✓ Article Y NOT in Step 3 queue
- ✓ Batch B status counters don't include Article Y
- ✓ Quality gate working as intended

**Assertion**: Quality threshold prevents low-quality re-associated articles

---

### Test Case Group 10: UI/UX Validation

#### TC10.1: User Intuitively Understands New vs. Backlog
**Objective**: Verify design successfully communicates new vs. backlog

**Setup**:
- Step 3 with 3 batches (new + backlog)
- Show to test user unfamiliar with interface

**Steps**:
1. User opens Step 3
2. Ask: "Which articles are new from your recent search?"
3. Ask: "Can you find previously reviewed articles?"
4. Ask: "Do you know what keywords were used?"

**Expected Results**:
- ✓ User immediately identifies new articles
- ✓ User understands visual distinction
- ✓ User can locate backlog articles
- ✓ User can see batch keywords
- ✓ No confusion or questions
- ✓ User feedback: "intuitive", "clear"

**Assertion**: Design successfully communicates intent

---

#### TC10.2: Batch Collapse/Expand is Discoverable
**Objective**: Verify users discover collapse/expand without training

**Setup**:
- Step 3 with collapsed batches
- User unfamiliar with interface

**Steps**:
1. User opens Step 3
2. Ask: "How would you see all articles from the Mar 5 batch?"
3. Observe if user clicks batch header

**Expected Results**:
- ✓ User intuitively clicks batch header to expand
- ✓ Articles appear without confusion
- ✓ Collapse/expand is obvious (visual cue: chevron/arrow)
- ✓ No tooltip or help text needed
- ✓ Behavior matches web conventions

**Assertion**: Collapse/expand is discoverable and intuitive

---

#### TC10.3: Status Indicators Are Clear
**Objective**: Verify users understand article status at a glance

**Setup**:
- Article with status "Shared with John Smith"
- Article with status "Acted - Forwarded to Sales"
- Article with status "Open"

**Steps**:
1. Show article to user
2. Ask: "What's the status of this article?"
3. Repeat for each status type

**Expected Results**:
- ✓ User correctly identifies status from visual indicator
- ✓ Partner name is clear for "shared" status
- ✓ Action is clear for "acted" status
- ✓ No confusion between statuses
- ✓ Indicators are visually distinct

**Assertion**: Status indicators are clear and unambiguous

---

### Test Case Group 11: Error Handling & Edge Cases

#### TC11.1: Database Connection Error Handling
**Objective**: Verify graceful error handling for database issues

**Setup**:
- Simulate database connection failure
- User opens Step 3

**Steps**:
1. Block database connection
2. Open Step 3
3. Observe error handling

**Expected Results**:
- ✓ User sees clear error message: "Failed to load articles"
- ✓ No blank page or freeze
- ✓ Retry button offered
- ✓ No console errors exposed to user
- ✓ Logging captures error for debugging

**Assertion**: Database errors handled gracefully

---

#### TC11.2: Missing Batch Context Data
**Objective**: Verify missing batch data doesn't break display

**Setup**:
- Batch record exists but keywords/region missing
- Old batch with incomplete metadata

**Steps**:
1. Open Step 3
2. Observe batch with missing data

**Expected Results**:
- ✓ Batch still displays
- ✓ Articles still visible
- ✓ Missing keywords: Show empty or "(keywords not recorded)"
- ✓ Missing region: Show empty or "(region not recorded)"
- ✓ No error or crash
- ✓ Fallback text clear and professional

**Assertion**: Missing data doesn't break display

---

#### TC11.3: Concurrent Status Updates
**Objective**: Verify handling of simultaneous status changes

**Setup**:
- Article marked as "shared" by User A
- User B simultaneously marks same article as "acted"
- Both changes submitted

**Steps**:
1. User A shares Article X with John
2. User B acts on Article X (submitted before sync)
3. Observe conflict resolution

**Expected Results**:
- ✓ Last-write-wins OR conflict message
- ✓ Database consistency maintained
- ✓ UI shows final state correctly
- ✓ No duplicate statuses
- ✓ User A and User B see consistent state after refresh

**Assertion**: Concurrent updates handled consistently

---

## 🚀 Implementation Roadmap

### Phase 1: Backend Data Model (Day 1)
- [ ] Add fields to `opportunity_packs` table
- [ ] Create migration script
- [ ] Update deep-dive function to populate new fields
- [ ] Verify data backfill for existing records

### Phase 2: Query Layer (Day 1-2)
- [ ] Create `/api/step3/batches` endpoint
- [ ] Implement batch grouping query
- [ ] Test with various batch configurations
- [ ] Performance test with large datasets

### Phase 3: Step 2 Enhancement (Day 2)
- [ ] Modify score-articles to handle re-associated articles
- [ ] Test re-associated article flow
- [ ] Verify quality gate still functions

### Phase 4: Frontend UI (Day 2-3)
- [ ] Create `<BatchSection>` component
- [ ] Create `<BatchHeader>` component
- [ ] Create `<NewAdditionsBadge>` component
- [ ] Refactor `<Step3Panel>` to use batch grouping
- [ ] Implement collapse/expand state management

### Phase 5: Styling & UX (Day 3)
- [ ] Add CSS for batch grouping
- [ ] Implement color/visual indicators
- [ ] Auto-scroll to new additions
- [ ] Mobile responsiveness

### Phase 6: Testing (Day 3-4)
- [ ] Unit tests for batch grouping logic
- [ ] Integration tests for Step 2 → Step 3 flow
- [ ] E2E tests for user workflows
- [ ] Manual testing with all test cases
- [ ] Performance testing

### Phase 7: Documentation & Deployment (Day 4)
- [ ] Update component documentation
- [ ] Create user guide for Step 3
- [ ] Deploy to staging
- [ ] User acceptance testing
- [ ] Deploy to production

---

## 📈 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **User Confusion Rate** | 0% | "Which articles are new?" questions |
| **Time to Understand Queue** | < 10 seconds | Observational testing |
| **Batch Discovery Rate** | 100% | Users find batch keywords/region |
| **Re-Associated Article Flow** | 100% | High-quality re-associated articles reach Step 3 |
| **UI Load Time** | < 2 seconds | 100 articles, benchmarked |
| **Batch Expand/Collapse** | < 500ms | Performance measurement |
| **User Satisfaction** | > 4.5/5 | Post-release survey |

---

## 🔄 Rollback Plan

If issues are discovered post-deployment:

1. **Minor Issues** (UI glitches, cosmetic):
   - Fix and deploy hotfix

2. **Moderate Issues** (data consistency, partial failures):
   - Revert UI changes
   - Keep database schema (backwards compatible)
   - Deploy previous version of Step3Panel

3. **Critical Issues** (data loss, Step 2 breakage):
   - Immediate rollback to previous release
   - Revert Step 2 changes
   - Investigate root cause
   - Redeploy with fix after validation

---

## 🔍 Acceptance Criteria

### Must Have:
- ✅ Batches grouped and displayed with headers
- ✅ Batch keywords, region, date visible
- ✅ Current batch marked as "NEW ADDITIONS"
- ✅ Status counters accurate per batch
- ✅ Collapse/expand functionality working
- ✅ Re-associated articles appear in queue with indicator
- ✅ Quality gate prevents low-quality articles
- ✅ Data persists across sessions
- ✅ All test cases pass

### Should Have:
- ✅ Auto-scroll to new additions on load
- ✅ Visual distinction between current and backlog batches
- ✅ Status counter click filtering (future enhancement)
- ✅ Batch context tooltips

### Could Have:
- ✅ Link to original batch search
- ✅ Archive old batches
- ✅ Batch search/filter
- ✅ Timeline view mode

### Won't Have (Future):
- ❌ Re-score on demand
- ❌ Batch comparison
- ❌ Automatic re-scoring based on context change

---

## 📞 Questions & Clarifications

**Q: Should re-associated articles show in both Batch A and Batch B?**
A: No. They should only appear under the batch where they were re-associated (Batch B in our example), but with a "🔄 Re-associated from Batch A" indicator.

**Q: What happens to articles marked "deleted"?**
A: They remain in Step 3 but are heavily greyed out with a "Deleted" indicator. They can be undeleted if needed (recoverable). Show in status counter as [Deleted: X].

**Q: Can users filter by status within a batch?**
A: Not in Phase 1. Status counters are informational only. Future phase can add click-to-filter if needed.

**Q: How deep should batch context be?**
A: Show keywords, region, filter days, and batch date. Don't overload with scoring stats (keep it simple).

**Q: Should completed/archived batches auto-hide?**
A: Collapsed by default, but always accessible. Don't auto-hide; user might need to reference old articles.

---

## 👤 Stakeholders & Approval

- **Product Manager**: [To approve]
- **Engineering Lead**: [To review technical feasibility]
- **QA Lead**: [To oversee testing]
- **UX Designer**: [To validate visual design]

---

## 📝 Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Mar 10, 2026 | [AI Assistant] | Initial PRD creation |

---

## 🔗 Related Documents

- TEST_CASES_STEP3_VISIBILITY.md (previous test case analysis)
- REBUILD-GUIDE.md (system architecture reference)
- Architecture decision: Batch-grouped action queue design

