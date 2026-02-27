export interface CollectedArticle {
  id: string;
  keyword: string;
  url: string;
  title: string;
  publishing_agency: string | null;
  published_at: string | null;
  created_at: string;
  batch_id: string;
}

export interface ScoredArticle {
  article: CollectedArticle;
  scan: ArticleScanResult;
}

export interface ArticleScanResult {
  isRelevant: boolean;
  dropReason: string | null;
  company: string | null;
  partnerOrSI: string | null;
  country: string | null;
  city: string | null;
  unitsMentioned: number | null;
  buyingIntentType: BuyingIntentType;
  leadClarityScore: number;
  buyingIntentScore: number;
  sourceQualityScore: number;
  bdImpactScore: number;
  whyItMatters: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export type BuyingIntentType =
  | "LIVE_DEPLOYMENT"
  | "CONTRACT_AWARD"
  | "TENDER"
  | "PARTNER_ANNOUNCEMENT"
  | "EXPANSION"
  | "FUNDING"
  | "REGULATION"
  | "OTHER";

export interface OpportunityPack {
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
    opportunityScore: number;
  };
  crmReadyNotes: string;
}

export interface CollectionRunSummary {
  id: string;
  keywords: string[];
  articles_collected: number;
  articles_stored: number;
  after_dedup?: number;
  after_date_filter?: number;
  duplicates_removed?: number;
  date_filtered?: number;
  capped?: number;
  started_at: string;
  completed_at: string | null;
  status: string;
}

export interface FetchedArticleSummary {
  id: string;
  title: string;
  url: string;
  keyword: string;
  publishing_agency: string | null;
  published_at: string | null;
}

export interface PipelineBreakdown {
  totalFetched: number;
  afterDedup: number;
  afterDateFilter: number;
  afterCap: number;
  droppedByDedup: number;
  droppedByDateFilter: number;
  droppedByCap: number;
}

export type LeadStatus = "open" | "shared_with_partners" | "acted_internally" | "closed" | "archived";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  open: "Open",
  shared_with_partners: "Shared with Partners",
  acted_internally: "Acted Internally",
  closed: "Closed",
  archived: "Archived",
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  open: "bg-primary/15 text-primary",
  shared_with_partners: "bg-signal-partner/15 text-signal-partner",
  acted_internally: "bg-signal-expansion/15 text-signal-expansion",
  closed: "bg-signal-contract/15 text-signal-contract",
  archived: "bg-muted text-muted-foreground",
};

export const SIGNAL_COLORS: Record<BuyingIntentType, string> = {
  LIVE_DEPLOYMENT: "signal-deployment",
  CONTRACT_AWARD: "signal-contract",
  TENDER: "signal-tender",
  PARTNER_ANNOUNCEMENT: "signal-partner",
  EXPANSION: "signal-expansion",
  FUNDING: "signal-funding",
  REGULATION: "signal-regulation",
  OTHER: "signal-other",
};

export const SIGNAL_LABELS: Record<BuyingIntentType, string> = {
  LIVE_DEPLOYMENT: "Live Deployment",
  CONTRACT_AWARD: "Contract Award",
  TENDER: "Tender",
  PARTNER_ANNOUNCEMENT: "Partner",
  EXPANSION: "Expansion",
  FUNDING: "Funding",
  REGULATION: "Regulation",
  OTHER: "Other",
};

export const DEFAULT_KEYWORDS = ["DJI Dock", "DJI 3"];
