# Test Cases: Step 3 Visibility for Re-Associated Articles

## Problem Statement
Currently, articles that are re-associated from previous batches (Step 1) don't appear in Step 3 unless they are:
1. **Manually selected from Step 2** — but they won't show in Step 2 if they weren't freshly scored
2. **Already in opportunity_packs table** — loaded from history only

This means 8 re-associated articles won't be actionable unless the user explicitly:
- Runs Step 2 (scoring) again with same batch
- Manually searches Step 3 history
- Previously created opportunity packs for them

---

## Root Cause Analysis

### Current Flow:
```
Step 1 (Collection)
  ↓
  └─→ New articles: Inserted with batch_id
  └─→ Re-associated articles: batch_id UPDATED but NOT rescored

Step 2 (Scoring)
  ↓
  └─→ Only scores articles from current batch that aren't in scored_articles cache
  └─→ Re-associated articles may already exist in cache = SKIPPED from display
  └─→ User can't select them for Step 3

Step 3 (Deep-Dive)
  ↓
  └─→ Takes selectedArticles from Step 2
  └─→ Re-associated articles = NOT SELECTABLE = NOT VISIBLE
  └─→ Also loads historical opportunity_packs from DB
```

### The Gap:
- **Step 2 doesn't show re-associated articles** because the scoring function filters them out (already scored)
- **Step 3 can't work with them** because they're not in selectedArticles from Step 2
- **Only workaround**: Look at historical opportunity_packs (if they were analyzed before)

---

## Test Cases (Pro Tester Perspective)

### **Test Case 1: Single Re-Associated Article Flow**
**Objective**: Verify that a single re-associated article can be discovered and actioned in Step 3

**Preconditions**:
- Batch A completed with Article X inserted (already scored in history)
- User runs Batch B that contains Article X again

**Steps**:
1. Run Step 1 with keywords that capture Article X
2. Observe: Article X shows as "re-associated" (count = 1)
3. Run Step 2 on Batch B
4. **Expected (Current)**: Article X does NOT appear in Step 2 scored results
5. **Expected (Current)**: Can't select Article X for Step 3 from fresh flow
6. **Expected (Current)**: Article X only visible in Step 3 if manually loaded from history

**Assertion**: User should be able to see and action re-associated articles without running Step 2 again

---

### **Test Case 2: Bulk Re-Associated Articles from Multiple Previous Batches**
**Objective**: Test visibility of many re-associated articles spanning different batches

**Preconditions**:
- Historical batches A, B, C completed (50 articles total stored)
- Batch D contains 30 articles, where 20 match previous content

**Steps**:
1. Run Step 1 on Batch D
2. Observe: 20 re-associated, 10 new inserted
3. Run Step 2 on Batch D
4. **Expected**: Only 10 new articles scored/displayed
5. **Expected**: 20 re-associated articles are NOT visible for selection
6. Access Step 3

**Assertion**: Step 3 should show mechanism to include re-associated articles from current batch (Batch D)

**Risk**: User thinks collection failed because only 10 articles appear in Step 2, unaware of 20 re-associated ones

---

### **Test Case 3: Re-Associated Article with Updated Context**
**Objective**: Verify that re-associated articles can be re-analyzed with new context/keywords

**Preconditions**:
- Article X collected under "drones-agriculture" in Batch A
- Same Article X appears when searching "drones-mining" in Batch B

**Steps**:
1. Run Batch A: Article X stored with keyword=["drones-agriculture"]
2. Run Batch B with keyword=["drones-mining"]: Article X detected as duplicate
3. Article X marked as re-associated
4. **Current behavior**: Article X retains old keywords, new context (mining) lost
5. Should Article X be rescored with NEW buying intent type? (EXPANSION vs LIVE_DEPLOYMENT)

**Assertion**: System should allow re-analysis of re-associated articles when context changes

---

### **Test Case 4: Re-Associated Article Already in Opportunity_Packs**
**Objective**: Test conflict resolution when article appears in both re-associated AND opportunity_packs

**Preconditions**:
- Article X from Batch A → analyzed in Step 3 → stored in opportunity_packs (status: "open")
- Batch B captures Article X again → marked as re-associated

**Steps**:
1. Run Step 1 on Batch B: Article X detected as re-associated
2. Run Step 2 on Batch B
3. Access Step 3
4. **Expected**: User sees Article X in opportunity_packs history (from Batch A analysis)
5. **Question**: Should there be a link showing "This article was also collected in Batch B"?

**Assertion**: UI should cross-reference re-associated articles with existing opportunity packs

---

### **Test Case 5: Filter/View Control - Show All Articles from Batch**
**Objective**: Test if Step 3 can display ALL articles associated with a batch (new + re-associated)

**Preconditions**:
- Batch C: 50 total articles (30 new, 20 re-associated)
- User wants overview of entire batch activity

