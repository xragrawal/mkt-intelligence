import { useState, useEffect, useRef, useMemo } from "react";
import { Sparkles, Loader2, Trash2, Archive, Users, Briefcase, XCircle, LayoutList, LayoutGrid, ExternalLink, ChevronDown, ChevronUp, ChevronRight, Mail, Edit2, Check, AlertTriangle, RefreshCw, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OpportunityCard } from "@/components/signal/OpportunityCard";
import type { ScoredArticle, OpportunityPack, LeadStatus, BuyingIntentType, CollectionRunSummary } from "@/lib/types";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, SIGNAL_LABELS, SOURCE_LABELS, SOURCE_COLORS } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLLMProvider } from "@/lib/llm-context";

interface Step3PanelProps {
  selectedArticles: ScoredArticle[];
  enabled: boolean;
  collectionRun?: CollectionRunSummary | null;
}

interface EnrichedResult {
  articleUrl: string;
  articleTitle: string;
  pack: OpportunityPack;
  dbId?: string;
  status: LeadStatus;
  createdAt?: string;
  lastAnalyzedAt?: string | null;
  articleSource?: string | null;
  matchedPartner?: { name: string; email: string } | null;
  flytbaseMentioned?: boolean;
  scanContext?: {
    company?: string | null;
    partnerOrSI?: string | null;
    country?: string | null;
    city?: string | null;
    unitsMentioned?: number | null;
    involvedParties?: string[];
    dealValue?: string | null;
    pocName?: string | null;
    emailsMentioned?: string[];
    buyingIntentType?: string;
    confidence?: string;
    bdImpactScore?: number;
  };
  batchRef?: {
    batchId?: string;
    keywords?: string[];
    filterDays?: number;
    collectionRanAt?: string;
    regions?: string[];
    isReAssociated?: boolean;
    reAssociatedFromBatchId?: string;
  };
}

interface BatchGroup {
  batchId: string;
  label: string;
  keywords: string[];
  region: string | null;
  articles: EnrichedResult[];
  statusBreakdown: Partial<Record<LeadStatus, number>>;
  isCurrentBatch: boolean;
}

const STATUS_FILTERS: LeadStatus[] = ["open", "shared_with_partners", "acted_internally", "closed", "archived", "duplicate", "deleted"];

const EARLIER_KEY = "__earlier__";

function formatBatchDate(dateStr: string | undefined): string {
  if (!dateStr) return "Unknown Date";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateStr;
  }
}

/** Uniquely identify a result — prefer dbId, fall back to articleUrl */
function isSameResult(a: EnrichedResult, b: EnrichedResult): boolean {
  if (a.dbId && b.dbId) return a.dbId === b.dbId;
  return a.articleUrl === b.articleUrl;
}

function countByStatus(articles: EnrichedResult[]): Partial<Record<LeadStatus, number>> {
  const counts: Partial<Record<LeadStatus, number>> = {};
  for (const a of articles) {
    counts[a.status] = (counts[a.status] || 0) + 1;
  }
  return counts;
}

