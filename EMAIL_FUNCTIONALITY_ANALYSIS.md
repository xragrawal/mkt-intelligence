# Custom Email Functionality Analysis - Step 3

**Date**: March 10, 2026
**Status**: ✅ YES - Functional Email System Exists

---

## ✉️ Prospect Outreach Email — Design Brief (v2)

### Design Direction
- **Tone**: Personal, BD professional — not a marketing blast
- **Sender**: Ravikant Agrawal, Business Development, FlytBase
- **Recipient**: The prospect (POC named in article, or company team)
- **Goal**: Trigger a reply / short call — not close a deal in one email
- **Format**: Plain prose — no HTML boxes, no bullet point lists, no hyperlinks

---

### ✏️ Sample 1 — Short & Punchy (Recommended)

> **Subject:** {companyName} — {articleTitle truncated to ~60 chars}
>
> Hi {pocName || "there"},
>
> Came across the article on {companyName}'s {eventType in plain English — e.g., "drone deployment expansion in {country}"} — {whyThisIsHot rephrased as one plain sentence about what the prospect is doing, not FlytBase's take}.
>
> I'm Ravikant from the Business Development team at FlytBase — {CUSTOM INTRO: see options below}. {NAME DROP: see recommendation below}.
>
> {strategicEntryPoint rephrased as: "The part that stood out to me:" + one sentence on the gap they're likely running into — framed from their perspective, not as a pitch.}
>
> Would a short call make sense? Happy to share how teams in {inferredIndustry} across {deploymentRegion} are approaching this.
>
> Thanks,
> Ravikant Agrawal
> Business Development, FlytBase
> ravikant.agrawal@flytbase.com
>
> Article reference: {articleUrl on its own line — no hyperlink anchor text}

---

### 🔧 FlytBase Intro — Custom vs Generic

**The problem with a generic intro:**
> "We build the software layer that powers autonomous drone operations at scale — fleet management, mission automation, and remote monitoring."

That reads like a website header. The prospect doesn't care about fleet management in the abstract.

**Recommended approach — mirror their use case back:**

The `inferredIndustry` + `eventType` fields give us enough context for the AI (deep-dive prompt) to generate a one-sentence intro that directly names what the prospect is trying to do, then positions FlytBase as the specific thing that makes that possible.

**Draft patterns by use case:**

| Signal / Industry | Custom Intro |
|---|---|
| Infrastructure inspection | "We help infrastructure teams like yours run drone inspection programs without a dedicated pilot for every site." |
| Logistics / delivery | "We're the operations layer that logistics teams use to run drone delivery at scale — from dispatch through compliance." |
| Security / surveillance | "We power the autonomous operations backend for enterprise security drone programs — persistent coverage, zero manual tasking." |
| Government / defense | "We work with public sector teams running BVLOS programs — from mission authorization through real-time C2." |
| Agriculture | "We help agri teams scale beyond the single-operator model — scheduled missions, multi-field coverage, automated reporting." |

→ **Implementation**: the deep-dive AI prompt should generate a `customFlytbaseIntro` field (1 sentence) using `inferredIndustry` + `eventType` as context. This replaces the hard-coded intro.

---

### 💡 Name-Drop Recommendation

**Should we name-drop? YES** — for a cold email to someone who doesn't know FlytBase, a name-drop provides instant credibility and filters for relevance ("oh, we use that hardware/we know that company").

**Best candidates (in priority order):**

1. **Hardware OEM (highest relevance)** — if the article mentions or implies specific hardware:
   - "We're natively integrated with DJI Enterprise, Skydio, and Autel — so if you're running any of those, there's no rip-and-replace."
   - Tie to `scanContext.involvedParties` — if a hardware brand is mentioned, reference it directly.

2. **Peer industry reference** — drop a known company in the same vertical:
   - "We've worked with teams doing similar [inspection/delivery/security] programs at [Peer Company Name]."
   - Requires a curated list per `inferredIndustry` — suggest building a small lookup table.

3. **Scale/geography signal** — if you can't name a company:
   - "We're deployed across {deploymentRegion} — {country} operators in particular are a big part of our base."
   - Uses `deploymentRegion` / `country` directly from the scan.

4. **Investor/backer name-drop** (use sparingly, for enterprise/government audience):
   - "FlytBase is backed by [investor name] — we've been building this specifically for enterprise-scale programs."

**Recommendation for MVP**: Use option 1 (hardware OEM) when `involvedParties` contains a known hardware brand, option 3 (region signal) as universal fallback. Option 2 (peer company) requires a curated table — worth building in v2.

---

### 📊 Data Field → Email Section Mapping

| Email Section | Data Field | Notes |
|---|---|---|
| Subject line | `companyName` + `articleTitle` | Truncate title to ~60 chars |
| Article context sentence | `articleTitle` + `eventType` + `country` | Plain prose, no hyperlink in body |
| Article URL | `articleUrl` | Pasted at bottom, own line |
| Recipient name | `scanContext.pocName` | Fallback: "Hi there" |
| Custom FlytBase intro | AI-generated `customFlytbaseIntro` | From `inferredIndustry` + `eventType` |
| Name-drop | `scanContext.involvedParties` or `deploymentRegion` | Hardware OEM first, region fallback |
| "The gap I noticed" | `strategicEntryPoint` | Reframed from FlytBase pitch → prospect problem |
| Peer comparison close | `inferredIndustry` + `deploymentRegion` | "teams in X doing Y" |
| Signature | Static | Ravikant Agrawal, BD, FlytBase |

---

### ❓ Open Questions Before Implementation

- [ ] **Confirm sender name/title**: "Business Development" or a specific title?
- [ ] **Hardware name-drop list**: Which OEM names are OK to reference by name? (DJI, Skydio, Autel, Percepto, others?)
- [ ] **Peer company lookup table**: Do we build this, or rely on AI to infer from `inferredIndustry`?
- [ ] **Separate button or replace**: "Email Prospect" as a new button, or replace the existing partner email?
- [ ] **Subject line style**: `{companyName} — {article snippet}` or `Re: {article title}` (Re: feels like reply thread — higher open rate but slightly deceptive)?

---

---

## 📧 Current Email Implementation

### **Yes, Custom Email Functionality EXISTS**

Your Step 3 already has a **fully functional, context-aware email system** that sends personalized emails to partners with article intelligence extracted from the AI analysis.

---

## 🏗️ Architecture Overview

### **Frontend Trigger (Step3Panel.tsx)**
```
User clicks "Email Partner" button
    ↓
Handler: handleSendToPartner(result)
    ↓
Invokes Supabase Edge Function: send-partner-email
    ↓
SMTP transporter sends formatted email
    ↓
Updates status to "shared_with_partners"
```

---

## 📬 Email Payload (What Gets Sent)

The system sends **13 contextual data points** to the email function:

```typescript
{
  // Partner Information
  partnerName: string;              // Name of the person receiving email
  partnerEmail: string;             // Email address to send to
  
  // Company/Opportunity Information
  companyName: string;              // Target company name
  inferredIndustry: string;         // Industry vertical (e.g., "Logistics", "Agriculture")
  deploymentRegion: string;         // Geographic region (e.g., "USA", "UAE")
  eventType: string;                // Signal type (e.g., "CONTRACT_AWARD", "EXPANSION")
  
  // Article Context
  articleTitle: string;             // News headline
  articleUrl: string;               // Link to source
  articleSource: string;            // Source platform (Google News, LinkedIn, etc.)
  
  // AI-Generated Intelligence
  whyThisIsHot: string;            // AI's analysis of opportunity relevance
  strategicEntryPoint: string;     // How to approach the opportunity
  partnershipAngle: string;         // Partnership positioning
  opportunityScore: number;         // 0-100 quality rating
  
  // CRM Notes
  crmReadyNotes: string;           // Additional context for CRM entry
}
```

---

## 🎨 Email Template Features

### **HTML Email Design**

The email template is **professionally styled** with:

1. **Header Section**
   - Branded gradient background (dark blue)
   - "🎯 Opportunity Intelligence" title
   - "FlytBase BD Signal" subtitle

2. **Company Details Table**
   - Company Name
   - Industry (if available)
   - Region (if available)
   - Signal Type (if available)
   - Opportunity Score (e.g., 85/100)

3. **AI Intelligence Sections** (Colored boxes)
   
   **Why This Is Hot** (Green box)
   - AI's reasoning for opportunity relevance
   
   **Strategic Entry Point** (Blue box)
   - How to approach the opportunity
   
   **Partnership Angle** (Purple box)
   - Partnership positioning/messaging
   
   **CRM Notes** (Light gray box)
   - Additional context for sales team

4. **Call-to-Action**
   - "Read Source Article →" button with link to original news

5. **Footer**
   - "Generated by FlytBase Signal Intelligence"
   - Source attribution

---

## 📊 Example Email Output

```
═══════════════════════════════════════════════════════════════

    🎯 OPPORTUNITY INTELLIGENCE
       FlytBase BD Signal

═══════════════════════════════════════════════════════════════

Hi John,

We've identified a new opportunity that matches your region and expertise:

┌─────────────────────────────────────────────────────────────┐
│ Company          │ DJI Dock Logistics                      │
│ Industry         │ Logistics & Delivery                    │
│ Region           │ USA, Canada                             │
│ Signal           │ CONTRACT_AWARD                          │
│ Score            │ 88/100                                  │
└─────────────────────────────────────────────────────────────┘

✅ WHY THIS IS HOT
DJI Dock announced a major government contract for drone delivery 
in partnership with USPS, signaling mature market adoption and 
significant budget allocation.

💡 STRATEGIC ENTRY POINT
Position FlytBase's autonomous dock operations to handle multi-site 
deployments, emphasize cost reduction vs. DJI's solution.

🤝 PARTNERSHIP ANGLE
Propose integration partnership where FlytBase provides deployment 
logistics while DJI provides hardware—complementary positioning.

📋 CRM NOTES
This is a WARM LEAD. Government budget is confirmed. Decision-maker 
is Sarah Chen (VP Operations). Budget available Q2 2026.

[Read Source Article →]

─────────────────────────────────────────────────────────────
Generated by FlytBase Signal Intelligence | Source: Google News
═══════════════════════════════════════════════════════════════
```

---

## 🔧 How It Works (Step-by-Step)

### **Step 1: User Selects Partner**
```tsx
r.matchedPartner = { name: "John Smith", email: "john@partner.com" }
```

### **Step 2: User Clicks "Email Partner"**
```tsx
Button "Email Partner" → handleSendToPartner(result)
```

### **Step 3: Data Collected from AI Analysis**
```
companyName: result.pack.companyProfile.companyName
inferredIndustry: result.pack.companyProfile.inferredIndustry
deploymentRegion: result.pack.companyProfile.deploymentRegion
eventType: result.pack.deploymentSignal.eventType
whyThisIsHot: result.pack.bdOpportunityAssessment.whyThisIsHot
strategicEntryPoint: result.pack.bdOpportunityAssessment.strategicEntryPoint
partnershipAngle: result.pack.bdOpportunityAssessment.partnershipAngle
opportunityScore: result.pack.bdOpportunityAssessment.opportunityScore
crmReadyNotes: result.pack.crmReadyNotes
```

### **Step 4: Supabase Edge Function Called**
```
POST /functions/v1/send-partner-email
Body: { all 13 data points }
```

### **Step 5: SMTP Server Sends Email**
```
Using configured SMTP credentials:
- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASS
```

### **Step 6: Status Auto-Updated**
```
Article status: "open" → "shared_with_partners"
Toast notification: "Email sent to John Smith"
```

---

## 🔐 Environment Requirements

For email functionality to work, these env vars must be set in Supabase Edge Function secrets:

```env
SMTP_HOST=smtp.gmail.com        # SMTP server
SMTP_PORT=587                   # Port (25, 587, or 465)
SMTP_USER=your-email@gmail.com  # Sender email
SMTP_PASS=your-app-password     # App-specific password (Gmail) or SMTP password
```

---

## 💡 What Makes It "Custom"

This is **not a generic email** — it's highly contextual:

✅ **Partner Name Personalization**
- "Hi [Partner Name]," greeting

✅ **Company-Specific Content**
- Company name, industry, region in email

✅ **AI-Extracted Intelligence**
- Why it's hot (AI analysis)
- Strategic entry point (AI recommendation)
- Partnership angle (AI positioning)

✅ **Opportunity Scoring**
- Quality score (0-100) visible in email

✅ **CRM-Ready Context**
- Structured data for sales team input

✅ **Dynamic Content**
- Only includes sections where data exists
- Skips empty/null fields

✅ **Source Attribution**
- Link to original article
- Source platform identified

---

## 🎯 Current Features

| Feature | Status | Details |
|---------|--------|---------|
| Partner email sending | ✅ Working | Fully functional with SMTP |
| Personalized greeting | ✅ Working | Uses partner name |
| Company context | ✅ Working | Name, industry, region included |
| AI intelligence sections | ✅ Working | 4 colored sections (Why/Entry/Angle/CRM) |
| Opportunity scoring | ✅ Working | Score displayed as 0-100 |
| Source article link | ✅ Working | CTA button with URL |
| HTML email template | ✅ Working | Professional styling with colors |
| Status auto-update | ✅ Working | Marks as "shared_with_partners" |
| Partner assignment | ✅ Working | Dropdown selector in UI |
| Partner edit | ✅ Working | Change partner before sending |
| Error handling | ✅ Working | Toast notifications |

---

## 📋 Enhancement Opportunities

| Feature | Current Status | Complexity |
|---------|--------|-----------|
| Email preview before send | ❌ Not implemented | Medium |
| Custom email body editor | ❌ Not implemented | High |
| Email templates (multiple) | ❌ Not implemented | High |
| Email scheduling/delay | ❌ Not implemented | Medium |
| Email tracking (opens/clicks) | ❌ Not implemented | High |
| CC/BCC support | ❌ Not implemented | Low |
| Multiple recipient selection | ❌ Not implemented | Medium |
| Email history/log | ❌ Partial (status only) | Medium |
| Automatic email on "shared" status | ❌ Not implemented | Low |
| A/B testing subject lines | ❌ Not implemented | High |
| Dynamic content blocks | ❌ Not implemented | Medium |

---

## 🚀 Recommended Quick Enhancements

### **Quick Wins (1-2 hours each)**

1. **Email Preview Modal**
   - Show formatted email before sending
   - Allow last-minute edits to partner name

2. **CC/BCC Support**
   - Add optional CC field
   - Useful for team reviews

3. **Subject Line Customization**
   - Allow editing before send
   - Currently: "🚀 New Opportunity: [Company] — [Event]"

### **Medium Effort (4-8 hours)**

4. **Email History Table**
   - Show sent emails per article
   - Date/time sent, recipient, status

5. **Multiple Recipients**
   - Select multiple partners
   - Send to all with one click

6. **Email Scheduling**
   - Queue email for later
   - Set send time/date

---

## 🧪 Testing the Email Feature

### **Prerequisites:**
```bash
1. Set SMTP credentials in Supabase secrets
2. Create test partner in flytbase_partners table
3. Have an article in Step 3 queue
```

### **Test Steps:**
```
1. Open Step 3
2. Select an article (expand to see details)
3. Click "Assign Partner" (Edit icon)
4. Select a partner from dropdown
5. Click "Email Partner" button
6. Check recipient's inbox
7. Verify status changed to "shared_with_partners"
```

### **Expected Email Contents:**
```
✓ Subject: 🚀 New Opportunity: [Company] — [Signal]
✓ Greeting: Hi [Partner Name],
✓ Company table with: Name, Industry, Region, Signal, Score
✓ Why This Is Hot section (green box)
✓ Strategic Entry Point section (blue box)
✓ Partnership Angle section (purple box)
✓ CRM Notes section (gray box)
✓ Read Source Article button
✓ Footer with source attribution
```

---

## 📝 Summary

**YES** — Your Step 3 has a fully functional, context-aware, AI-leveraged custom email system that:

1. ✅ Takes article intelligence from AI analysis
2. ✅ Personalizes with partner name and company details
3. ✅ Includes AI-generated insights (why hot, strategy, partnership angle)
4. ✅ Formats as professional HTML email with color-coded sections
5. ✅ Sends via configured SMTP server
6. ✅ Auto-updates article status to "shared_with_partners"
7. ✅ Provides immediate feedback to user via toast notifications

**The system is production-ready** and works as designed. Future enhancements would focus on email preview, custom templates, and tracking capabilities.

