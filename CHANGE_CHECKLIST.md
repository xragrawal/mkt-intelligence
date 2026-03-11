# Change Deployment Checklist

**Use this checklist EVERY TIME you add, modify, or delete a field/feature across the pipeline.**

---

## Stage 1: Definition & Planning
- [ ] **Clear Requirement**: What field/feature is being added? What problem does it solve?
- [ ] **Affected Components**: Which steps (1, 2, 3, 4) does this impact?
- [ ] **Data Flow**: Trace where the data originates → where it's stored → where it's displayed
- [ ] **Write it down**: Document in this checklist so teammates see the plan before coding

---

## Stage 2: Database Schema
- [ ] **Migration Created**: New migration file with `ALTER TABLE` or `CREATE TABLE`
- [ ] **Column Definition**: Type (`TEXT`, `TEXT[]`, `JSONB`, etc.), nullable (null/not null), default value
- [ ] **Migration Applied**: Run locally & on staging/production Supabase project
- [ ] **Verify**: Use Supabase SQL editor to confirm column exists with correct type
- [ ] **TypeScript Sync**: Update `supabase/types.ts` (Row, Insert, Update sections)

---

## Stage 3: Backend Extraction & Storage
- [ ] **LLM Tool Schema**: If using LLM (Gemini, OpenAI), add field to function tool schema
- [ ] **LLM Prompt**: Add field description & rules to system prompt
- [ ] **Extraction Logic**: Write code to parse field from LLM response or data source
  ```typescript
  // Example: Extract from response
  const extractedField = response.fieldName || null;

  // Example: Extract from array (like pocName from peopleOfContact)
  const pocName = data.peopleOfContact?.[0]?.name || null;
  ```
- [ ] **Storage**: Add field to `intelligenceFields` or `insertData` object before DB insert
  ```typescript
  const intelligenceFields = {
    // ... existing fields ...
    new_field_name: extractedValue,
  };
  ```
- [ ] **Test Extraction**: Log the extracted value to console, verify it's not null for valid articles

---

## Stage 4: Frontend Type Definitions
- [ ] **Interface Update**: Add field to relevant interface in `src/lib/types.ts` or component
  ```typescript
  interface ScanContext {
    // ... existing fields ...
    newField?: string | null;
  }
  ```
- [ ] **Query Mapping**: If reading from database, add to the query response mapper
  ```typescript
  newField: row.new_field_name || null,
  ```
- [ ] **Type Safety**: Run `npm run type-check` to ensure no TypeScript errors
- [ ] **Supabase Types**: Verify `src/integrations/supabase/types.ts` has the field

---

## Stage 5: Frontend Display & Interaction
- [ ] **Read from State**: Update component to read field from state/props
  ```typescript
  const fieldValue = scanContext?.newField || "—";
  ```
- [ ] **Render in UI**: Display field in the correct location (table cell, detail panel, etc.)
- [ ] **Styling**: Match existing field styles (font size, color, alignment)
- [ ] **Edge Cases**: Handle null, empty string, long text (truncation, tooltips, etc.)
- [ ] **Responsive**: Test on mobile/tablet/desktop viewports

---

## Stage 6: Integration Tests
- [ ] **End-to-End**: Run full pipeline Step 1 → Step 2 → Step 3 → Check if field populates
- [ ] **New Data**: Test with fresh articles (not cached data)
- [ ] **Null Handling**: Test with article that has missing data — should show "—" or placeholder
- [ ] **Multiple Articles**: Test with 3+ articles to ensure data isn't bleeding between rows
- [ ] **Status Updates**: If field affects status (e.g., flags), test status change flow

---

## Stage 7: Code Review & Documentation
- [ ] **Code Review**: Share with team, explain data flow in PR description
- [ ] **Comment Code**: Add inline comments for non-obvious extraction/storage logic
- [ ] **Update Docs**: Document field in README or API docs (if applicable)
- [ ] **Memory Update**: Add field to `MEMORY.md` with storage locations & display rules

---

## Stage 8: Deployment
- [ ] **Database**: Apply migration on production Supabase
  ```bash
  supabase db push --project-ref <prod-id>
  ```