export function Step3Panel({ selectedArticles, enabled, collectionRun }: Step3PanelProps) {
  const [isEnriching, setIsEnriching] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<EnrichedResult[]>([]);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "detail">("table");
  const [expandedDetailId, setExpandedDetailId] = useState<string | null>(null);
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<string>("");
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [batchesInitialized, setBatchesInitialized] = useState(false);
  const { provider } = useLLMProvider();

  useEffect(() => {
    loadExistingPacks();
  }, []);

  const loadExistingPacks = async () => {
    setIsLoadingExisting(true);
    try {
      const { data, error } = await supabase
        .from("opportunity_packs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data && data.length > 0) {
          const loaded: EnrichedResult[] = data.map((row: any) => ({
          articleUrl: row.article_url,
          articleTitle: row.article_title,
          articleSource: row.article_source,
          dbId: row.id,
          status: (row.status as LeadStatus) || "open",
          createdAt: row.created_at,
          lastAnalyzedAt: row.last_analyzed_at || row.created_at,
          matchedPartner: row.matched_partner_name ? { name: row.matched_partner_name, email: row.matched_partner_email } : null,
          flytbaseMentioned: row.flytbase_mentioned || false,
          batchRef: {
            batchId: row.batch_id || undefined,
            keywords: row.keywords || undefined,
            filterDays: row.filter_days || undefined,
            collectionRanAt: row.collection_ran_at || undefined,
            regions: row.batch_region ? [row.batch_region] : undefined,
            isReAssociated: row.is_re_associated || false,
            reAssociatedFromBatchId: row.re_associated_from_batch_id || undefined,
          },
          pack: {
            companyProfile: {
              companyName: row.company_name || "Unknown",
              inferredIndustry: row.inferred_industry || "Unknown",
              deploymentRegion: row.deployment_region || "Unknown",
              likelyBuyerType: row.likely_buyer_type || "Unknown",
              maturitySignal: (row.maturity_signal as "EARLY" | "SCALING" | "ENTERPRISE_GRADE") || "EARLY",
            },
            deploymentSignal: {
              eventType: row.event_type || "Unknown",
              scale: row.scale_description || "Unknown",
              urgencyLevel: (row.urgency_level as "LOW" | "MEDIUM" | "HIGH") || "MEDIUM",
              expansionLikelihood: (row.expansion_likelihood as "LOW" | "MEDIUM" | "HIGH") || "MEDIUM",
            },
            bdOpportunityAssessment: {
              whyThisIsHot: row.why_this_is_hot || "",
              strategicEntryPoint: row.strategic_entry_point || "",
              partnershipAngle: row.partnership_angle || "",
              riskFactors: row.risk_factors || "",
              opportunityScore: row.opportunity_score || 0,
            },
            crmReadyNotes: row.crm_ready_notes || "",
          },
        }));
        setResults(loaded);
      }
    } catch (e: any) {
      console.error("Failed to load existing packs:", e);
    } finally {
      setIsLoadingExisting(false);
    }
  };

  const handleDeepDive = async () => {
    setIsEnriching(true);
    setCurrentIndex(0);

    try {
      for (let i = 0; i < selectedArticles.length; i++) {
        const sa = selectedArticles[i];
        setCurrentIndex(i + 1);

        const existingIdx = results.findIndex((r) => r.articleUrl === sa.article.url);
        if (existingIdx !== -1) {
          toast.info(`Skipping "${sa.article.title}" — already analysed`);
          continue;
        }

        const { data, error } = await supabase.functions.invoke("deep-dive", {
          body: {
            url: sa.article.url,
            title: sa.article.title,
            source: sa.article.publishing_agency,
            scanContext: sa.scan,
            llmProvider: provider,
            batchContext: collectionRun ? {
              batchId: collectionRun.id,
              keywords: collectionRun.keywords,
              regions: collectionRun.regions,
              filterDays: undefined,
              collectionRanAt: collectionRun.started_at,
              isReAssociated: !!sa.article.original_batch_id,
              reAssociatedFromBatchId: sa.article.original_batch_id || undefined,
            } : undefined,
          },
        });

        if (error) {
          toast.error(`Failed for "${sa.article.title}": ${error.message}`);
          continue;
        }

        // Gate 3 responses
        if (data?.gateStatus === "blocked") {
          toast.info(`"${sa.article.title}" was recently deleted — skipping`);
          continue;
        }
        if (data?.gateStatus === "archived") {
          toast.info(`"${sa.article.title}" is archived. Restore it from your queue to re-analyze.`);
          continue;
        }
        if (data?.gateStatus === "existing") {
          toast.info(`"${sa.article.title}" is already in your queue`);
          continue;
        }

        if (data?.pack) {
          const batchRef = collectionRun ? {
            batchId: collectionRun.id,
            keywords: collectionRun.keywords,
            regions: collectionRun.regions,
            collectionRanAt: collectionRun.started_at,
          } : undefined;
          const newResult: EnrichedResult = {
            articleUrl: sa.article.url,
            articleTitle: sa.article.title,
            articleSource: sa.article.source,
            pack: data.pack,
            dbId: data.dbId,
            status: "open",
            createdAt: new Date().toISOString(),
            lastAnalyzedAt: new Date().toISOString(),
            matchedPartner: data.matchedPartner || null,
            flytbaseMentioned: data.pack?.flytbaseMentioned || false,
            scanContext: {
              company: sa.scan.company,
              partnerOrSI: sa.scan.partnerOrSI,
              country: sa.scan.country,
              city: sa.scan.city,
              unitsMentioned: sa.scan.unitsMentioned,
              involvedParties: sa.scan.involvedParties || [],
              dealValue: sa.scan.dealValue || null,
              pocName: sa.scan.pocName || null,
              emailsMentioned: sa.scan.emailsMentioned || [],
              buyingIntentType: sa.scan.buyingIntentType,
              confidence: sa.scan.confidence,
              bdImpactScore: sa.scan.bdImpactScore,
            },
            batchRef,
          };
          setResults((prev) => [newResult, ...prev]);
          toast.success(`Analysed: ${data.pack.companyProfile.companyName}`);
        }
      }
    } catch (e: any) {
      toast.error("Enrichment error: " + e.message);
    } finally {
      setIsEnriching(false);
    }
  };

  const handleStatusChange = async (result: EnrichedResult, newStatus: LeadStatus, note?: string) => {
    if (result.dbId) {
      // Gap 10: Fetch current status_history and append new entry
      const { data: current } = await supabase
        .from("opportunity_packs")
        .select("status_history")
        .eq("id", result.dbId)
        .single();

      const history: any[] = Array.isArray(current?.status_history) ? current.status_history : [];
      history.push({ status: newStatus, changed_at: new Date().toISOString(), ...(note ? { note } : {}) });

      const { error } = await supabase
        .from("opportunity_packs")
        .update({ status: newStatus, status_updated_at: new Date().toISOString(), status_history: history })
        .eq("id", result.dbId);
      if (error) {
        toast.error("Failed to update status");
        return;
      }
    }
    setResults((prev) => prev.map((r) => (isSameResult(r, result) ? { ...r, status: newStatus } : r)));
    toast.success(`Marked as ${LEAD_STATUS_LABELS[newStatus]}`);
  };

  const handleDelete = async (result: EnrichedResult) => {
    await handleStatusChange(result, "deleted");
  };

  // Gap 6: Refresh Analysis — re-run deep-dive in place, preserve status/notes
  const handleRefreshAnalysis = async (result: EnrichedResult) => {
    if (!result.dbId) return;
    const key = result.dbId;
    setRefreshingFor(key);
    try {
      const { data, error } = await supabase.functions.invoke("deep-dive", {
        body: {
          url: result.articleUrl,
          title: result.articleTitle,
          source: result.articleSource,
          scanContext: result.scanContext,
          llmProvider: provider,
          forceRefresh: true,
          packId: result.dbId,
          batchContext: result.batchRef ? {
            batchId: result.batchRef.batchId,
            keywords: result.batchRef.keywords,
            regions: result.batchRef.regions,
            collectionRanAt: result.batchRef.collectionRanAt,
          } : undefined,
        },
      });
      if (error) throw error;
      if (data?.pack) {
        setResults((prev) => prev.map((r) =>
          r.dbId === key
            ? { ...r, pack: data.pack, lastAnalyzedAt: new Date().toISOString(), matchedPartner: data.matchedPartner || r.matchedPartner }
            : r
        ));
        toast.success("Analysis refreshed");
      }
    } catch (e: any) {
      toast.error("Refresh failed: " + e.message);
    } finally {
      setRefreshingFor(null);
    }
  };

  const handleEmailSet = async (result: EnrichedResult, email: string) => {
    const trimmed = email.trim();
    const newPartner = trimmed ? { name: trimmed, email: trimmed } : null;
    if (result.dbId) {
      const { error } = await supabase
        .from("opportunity_packs")
        .update({
          matched_partner_name: newPartner?.email || null,
          matched_partner_email: newPartner?.email || null,
        })
        .eq("id", result.dbId);
      if (error) {
        toast.error("Failed to save email");
        return;
      }
    }
    setResults((prev) => prev.map((r) => (isSameResult(r, result) ? { ...r, matchedPartner: newPartner } : r)));
    setEditingPartnerId(null);
    setEmailDraft("");
    toast.success(newPartner ? `Email set to ${newPartner.email}` : "Email cleared");
  };

  const [refreshingFor, setRefreshingFor] = useState<string | null>(null);
  const [sendingEmailFor, setSendingEmailFor] = useState<string | null>(null);

  // Gap 4: Same-company cross-card map (company_name → list of dbIds)
  const sameCompanyMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of results) {
      const company = r.pack.companyProfile.companyName?.toLowerCase().trim();
      if (!company || company === "unknown") continue;
      if (!map.has(company)) map.set(company, []);
      if (r.dbId) map.get(company)!.push(r.dbId);
    }
    return map;
  }, [results]);

  const handleSendToPartner = async (result: EnrichedResult) => {
    if (!result.matchedPartner) {
      toast.error("No contact assigned — assign one first");
      return;
    }
    const key = result.dbId || result.articleUrl;
    setSendingEmailFor(key);
    try {
      const sc = result.scanContext;
      const { data, error } = await supabase.functions.invoke("send-partner-email", {
        body: {
          // Recipient
          partnerName: result.matchedPartner.name,
          partnerEmail: result.matchedPartner.email,
          // Prospect context
          pocName: sc?.pocName || null,
          companyName: result.pack.companyProfile.companyName,
          inferredIndustry: result.pack.companyProfile.inferredIndustry,
          deploymentRegion: result.pack.companyProfile.deploymentRegion,
          country: sc?.country || null,
          eventType: result.pack.deploymentSignal.eventType,
          involvedParties: sc?.involvedParties || [],
          unitsMentioned: sc?.unitsMentioned || null,
          // Article
          articleTitle: result.articleTitle,
          articleUrl: result.articleUrl,
          // AI intelligence
          whyThisIsHot: result.pack.bdOpportunityAssessment.whyThisIsHot,
          strategicEntryPoint: result.pack.bdOpportunityAssessment.strategicEntryPoint,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Prospect email sent to ${result.matchedPartner.name}`);
        await handleStatusChange(result, "shared_with_partners");
      } else {
        toast.error(data?.error || "Failed to send email");
      }
    } catch (e: any) {
      toast.error("Email failed: " + e.message);
    } finally {
      setSendingEmailFor(null);
    }
  };

  const filteredResults = statusFilter === "all"
    ? results
    : results.filter((r) => r.status === statusFilter);

  const statusCounts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Derive batch groups from filtered results
  const batchGroups: BatchGroup[] = useMemo(() => {
    const groups = new Map<string, EnrichedResult[]>();
    for (const r of filteredResults) {
      const key = r.batchRef?.batchId || EARLIER_KEY;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    const currentBatchId = collectionRun?.id || null;

    return Array.from(groups.entries())
      .map(([batchId, articles]) => {
        const isEarlier = batchId === EARLIER_KEY;
        const dateStr = articles[0]?.batchRef?.collectionRanAt || articles[0]?.createdAt;
        return {
          batchId,
          label: isEarlier ? "Earlier Analysis" : formatBatchDate(dateStr),
          keywords: articles[0]?.batchRef?.keywords || [],
          region: articles[0]?.batchRef?.regions?.join(", ") || null,
          articles,
          statusBreakdown: countByStatus(articles),
          isCurrentBatch: batchId === currentBatchId,
        };
      })
      .sort((a, b) => {
        if (a.batchId === EARLIER_KEY) return 1;
        if (b.batchId === EARLIER_KEY) return -1;
        // Sort by date descending (newest first)
        const dateA = a.articles[0]?.batchRef?.collectionRanAt || a.articles[0]?.createdAt || "";
        const dateB = b.articles[0]?.batchRef?.collectionRanAt || b.articles[0]?.createdAt || "";
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
  }, [filteredResults, collectionRun?.id]);

  // Auto-expand current batch (or first batch) on initial load
  useEffect(() => {
    if (batchGroups.length > 0 && !batchesInitialized) {
      const toExpand = batchGroups.find(b => b.isCurrentBatch)?.batchId || batchGroups[0]?.batchId;
      if (toExpand) setExpandedBatches(new Set([toExpand]));
      setBatchesInitialized(true);
    }
  }, [batchGroups.length, batchesInitialized]);

  const toggleBatch = (batchId: string) => {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  // --- Render helpers for table/detail rows (shared across batches) ---

  const renderTableRow = (r: EnrichedResult, i: number) => {
    const sc = r.scanContext;
    const location = [sc?.city, sc?.country].filter(Boolean).join(", ") || r.pack.companyProfile.deploymentRegion || "—";
    const involvedParties = sc?.involvedParties;

    // Gap 6: Staleness — warn if last analyzed > 60 days ago
    const isStale = r.lastAnalyzedAt
      ? (Date.now() - new Date(r.lastAnalyzedAt).getTime()) > 60 * 24 * 60 * 60 * 1000
      : false;

    // Gap 4: Same-company badge
    const company = r.pack.companyProfile.companyName?.toLowerCase().trim();
    const otherCompanyCards = company && company !== "unknown"
      ? (sameCompanyMap.get(company) || []).filter(id => id !== r.dbId)
      : [];

    return (
      <tr key={r.dbId || i} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
        <td className="py-2 px-2 text-muted-foreground tabular-nums align-top">{i + 1}</td>
        <td className="py-2 px-2 align-top" style={{ maxWidth: 160 }}>
          <div className="flex flex-col gap-1">
            {r.articleSource && (
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 w-fit border ${SOURCE_COLORS[r.articleSource as keyof typeof SOURCE_COLORS] || ""}`}>
                {SOURCE_LABELS[r.articleSource as keyof typeof SOURCE_LABELS] || r.articleSource}
              </Badge>
            )}
            {isStale && (
              <span className="text-[9px] px-1.5 py-0 rounded-full bg-amber-100 text-amber-700 border border-amber-200 w-fit">
                Analysis outdated
              </span>
            )}
            {otherCompanyCards.length > 0 && (
              <span className="text-[9px] px-1.5 py-0 rounded-full bg-blue-50 text-blue-600 border border-blue-200 w-fit inline-flex items-center gap-0.5">
                <Building2 className="w-2.5 h-2.5" />
                {otherCompanyCards.length} other card{otherCompanyCards.length > 1 ? "s" : ""}
              </span>
            )}
            <a href={r.articleUrl} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-primary hover:underline text-[11px] break-words leading-tight inline-flex items-start gap-0.5">
              <span className="line-clamp-2">{r.articleTitle}</span>
              <ExternalLink className="w-2.5 h-2.5 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 text-primary" />
            </a>
          </div>
        </td>
        <td className="py-2 px-2 align-top" style={{ maxWidth: 180 }}>
          {(() => {
            const companyName = r.pack.companyProfile.companyName;
            const parties = [
              ...(companyName && companyName !== "Unknown" ? [companyName] : []),
              ...(involvedParties || []).filter((p: string) => p !== companyName),
              ...(sc?.partnerOrSI && sc.partnerOrSI !== companyName ? [sc.partnerOrSI] : []),
            ].filter(Boolean);
            const display = parties.length > 0 ? parties.join(", ") : "—";
            return (
              <div className="font-medium text-foreground break-words leading-tight line-clamp-2" title={display}>{display}</div>
            );
          })()}
        </td>
        <td className="py-2 px-2 text-foreground align-top text-[11px]" style={{ maxWidth: 160 }}>
          <div className="flex flex-col gap-0.5">
            <span>{sc?.pocName || "—"}</span>
            {sc?.emailsMentioned && sc.emailsMentioned.length > 0 && (
              <span className="text-[10px] text-muted-foreground break-all line-clamp-2" title={sc.emailsMentioned.join(", ")}>
                {sc.emailsMentioned.join(", ")}
              </span>
            )}
          </div>
        </td>
        <td className="py-2 px-2 text-foreground align-top break-words" style={{ maxWidth: 90 }}>{location}</td>
        <td className="py-2 px-2 align-top" style={{ maxWidth: 160 }}>
          {editingPartnerId === (r.dbId || r.articleUrl) ? (
            <div className="flex items-center gap-1">
              <input
                type="email"
                autoFocus
                placeholder="email@company.com"
                defaultValue={r.matchedPartner?.email || ""}
                onChange={(e) => setEmailDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEmailSet(r, emailDraft || (e.target as HTMLInputElement).value);
                  if (e.key === "Escape") { setEditingPartnerId(null); setEmailDraft(""); }
                }}
                className="w-full text-[11px] bg-background border border-border rounded px-1.5 py-0.5 text-foreground min-w-0"
              />
              <button
                onClick={() => handleEmailSet(r, emailDraft)}
                className="p-0.5 text-primary hover:text-primary/80 shrink-0"
                title="Save"
              >
                <Check className="w-3 h-3" />
              </button>
              <button onClick={() => { setEditingPartnerId(null); setEmailDraft(""); }} className="p-0.5 text-muted-foreground hover:text-foreground shrink-0" title="Cancel">
                <XCircle className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-1">
              {r.matchedPartner ? (
                <a href={`mailto:${r.matchedPartner.email}`} className="text-[11px] text-primary hover:underline break-all">{r.matchedPartner.email}</a>
              ) : (
                <span className="text-muted-foreground text-[11px]">—</span>
              )}
              <button
                onClick={() => { setEditingPartnerId(r.dbId || r.articleUrl); setEmailDraft(r.matchedPartner?.email || ""); }}
                className="p-0.5 text-muted-foreground hover:text-primary shrink-0 mt-0.5"
                title="Set email"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </td>
        <td className="py-2 px-2 align-top">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-normal leading-tight ${LEAD_STATUS_COLORS[r.status]}`}>{LEAD_STATUS_LABELS[r.status]}</span>
        </td>
        <td className="py-2 px-2 text-right align-top">
          <div className="flex flex-wrap items-center gap-0.5 justify-end">
            {r.status !== "acted_internally" && (
              <Button variant="ghost" size="sm" onClick={() => handleStatusChange(r, "acted_internally")} className="text-[10px] h-6 px-1.5 gap-1 text-muted-foreground hover:text-foreground">
                <Briefcase className="w-3 h-3" /> CRM
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!r.matchedPartner) {
                  setEditingPartnerId(r.dbId || r.articleUrl);
                  toast.info("Enter an email first, then click Email");
                } else {
                  handleSendToPartner(r);
                }
              }}
              disabled={sendingEmailFor === (r.dbId || r.articleUrl)}
              className="text-[10px] h-6 px-1.5 gap-1 text-muted-foreground hover:text-primary"
            >
              {sendingEmailFor === (r.dbId || r.articleUrl) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />} Email
            </Button>
            {r.status !== "duplicate" && (
              <Button variant="ghost" size="sm" onClick={() => handleStatusChange(r, "duplicate")} className="text-[10px] h-6 px-1.5 text-muted-foreground hover:text-destructive">
                Dup
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRefreshAnalysis(r)}
              disabled={refreshingFor === r.dbId}
              className="text-[10px] h-6 px-1.5 gap-1 text-muted-foreground hover:text-primary"
              title="Refresh analysis"
            >
              {refreshingFor === r.dbId ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(r)} className="text-[10px] h-6 px-1.5 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </Button>
            <button onClick={() => setExpandedDetailId(expandedDetailId === r.dbId ? null : r.dbId || null)} className="p-1 text-muted-foreground hover:text-foreground">
              {expandedDetailId === r.dbId ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderDetailCard = (r: EnrichedResult) => {
    const sc = r.scanContext;

    // Gap 6: Staleness
    const isStale = r.lastAnalyzedAt
      ? (Date.now() - new Date(r.lastAnalyzedAt).getTime()) > 60 * 24 * 60 * 60 * 1000
      : false;

    // Gap 4: Same-company badge
    const company = r.pack.companyProfile.companyName?.toLowerCase().trim();
    const otherCompanyCards = company && company !== "unknown"
      ? (sameCompanyMap.get(company) || []).filter(id => id !== r.dbId)
      : [];

    return (
      <div key={r.dbId || r.articleUrl} className="relative">
        {/* Gap 4+6: Staleness + same-company info bar */}
        {(isStale || otherCompanyCards.length > 0) && (
          <div className="flex items-center gap-2 px-4 py-1.5 border border-b-0 border-amber-200 rounded-t-xl bg-amber-50/60 text-xs flex-wrap">
            {isStale && (
              <span className="text-amber-700 font-medium inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Analysis is over 60 days old — consider refreshing
              </span>
            )}
            {otherCompanyCards.length > 0 && (
              <span className="text-blue-600 inline-flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {otherCompanyCards.length} other card{otherCompanyCards.length > 1 ? "s" : ""} for {r.pack.companyProfile.companyName} in your queue
              </span>
            )}
          </div>
        )}
        {/* BD context summary bar */}
        <div className={`flex flex-wrap items-center gap-3 px-4 py-2.5 border border-border text-xs ${isStale || otherCompanyCards.length > 0 ? "" : "rounded-t-xl"} bg-muted/30`}>
          {sc?.partnerOrSI && <span className="text-foreground">🤝 Involved: {sc.partnerOrSI}</span>}
          {editingPartnerId === (r.dbId || r.articleUrl) ? (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">📧</span>
              <input
                type="email"
                autoFocus
                placeholder="email@company.com"
                defaultValue={r.matchedPartner?.email || ""}
                onChange={(e) => setEmailDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEmailSet(r, emailDraft || (e.target as HTMLInputElement).value);
                  if (e.key === "Escape") { setEditingPartnerId(null); setEmailDraft(""); }
                }}
                className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 text-foreground w-48"
              />
              <button onClick={() => handleEmailSet(r, emailDraft)} className="text-primary hover:text-primary/80" title="Save"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => { setEditingPartnerId(null); setEmailDraft(""); }} className="text-muted-foreground hover:text-foreground" title="Cancel"><XCircle className="w-3.5 h-3.5" /></button>
            </div>
          ) : r.matchedPartner ? (
            <span className="text-primary font-medium inline-flex items-center gap-1">
              📧 <a href={`mailto:${r.matchedPartner.email}`} className="hover:underline">{r.matchedPartner.email}</a>
              <button onClick={() => { setEditingPartnerId(r.dbId || r.articleUrl); setEmailDraft(r.matchedPartner?.email || ""); }} className="text-muted-foreground hover:text-primary"><Edit2 className="w-3 h-3" /></button>
            </span>
          ) : (
            <button onClick={() => { setEditingPartnerId(r.dbId || r.articleUrl); setEmailDraft(""); }} className="text-muted-foreground hover:text-primary text-[11px] inline-flex items-center gap-1">
              📧 Enter email <Edit2 className="w-3 h-3" />
            </button>
          )}
          {(sc?.city || sc?.country) && <span className="text-foreground">📍 {[sc?.city, sc?.country].filter(Boolean).join(", ")}</span>}
          {sc?.unitsMentioned && <span className="text-foreground">📦 {sc.unitsMentioned} units</span>}
          {sc?.emailsMentioned && sc.emailsMentioned.length > 0 && (
            <span className="text-foreground break-all">
              📧 {sc.emailsMentioned.join(", ")}
            </span>
          )}
          {sc?.buyingIntentType && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {SIGNAL_LABELS[sc.buyingIntentType as BuyingIntentType] || sc.buyingIntentType}
            </Badge>
          )}
          {sc?.confidence && (
            <span className={`font-medium ${sc.confidence === "HIGH" ? "text-primary" : sc.confidence === "MEDIUM" ? "text-signal-funding" : "text-muted-foreground"}`}>
              {sc.confidence}
            </span>
          )}
        </div>
        <OpportunityCard articleTitle={r.articleTitle} articleUrl={r.articleUrl} articleSource={r.articleSource} pack={r.pack} />
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border bg-muted/20 rounded-b-xl flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${LEAD_STATUS_COLORS[r.status]}`}>
            {LEAD_STATUS_LABELS[r.status]}
          </span>
          {r.createdAt && (
            <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
          )}
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            {r.status !== "acted_internally" && (
              <Button variant="ghost" size="sm" onClick={() => handleStatusChange(r, "acted_internally")} className="text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                <Briefcase className="w-3.5 h-3.5" /> Add to CRM
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!r.matchedPartner) {
                  setEditingPartnerId(r.dbId || r.articleUrl);
                  toast.info("Enter an email first");
                } else {
                  handleSendToPartner(r);
                }
              }}
              disabled={sendingEmailFor === (r.dbId || r.articleUrl)}
              className="text-xs gap-1.5 text-muted-foreground hover:text-primary"
            >
              {sendingEmailFor === (r.dbId || r.articleUrl) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Email
            </Button>
            {r.status !== "duplicate" && (
              <Button variant="ghost" size="sm" onClick={() => handleStatusChange(r, "duplicate")} className="text-xs gap-1.5 text-muted-foreground hover:text-destructive">
                Mark Duplicate
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRefreshAnalysis(r)}
              disabled={refreshingFor === r.dbId}
              className="text-xs gap-1.5 text-muted-foreground hover:text-primary"
              title="Re-run deep-dive with latest intelligence"
            >
              {refreshingFor === r.dbId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(r)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // --- Render a batch section (table or detail) ---

  const renderBatchArticles = (batch: BatchGroup) => {
    const isExpanded = expandedBatches.has(batch.batchId);
    if (!isExpanded) return null;

    if (viewMode === "table") {
      return (
        <div className="overflow-x-auto px-3 pb-3">
          <table className="w-full text-xs border-collapse min-w-[750px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 px-2 font-medium">#</th>
                <th className="py-2 px-2 font-medium">Source Article</th>
                <th className="py-2 px-2 font-medium">Involved Parties</th>
                <th className="py-2 px-2 font-medium">PoC</th>
                <th className="py-2 px-2 font-medium">Location</th>
                <th className="py-2 px-2 font-medium">Email</th>
                <th className="py-2 px-2 font-medium">Status</th>
                <th className="py-2 px-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batch.articles.map((r, i) => renderTableRow(r, i))}
            </tbody>
          </table>

          {/* Expanded detail below table */}
          {expandedDetailId && (() => {
            const r = batch.articles.find((r) => r.dbId === expandedDetailId);
            if (!r) return null;
            return (
              <div className="mt-2 mb-4">
                <OpportunityCard articleTitle={r.articleTitle} articleUrl={r.articleUrl} articleSource={r.articleSource} pack={r.pack} />
              </div>
            );
          })()}
        </div>
      );
    }

    // Detail view
    return (
      <div className="space-y-6 px-3 pb-3">
        {batch.articles.map((r) => renderDetailCard(r))}
      </div>
    );
  };

  return (
    <section className={`rounded-xl border border-border bg-card p-6 space-y-5 animate-slide-up ${!enabled && results.length === 0 ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-display font-bold text-primary">3</div>
        <div className="min-w-0">
          <h2 className="text-lg font-display font-semibold text-foreground">Opportunity Intelligence</h2>
          <p className="text-sm text-muted-foreground">
            Deep analysis & CRM-ready action notes
            {enabled && selectedArticles.length > 0 && (
              <span className="text-foreground"> • {selectedArticles.length} selected</span>
            )}
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 pt-4">
        {enabled && (
          <Button
            onClick={handleDeepDive}
            disabled={isEnriching || !enabled || selectedArticles.length === 0}
            size="lg"
            className="gap-2 font-semibold"
          >
            {isEnriching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {isEnriching
              ? `Analysing ${currentIndex}/${selectedArticles.length}…`
              : `Deep Dive (${selectedArticles.length})`}
          </Button>
        )}

        {results.length > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              title="Table view"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("detail")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "detail" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              title="Detail view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Status filter tabs */}
      {results.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              statusFilter === "all" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({results.length})
          </button>
          {STATUS_FILTERS.map((s) => {
            const count = statusCounts[s] || 0;
            if (count === 0) return null;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === s ? LEAD_STATUS_COLORS[s] : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {LEAD_STATUS_LABELS[s]} ({count})
              </button>
            );
          })}
        </div>
      )}

      {isLoadingExisting && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading existing opportunities…
        </div>
      )}

      {/* BATCH-GROUPED RESULTS */}
      {batchGroups.length > 0 && (
        <div className="space-y-3">
          {batchGroups.map((batch) => {
            const isExpanded = expandedBatches.has(batch.batchId);
            return (
              <div
                key={batch.batchId}
                className={`border rounded-lg overflow-hidden transition-colors ${
                  batch.isCurrentBatch
                    ? "bg-primary/5 border-primary/30"
                    : "border-border"
                }`}
              >
                {/* Batch Header */}
                <button
                  onClick={() => toggleBatch(batch.batchId)}
                  className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">{batch.label}</span>
                      <span className="text-xs text-muted-foreground">({batch.articles.length} {batch.articles.length === 1 ? "article" : "articles"})</span>
                      {batch.isCurrentBatch && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-medium dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                          NEW ADDITIONS
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {batch.keywords.length > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          Keywords: {batch.keywords.join(", ")}
                        </span>
                      )}
                      {batch.region && (
                        <span className="text-[11px] text-muted-foreground">
                          | Region: {batch.region}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Status pills */}
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    {Object.entries(batch.statusBreakdown)
                      .filter(([, v]) => (v as number) > 0)
                      .map(([status, count]) => (
                        <span
                          key={status}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${LEAD_STATUS_COLORS[status as LeadStatus]}`}
                        >
                          {count} {LEAD_STATUS_LABELS[status as LeadStatus]}
                        </span>
                      ))}
                  </div>
                </button>

                {/* Batch Articles */}
                {renderBatchArticles(batch)}
              </div>
            );
          })}
        </div>
      )}

      {!isLoadingExisting && results.length === 0 && !isEnriching && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">No opportunity packs yet. Select articles in Step 2 and run Deep Dive.</p>
        </div>
      )}
    </section>
  );
}
