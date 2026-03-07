export type ArticleSource = "google_news" | "linkedin";

export const SOURCE_LABELS: Record<ArticleSource, string> = {
  google_news: "Google News",
  linkedin: "LinkedIn",
};

export const SOURCE_COLORS: Record<ArticleSource, string> = {
  google_news: "bg-source-gnews/15 text-source-gnews border-source-gnews/30",
  linkedin: "bg-source-linkedin/15 text-source-linkedin border-source-linkedin/30",
};

export interface CollectedArticle {
  id: string;
  keyword: string;
  url: string;
  title: string;
  publishing_agency: string | null;
  published_at: string | null;
  created_at: string;
  batch_id: string;
  source: ArticleSource;
}

export interface ScoredArticle {
  article: CollectedArticle;
  scan: ArticleScanResult;
}

export interface ArticleScanResult {
  dropReason: string | null;
  company: string | null;
  partnerOrSI: string | null;
  country: string | null;
  city: string | null;
  unitsMentioned: number | null;
  involvedParties: string[];
  dealValue: string | null;
  pocName: string | null;
  useCaseCategory: string | null;
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
  source?: ArticleSource;
}

export interface PipelineBreakdown {
  totalFetched: number;
  afterDedup: number;
  afterDateFilter: number;
  afterCap: number;
  droppedByDedup: number;
  droppedByDateFilter: number;
  droppedByCap: number;
  crossBatchDupes: number;
  newArticles: number;
}

export type LeadStatus = "open" | "shared_with_partners" | "acted_internally" | "closed" | "archived" | "duplicate" | "deleted";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  open: "Open",
  shared_with_partners: "Shared with Partner",
  acted_internally: "Added to FlytBase CRM",
  closed: "Closed",
  archived: "Archived",
  duplicate: "Duplicate",
  deleted: "Deleted",
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  open: "bg-primary/15 text-primary",
  shared_with_partners: "bg-signal-partner/15 text-signal-partner",
  acted_internally: "bg-signal-expansion/15 text-signal-expansion",
  closed: "bg-signal-contract/15 text-signal-contract",
  archived: "bg-muted text-muted-foreground",
  duplicate: "bg-destructive/15 text-destructive",
  deleted: "bg-destructive/10 text-destructive/70",
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

export const DEFAULT_FILTER_DAYS = 30;

export const FILTER_DAY_OPTIONS = [7, 14, 30, 60, 90] as const;

export const MAX_ARTICLES_STORED = 50;

export const MIN_BD_IMPACT_SCORE = 60;

export const CONTINENT_COUNTRY_MAP: Record<string, string[]> = {
  "North America": ["US", "Canada", "Mexico"],
  "Europe": ["UK", "Germany", "France", "Italy", "Spain"],
  "Asia Pacific": ["India", "Japan", "South Korea", "Singapore", "Indonesia", "China", "Australia"],
  "Middle East": ["Saudi Arabia", "UAE"],
  "Africa": ["South Africa", "Nigeria"],
  "South America": ["Brazil"],
};

export const NEWS_REGIONS = [
  "Global",
  // Continents
  "North America",
  "Europe",
  "Asia Pacific",
  "Middle East",
  "Africa",
  "South America",
  // Countries
  "US",
  "UK",
  "Canada",
  "Australia",
  "India",
  "Singapore",
  "South Africa",
  "Nigeria",
  "Spain",
  "Germany",
  "France",
  "Italy",
  "Mexico",
  "Brazil",
  "Japan",
  "South Korea",
  "Indonesia",
  "China",
  "Saudi Arabia",
  "UAE",
] as const;

export type NewsRegion = (typeof NEWS_REGIONS)[number];

export const CONTINENTS = Object.keys(CONTINENT_COUNTRY_MAP);

/** Resolve selected regions (which may include continents) to individual country labels */
export function resolveRegionsToCountries(selections: string[]): string[] {
  if (selections.includes("Global")) return ["Global"];
  const countries = new Set<string>();
  for (const sel of selections) {
    if (CONTINENT_COUNTRY_MAP[sel]) {
      CONTINENT_COUNTRY_MAP[sel].forEach(c => countries.add(c));
    } else {
      countries.add(sel);
    }
  }
  return Array.from(countries);
}