- [ ] **Backend**: Redeploy edge functions
  ```bash
  supabase functions deploy <function-name>
  ```
- [ ] **Frontend**: Deploy frontend build
  ```bash
  npm run build && npm run deploy
  ```
- [ ] **Hard Refresh**: Users must hard-refresh browser (Cmd+Shift+R)

---

## Stage 9: Post-Deployment Verification
- [ ] **Staging Test**: Run pipeline on staging environment first
- [ ] **Production Smoke Test**: Quick test on production with 1-2 articles
- [ ] **Monitor Logs**: Check Supabase function logs for errors
- [ ] **User Feedback**: Ask users if field displays correctly
- [ ] **Rollback Plan**: Know how to revert if something breaks (schema, function code, etc.)

---

## Quick Reference: Field Flow Diagram

```
Article Input
    ↓
Step 1: Collection
    ↓
Step 2: Scoring
    [LLM extracts field] ← EXTRACTION POINT
    [Stored in scored_articles]
    ↓
Step 3: Deep Dive
    [LLM re-analyzes, extracts same/different field] ← 2ND EXTRACTION POINT
    [Stored in opportunity_packs] ← DB STORAGE
    ↓
Frontend
    [Query: SELECT new_field_name FROM opportunity_packs] ← DB READ
    [TypeScript types: new_field_name in Row] ← TYPE CHECK
    [Component: {fieldValue}] ← DISPLAY
```

**Every field MUST flow through ALL stages, or it will appear as empty/null.**

---

## Example: Adding a New Field (end-to-end)

**Requirement**: Add "industry_category" to opportunity_packs

### 1. Migration
```sql
ALTER TABLE opportunity_packs ADD COLUMN industry_category TEXT DEFAULT 'Other';
```

### 2. TypeScript (supabase/types.ts)
```typescript
opportunity_packs: {
  Row: { industry_category: string | null, ... }
  Insert: { industry_category?: string | null, ... }
  Update: { industry_category?: string | null, ... }
}
```

### 3. Deep-dive Prompt
```
[industryCategory]
- Extract from inferredIndustry or eventType
- Values: Security, Logistics, Infrastructure, Agriculture, Emergency, Defense, ...
- null if unclear
```

### 4. Deep-dive Tool Schema
```typescript
const DEEP_DIVE_TOOL = {
  // ...
  properties: {
    // ...
    industryCategory: { type: ["string", "null"] }
  }
}
```

### 5. Extraction Logic (deep-dive function)
```typescript
const pack = JSON.parse(result.toolCall.arguments);

const intelligenceFields = {
  // ...
  industry_category: pack.industryCategory || null,
};
```

### 6. Frontend Type (Step3Panel.tsx)
```typescript
interface EnrichedResult {
  // ...
  scanContext: {
    industryCategory?: string | null;
  }
}
```

### 7. Load from DB
```typescript
industryCategory: row.industry_category || null,
```

### 8. Display
```typescript
<td>{sc?.industryCategory || "—"}</td>
```

### 9. Test
- Run Step 1-3 pipeline
- Verify industry_category is not null in Step 3 table
- Verify it displays in UI

---

## Common Mistakes to Avoid ❌

- ❌ Adding field to TypeScript but no database column
- ❌ Extracting field in backend but not storing (forgot to add to `intelligenceFields`)
- ❌ Adding migration but not updating TypeScript types
- ❌ Frontend displays field without reading from database
- ❌ Adding field to Step 2 only, assuming it appears in Step 3 (cross-table assumption)
- ❌ Storing field in database but never reading it in frontend query
- ❌ Testing only with cached/old data (query still returns null)
- ❌ Deploying database migration without redeploying functions (functions still use old schema)

---

## Useful Commands

```bash
# Check TypeScript for errors
npm run type-check

# Deploy migration
supabase db push

# Deploy one function
supabase functions deploy deep-dive

# Deploy all functions
supabase functions deploy

# View function logs
supabase functions list
supabase functions logs deep-dive

# Test locally (if using local DB)
supabase start
supabase functions serve

# Hard-refresh browser (required after deploy)
Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)
```

---

**Version**: 2026-03-11
**Created by**: Claude Code
**Last Updated**: After pocName/useCaseCategory fix
