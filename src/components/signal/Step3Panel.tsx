import { useState, useEffect } from "react";
import { Sparkles, Loader2, Trash2, CheckCircle2, Archive, Users, Briefcase, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpportunityCard } from "@/components/signal/OpportunityCard";
import type { ScoredArticle, OpportunityPack, LeadStatus } from "@/lib/types";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from "@/lib/types";
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
}

const STATUS_FILTERS: LeadStatus[] = ["open", "shared_with_partners", "acted_internally", "closed", "archived"];

export function Step3Panel({ selectedArticles, enabled }: Step3PanelProps) {
  const [isEnriching, setIsEnriching] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<EnrichedResult[]>([]);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);

  // Load existing opportunity packs on mount
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
          dbId: row.id,
          status: (row.status as LeadStatus) || "open",
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
    const newResults: EnrichedResult[] = [];

    try {
      for (let i = 0; i < selectedArticles.length; i++) {
        const sa = selectedArticles[i];
        setCurrentIndex(i + 1);

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
          newResults.push({
            articleUrl: sa.article.url,
            articleTitle: sa.article.title,
            pack: data.pack,
            dbId: data.dbId,
            status: "open",
          });
        }
      }

      // Merge new results with existing, avoiding duplicates by URL
      setResults((prev) => {
        const existingUrls = new Set(prev.map((r) => r.articleUrl));
        const unique = newResults.filter((r) => !existingUrls.has(r.articleUrl));
        return [...unique, ...prev];
      });

      toast.success(`Generated ${newResults.length} opportunity packs`);
    } catch (e: any) {
      toast.error("Enrichment error: " + e.message);
    } finally {
      setIsEnriching(false);
    }
  };

  const handleStatusChange = async (index: number, newStatus: LeadStatus) => {
    const result = results[index];
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
    setResults(results.map((r, i) => (i === index ? { ...r, status: newStatus } : r)));
    toast.success(`Marked as ${LEAD_STATUS_LABELS[newStatus]}`);
  };

  const handleDelete = async (index: number) => {
    const result = results[index];
    if (result.dbId) {
      await supabase.from("opportunity_packs").delete().eq("id", result.dbId);
    }
    setResults(results.filter((_, i) => i !== index));
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
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground">Opportunity Intelligence</h2>
          <p className="text-sm text-muted-foreground">
            Deep analysis & CRM-ready action notes
            {enabled && selectedArticles.length > 0 && (
              <span className="text-foreground"> • {selectedArticles.length} articles selected for deep dive</span>
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
              : `Deep Dive on ${selectedArticles.length} Selected`}
          </Button>
        )}

        {results.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
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
      </div>

      {isLoadingExisting && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading existing opportunities…
        </div>
      )}

      {filteredResults.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            <span>{filteredResults.length} opportunity packs</span>
          </div>
          <div className="space-y-6">
            {filteredResults.map((r, i) => {
              const realIndex = results.indexOf(r);
              return (
                <div key={r.dbId || i} className="relative">
                  <OpportunityCard articleTitle={r.articleTitle} articleUrl={r.articleUrl} pack={r.pack} />
                  {/* Status & actions bar */}
                  <div className="flex items-center gap-2 px-5 py-3 border-t border-border bg-muted/20 rounded-b-xl">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${LEAD_STATUS_COLORS[r.status]}`}>
                      {LEAD_STATUS_LABELS[r.status]}
                    </span>
                    <div className="flex items-center gap-1 ml-auto">
                      {r.status !== "shared_with_partners" && (
                        <Button variant="ghost" size="sm" onClick={() => handleStatusChange(realIndex, "shared_with_partners")} className="text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                          <Users className="w-3.5 h-3.5" /> Share
                        </Button>
                      )}
                      {r.status !== "acted_internally" && (
                        <Button variant="ghost" size="sm" onClick={() => handleStatusChange(realIndex, "acted_internally")} className="text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                          <Briefcase className="w-3.5 h-3.5" /> Act
                        </Button>
                      )}
                      {r.status !== "closed" && (
                        <Button variant="ghost" size="sm" onClick={() => handleStatusChange(realIndex, "closed")} className="text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                          <XCircle className="w-3.5 h-3.5" /> Close
                        </Button>
                      )}
                      {r.status !== "archived" && (
                        <Button variant="ghost" size="sm" onClick={() => handleStatusChange(realIndex, "archived")} className="text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                          <Archive className="w-3.5 h-3.5" /> Archive
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(realIndex)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
