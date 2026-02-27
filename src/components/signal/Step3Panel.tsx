import { useState, useEffect } from "react";
import { Sparkles, Loader2, Trash2, Archive, Users, Briefcase, XCircle, LayoutList, LayoutGrid, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OpportunityCard } from "@/components/signal/OpportunityCard";
import type { ScoredArticle, OpportunityPack, LeadStatus, BuyingIntentType } from "@/lib/types";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, SIGNAL_LABELS } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Step3PanelProps {
  selectedArticles: ScoredArticle[];
  enabled: boolean;
}

interface EnrichedResult {
  articleUrl: string;
  articleTitle: string;
  pack: OpportunityPack;
  dbId?: string;
  status: LeadStatus;
  createdAt?: string;
  articleSource?: string | null;
  // BD context from Step 2 scoring
  scanContext?: {
    company?: string | null;
    partnerOrSI?: string | null;
    country?: string | null;
    city?: string | null;
    unitsMentioned?: number | null;
    buyingIntentType?: string;
    confidence?: string;
    bdImpactScore?: number;
  };
}

const STATUS_FILTERS: LeadStatus[] = ["open", "shared_with_partners", "acted_internally", "closed", "archived", "duplicate"];

export function Step3Panel({ selectedArticles, enabled }: Step3PanelProps) {
  const [isEnriching, setIsEnriching] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<EnrichedResult[]>([]);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "detail">("table");
  const [expandedDetailId, setExpandedDetailId] = useState<string | null>(null);

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
        const loaded: EnrichedResult[] = data.map((row) => ({
          articleUrl: row.article_url,
          articleTitle: row.article_title,
          articleSource: row.article_source,
          dbId: row.id,
          status: (row.status as LeadStatus) || "open",
          createdAt: row.created_at,
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
          },
        });

        if (error) {
          toast.error(`Failed for "${sa.article.title}": ${error.message}`);
          continue;
        }

        if (data?.pack) {
          const newResult: EnrichedResult = {
            articleUrl: sa.article.url,
            articleTitle: sa.article.title,
            articleSource: sa.article.publishing_agency,
            pack: data.pack,
            dbId: data.dbId,
            status: "open",
            createdAt: new Date().toISOString(),
            scanContext: {
              company: sa.scan.company,
              partnerOrSI: sa.scan.partnerOrSI,
              country: sa.scan.country,
              city: sa.scan.city,
              unitsMentioned: sa.scan.unitsMentioned,
              buyingIntentType: sa.scan.buyingIntentType,
              confidence: sa.scan.confidence,
              bdImpactScore: sa.scan.bdImpactScore,
            },
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

  const handleStatusChange = async (result: EnrichedResult, newStatus: LeadStatus) => {
    if (result.dbId) {
      const { error } = await supabase
        .from("opportunity_packs")
        .update({ status: newStatus })
        .eq("id", result.dbId);
      if (error) {
        toast.error("Failed to update status");
        return;
      }
    }
    setResults((prev) => prev.map((r) => (r.dbId === result.dbId ? { ...r, status: newStatus } : r)));
    toast.success(`Marked as ${LEAD_STATUS_LABELS[newStatus]}`);
  };

  const handleDelete = async (result: EnrichedResult) => {
    if (result.dbId) {
      await supabase.from("opportunity_packs").delete().eq("id", result.dbId);
    }
    setResults((prev) => prev.filter((r) => r.dbId !== result.dbId));
    toast.success("Opportunity pack removed");
  };

  const filteredResults = statusFilter === "all"
    ? results
    : results.filter((r) => r.status === statusFilter);

  const statusCounts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
      <div className="flex flex-wrap items-center gap-3">
        {enabled && (
          <Button onClick={handleDeepDive} disabled={isEnriching || !enabled || selectedArticles.length === 0} className="gap-2">
            {isEnriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
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

      {/* TABLE VIEW */}
      {filteredResults.length > 0 && viewMode === "table" && (
        <div className="space-y-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-2 font-medium w-8">#</th>
                <th className="py-2 pr-2 font-medium">Company</th>
                <th className="py-2 pr-2 font-medium w-28">Partner / SI</th>
                <th className="py-2 pr-2 font-medium w-24">Location</th>
                <th className="py-2 pr-2 font-medium w-20">Signal</th>
                <th className="py-2 pr-2 font-medium w-14 text-center">Units</th>
                <th className="py-2 pr-2 font-medium w-16">Confidence</th>
                <th className="py-2 pr-2 font-medium w-20">Status</th>
                <th className="py-2 font-medium w-36 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((r, i) => {
                const sc = r.scanContext;
                const location = [sc?.city, sc?.country].filter(Boolean).join(", ") || r.pack.companyProfile.deploymentRegion || "—";
                const intentLabel = sc?.buyingIntentType ? SIGNAL_LABELS[sc.buyingIntentType as BuyingIntentType] || sc.buyingIntentType : r.pack.deploymentSignal.eventType || "—";
                const confidence = sc?.confidence || "—";
                const partner = sc?.partnerOrSI || r.pack.bdOpportunityAssessment.partnershipAngle?.split(".")[0] || "—";
                const units = sc?.unitsMentioned;

                return (
                  <tr key={r.dbId || i} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                    <td className="py-2.5 pr-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="py-2.5 pr-2">
                      <div className="font-medium text-foreground line-clamp-1">{r.pack.companyProfile.companyName}</div>
                      <a
                        href={r.articleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary hover:underline line-clamp-1 inline-flex items-center gap-1 text-[10px]"
                      >
                        <span className="truncate max-w-[200px]">{r.articleTitle}</span>
                        <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover:opacity-100 text-primary" />
                      </a>
                    </td>
                    <td className="py-2.5 pr-2 text-foreground truncate">{partner}</td>
                    <td className="py-2.5 pr-2 text-foreground truncate">{location}</td>
                    <td className="py-2.5 pr-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 whitespace-nowrap">
                        {intentLabel}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-2 text-center tabular-nums text-foreground">{units ?? "—"}</td>
                    <td className="py-2.5 pr-2">
                      <span className={`text-[10px] font-medium ${confidence === "HIGH" ? "text-primary" : confidence === "MEDIUM" ? "text-signal-funding" : "text-muted-foreground"}`}>
                        {confidence}
                      </span>
                    </td>
                    <td className="py-2.5 pr-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${LEAD_STATUS_COLORS[r.status]}`}>
                        {LEAD_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center gap-0.5 justify-end">
                        {r.status !== "acted_internally" && (
                          <Button variant="ghost" size="sm" onClick={() => handleStatusChange(r, "acted_internally")} className="text-[10px] h-6 px-1.5 gap-1 text-muted-foreground hover:text-foreground" title="Add to FlytBase CRM">
                            <Briefcase className="w-3 h-3" /> CRM
                          </Button>
                        )}
                        {r.status !== "duplicate" && (
                          <Button variant="ghost" size="sm" onClick={() => handleStatusChange(r, "duplicate")} className="text-[10px] h-6 px-1.5 text-muted-foreground hover:text-destructive" title="Mark as Duplicate">
                            Dup
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(r)} className="text-[10px] h-6 px-1.5 text-muted-foreground hover:text-destructive" title="Delete">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                        <button
                          onClick={() => setExpandedDetailId(expandedDetailId === r.dbId ? null : r.dbId || null)}
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          {expandedDetailId === r.dbId ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Expanded detail below table */}
          {expandedDetailId && (() => {
            const r = filteredResults.find((r) => r.dbId === expandedDetailId);
            if (!r) return null;
            return (
              <div className="mt-2 mb-4">
                <OpportunityCard articleTitle={r.articleTitle} articleUrl={r.articleUrl} pack={r.pack} />
              </div>
            );
          })()}
        </div>
      )}

      {/* DETAIL VIEW */}
      {filteredResults.length > 0 && viewMode === "detail" && (
        <div className="space-y-6">
          {filteredResults.map((r) => {
            const sc = r.scanContext;
            return (
            <div key={r.dbId || r.articleUrl} className="relative">
              {/* BD context summary bar */}
              <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border border-border rounded-t-xl bg-muted/30 text-xs">
                {sc?.partnerOrSI && <span className="text-foreground">🤝 {sc.partnerOrSI}</span>}
                {(sc?.city || sc?.country) && <span className="text-foreground">📍 {[sc?.city, sc?.country].filter(Boolean).join(", ")}</span>}
                {sc?.unitsMentioned && <span className="text-foreground">📦 {sc.unitsMentioned} units</span>}
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
              <OpportunityCard articleTitle={r.articleTitle} articleUrl={r.articleUrl} pack={r.pack} />
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
                  {r.status !== "duplicate" && (
                    <Button variant="ghost" size="sm" onClick={() => handleStatusChange(r, "duplicate")} className="text-xs gap-1.5 text-muted-foreground hover:text-destructive">
                      Mark Duplicate
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(r)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
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