**Steps**:
1. In Step 3, implement filter: "Show articles from Batch C"
2. **Expected**: Display all 50 articles (30 newly analyzed + 20 re-associated)
3. Differentiate visually (badge: "Re-associated from Batch X")

**Assertion**: Users should have batch-level visibility, not just newly-scored articles

---

### **Test Case 6: Scoring Staleness - Re-Associated Article with Old Score**
**Objective**: Determine if re-associated articles need re-scoring

**Preconditions**:
- Article X from Batch A: scored 2 months ago (score: 75, signal: TENDER)
- Batch B: Article X re-associated (still score: 75)
- Business context changed: Tenders now less valuable

**Steps**:
1. User requests re-evaluation of old articles in Batch B flow
2. **Current system**: No mechanism to re-score re-associated articles
3. **Question**: Should re-associated articles have a "stale" indicator?

**Assertion**: System should support opt-in re-scoring of re-associated articles

---

### **Test Case 7: Re-Associated Article with Updated Publishing Date**
**Objective**: Test handling when the same article has different publication dates

**Preconditions**:
- Article X published 2024-01-15, collected in Batch A
- Article X republished/updated 2025-03-10, appears in Batch B collection

**Steps**:
1. Dedup logic compares: same URL/ID → marked as duplicate
2. **Question**: Should updated_at timestamp trigger re-analysis?
3. Should system detect "this is fresh content, not a duplicate"?

**Assertion**: Dedup logic should account for updated content, not just ID/URL

---

### **Test Case 8: Re-Associated Article Not in Scored_Articles Cache**
**Objective**: Test recovery path for articles with missing score cache

**Preconditions**:
- Article X from Batch A: stored but scoring FAILED (crashed mid-process)
- Article X not in scored_articles table
- Batch B: Article X re-associated

**Steps**:
1. Run Step 1: Article X re-associated
2. Run Step 2 on Batch B
3. Score-articles function checks scored_articles cache → MISS
4. **Expected**: Article X should be scored now (not skipped)
5. **Assertion**: But UI still won't show it if Step 2 logic filters old articles

---

### **Test Case 9: Batch Without New Articles (Only Re-Associated)**
**Objective**: Test edge case where collection yields 0 new articles, only re-associated

**Preconditions**:
- Batch E: 15 articles collected, all 15 already exist in DB
- All 15 re-associated

**Steps**:
1. Run Step 1 on Batch E
2. Observe: "Stored for scoring: 0" | "Already in DB: 15 re-associated"
3. Run Step 2 on Batch E
4. **Expected (Current)**: Error or empty results: "No articles found for scoring"
5. **Expected (Ideal)**: UI suggests: "All articles were re-associated. View them in Step 3?"

**Assertion**: System gracefully handles batches with only re-associated articles

---

### **Test Case 10: Cross-Batch Dedup with Score Changes**
**Objective**: Test if re-associated articles should be re-scored when batch context changes

**Preconditions**:
- Article X: "Company XYZ awarded drone contract"
- Batch A keywords: ["drone-contract-awards"] → scored as LIVE_DEPLOYMENT (score: 85)
- Batch B keywords: ["drone-funding"] → same article appears

**Steps**:
1. Collect Article X in Batch B context
2. Should Article X be re-scored as FUNDING signal instead?
3. **Current behavior**: Re-associated as-is, old signal retained
4. **Question**: Should keyword context influence scoring?

**Assertion**: Batch context should affect scoring outcomes for re-associated articles

---

## Summary of Design Issues

| Issue | Impact | Severity |
|-------|--------|----------|
| Re-associated articles not visible in Step 2 | Users can't action them in current flow | **HIGH** |
| No re-scoring mechanism for context changes | Stale insights retained | **MEDIUM** |
| No visual distinction in Step 3 between new & re-associated | Confusing analytics | **MEDIUM** |
| Batch-level visibility missing | No overview of batch completeness | **MEDIUM** |
| Dedup logic doesn't account for content updates | Treats updated content as old | **LOW** |
| Edge case: batch with only re-associated articles | Confusing error state | **MEDIUM** |

---

## Proposed Solutions (To Review)

### **Option A: Show Re-Associated in Step 2**
- Fetch re-associated articles after Step 1
- Add UI toggle: "Show re-associated articles"
- Allow user to select for Step 3

### **Option B: Batch-Level Overview in Step 3**
- Add filter/view: "All articles from [Batch X]"
- Load both opportunity_packs + re-associated articles
- Show: "15 newly analyzed, 8 re-associated"

### **Option C: Re-Score on Demand**
- After Step 2, offer: "Re-score re-associated articles?"
- Enables fresh evaluation with current batch context

### **Option D: Smart Dedup + Re-Association Logic**
- Check if article content/date updated → treat as new
- Only re-associate if truly identical + same date
- Reduces false positives

### **Option E: Hybrid Approach**
1. Step 1: Show re-associated count with "View" link
2. Step 2: Optional toggle to include re-associated in scoring
3. Step 3: Display combined results with visual distinction
