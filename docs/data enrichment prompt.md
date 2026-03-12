# Article → Lead Intelligence Extraction — Architecture & Prompt

## Pipeline Architecture (Current)

```
Article URL
  ↓
[Jina AI Reader] — fetches full article as markdown (up to 15k chars)
  ↓
[GPT-4o] — extracts ALL contacts (named + inferred roles)
  → "From Article" table (pure LLM, never modified by Apollo)
  ↓
[Apollo mixed_people/search] — finds NEW executives at same companies
  → "Apollo Discovery" table (net-new contacts not in article)
  ↓
[Hunter.io email-verifier] — verifies all emails, marks invalid clearly
  ↓
Output: two separate tables + CSV export
```

---

## Key Design Decisions

### Two-table output
- **From Article**: Everything GPT-4o extracts — named people AND inferred decision-maker roles. Never modified after extraction.
- **Apollo Discovery**: Net-new executives Apollo found at the same companies, not named in article. Completely separate. Shows the delta/value Apollo adds.

### Inferred contacts (key differentiator vs basic extraction)
For every org mentioned — even with no named person — GPT-4o MUST create entries for likely decision-maker roles. Context drives the role type:
- Fire brigade → Kommandant / Fire Chief, Head of Drone Program
- Logistics company → Head of Operations, VP Procurement
- Inspection firm → Technical Director, Head of Inspection
- Security company → Head of Security Operations

This was validated: Comet AI found "Head of Drone Program / Commander" at Freiwillige Feuerwehr Preding when no person was named in the article. Our agent now does the same.

### Email waterfall (in priority order)
1. Email explicitly in article text → `"Verified"`
2. Named person's work email pattern (firstname.lastname@domain.com) → `"Estimated"`
3. Generic org contact (info@, operations@, contact@) from org domain → `"Estimated"`
4. No reasonable estimate → `null`, `"Not Found"`

### Apollo scope
Apollo indexes commercial & enterprise companies. Best for:
- Mid-to-large logistics, energy, utilities, infrastructure firms
- Enterprise tech, inspection service companies, security firms
- Publicly-listed or VC-backed companies with LinkedIn presence

Apollo does NOT index: volunteer orgs (fire brigades, local councils), small niche operators.
When Apollo returns 0, the UI shows an explanatory message.

### Apollo vs Hunter for email verification
- **Apollo emails**: pre-validated when indexed — generally reliable, treat as "Verified"
- **Hunter**: used to verify GPT-4o *estimated* emails via SMTP/deliverability check
- Apollo does NOT have a standalone email verification endpoint for arbitrary emails
- The two tools are complementary — Hunter is still needed for estimated emails

### Hunter result display
- `hunterVerified === true` → green **Verified** badge (overrides original confidence)
- `hunterVerified === false` → red **Invalid** badge (prominent, overrides everything)
- `hunterVerified === null` → show original confidence (Estimated / Not Found)

---

## Extraction Prompt (GPT-4o System Prompt)

You are a lead generation intelligence agent for Flytbase, a drone software platform company.
Your job: extract every possible B2B lead from the article — named individuals AND inferred decision-maker roles at every org mentioned.

### ABSOLUTE RULES
1. IGNORE DJI, DJI Enterprise, DJI employees entirely — not leads.
2. For every organization mentioned — even if no person is named — create contact entries for the most likely decision-maker roles at that org.
3. Email waterfall (as above).
4. Search training knowledge for org website/domain.
5. For named individuals: always attempt a pattern-based email estimate.

### Example (validated output)
Article: "Freiwillige Feuerwehr Preding purchased a DJI Matrice 4TD for fire suppression and SAR."
→ Output:
- { title: "Kommandant / Fire Chief", company: "Freiwillige Feuerwehr Preding", domain: "ff-preding.at", email: "info@ff-preding.at", confidence: "Estimated", priority: "High" }
- { title: "Head of Drone Program", company: "Freiwillige Feuerwehr Preding", domain: "ff-preding.at", email: "info@ff-preding.at", confidence: "Estimated", priority: "Medium" }

---

## Apollo Search Config

Endpoint: `POST /v1/mixed_people/search`

Seniorities: owner, founder, c_suite, vp, head, director, manager

Titles searched:
- CEO, CTO, COO
- Head of Operations, Head of Partnerships
- Drone Program Manager, VP Operations, Director of Operations
- Head of Innovation, Head of Security, Head of Inspection
- Business Development, Head of Technology

Per company: up to 5 results, page 1 only.

---

## Original Prompt Reference (v1 — manual / Comet-style)

Steps from original design doc:
1. Extract entities (people + companies) from article
2. Enrich missing info (website, domain, LinkedIn) via web search
3. Contact discovery waterfall (direct email → website/LinkedIn → exec emails → role emails → pattern estimate)
4. Multiple contacts per company (each as separate row)
5. Duplicate detection (same Person+Company or same Email → skip)
6. Lead qualification (type + priority score)
7. Output as Excel table
8. Quality rules (no fabricated emails; pattern → Estimated; verified source → Verified)
