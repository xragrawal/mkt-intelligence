import { useState, useCallback } from "react";
import { Search, Loader2, Filter, AlertTriangle, Database, Eye, LayoutList, LayoutGrid, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArticleCard } from "@/components/signal/ArticleCard";
import type { CollectionRunSummary, ScoredArticle, BuyingIntentType } from "@/lib/types";
import { SIGNAL_LABELS, MIN_BD_IMPACT_SCORE } from "@/lib/types";
import { toast } from "sonner";

interface Step2PanelProps {
  collectionRun: CollectionRunSummary | null;
  scoredArticles: ScoredArticle[];
  onArticlesScored: (articles: ScoredArticle[]) => void;
  selectedArticles: ScoredArticle[];
  onSelectionChange: (articles: ScoredArticle[]) => void;
}

const ALL_INTENT_TYPES: BuyingIntentType[] = [
  "LIVE_DEPLOYMENT", "CONTRACT_AWARD", "TENDER", "PARTNER_ANNOUNCEMENT",
  "EXPANSION", "FUNDING", "REGULATION", "OTHER",
];

interface ScoringStats {
  fromCache?: number;
  preFiltered?: number;
  totalScored?: number;
  totalRelevant?: number;
}

interface DroppedArticle {
  title: string;
  reason: string;
  score?: number;
}

export function Step2Panel({
  collectionRun,
  scoredArticles,
  onArticlesScored,
  selectedArticles,
  onSelectionChange,
}: Step2PanelProps) {
  const [isScoring, setIsScoring] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [filterType, setFilterType] = useState<BuyingIntentType | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "date">("score");
  const [stats, setStats] = useState<ScoringStats | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [droppedArticles, setDroppedArticles] = useState<DroppedArticle[]>([]);
  const [showDropped, setShowDropped] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "detail">("table");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleSelect = useCallback(
    (article: ScoredArticle) => {
      const exists = selectedArticles.find((a) => a.article.id === article.article.id);
      if (exists) {
        onSelectionChange(selectedArticles.filter((a) => a.article.id !== article.article.id));
      } else {
        onSelectionChange([...selectedArticles, article]);
      }
    },
    [selectedArticles, onSelectionChange]
  );

  const handleScore = async () => {
    if (!collectionRun) return;
    setIsScoring(true);
    setProgress({ current: 0, total: collectionRun.articles_stored });
    setStats(null);
    setErrors([]);
    setDroppedArticles([]);
    const results: ScoredArticle[] = [];
    const dropped: DroppedArticle[] = [];

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/score-articles`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ batchId: collectionRun.id, minScore: MIN_BD_IMPACT_SCORE }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || `HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ") || line.trim() === "") continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.type === "progress") {
              setProgress({ current: parsed.current, total: parsed.total });
            } else if (parsed.type === "progress_note") {
              console.log("Optimization:", parsed.message);
            } else if (parsed.type === "result") {
              results.push(parsed.data);
              onArticlesScored([...results]);
            } else if (parsed.type === "dropped") {
              dropped.push({ title: parsed.title, reason: parsed.reason, score: parsed.score });
              setDroppedArticles([...dropped]);
            } else if (parsed.type === "complete") {
              setStats({
                fromCache: parsed.fromCache,
                preFiltered: parsed.preFiltered,
                totalScored: parsed.totalScored,
                totalRelevant: parsed.totalRelevant,
              });
            } else if (parsed.type === "error") {
              setErrors((prev) => [...prev, parsed.message]);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      onArticlesScored(results);
      if (results.length > 0) {
        toast.success(`Found ${results.length} relevant signals`);
      } else {
        toast.info("No relevant signals found in this batch");
      }
    } catch (e: any) {
      toast.error("Scoring failed: " + e.message);
    } finally {
      setIsScoring(false);
    }
  };

  const filtered = scoredArticles
    .filter((a) => !filterType || a.scan.buyingIntentType === filterType)
    .sort((a, b) =>
      sortBy === "score"
        ? b.scan.bdImpactScore - a.scan.bdImpactScore
        : new Date(b.article.published_at || 0).getTime() - new Date(a.article.published_at || 0).getTime()
    );

  const disabled = !collectionRun;
  const articlesToScore = collectionRun?.articles_stored || 0;

  return (
    <section className={`rounded-xl border border-border bg-card p-6 space-y-5 animate-slide-up ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-display font-bold text-primary">2</div>
          <div>
            <h2 className="text-lg font-display font-semibold text-foreground">Relevant Signals</h2>
            <p className="text-sm text-muted-foreground">
              AI-scored articles ranked by opportunity impact
              {articlesToScore > 0 && !isScoring && scoredArticles.length === 0 && (
                <span className="text-foreground"> • {articlesToScore} articles ready to score</span>
              )}
            </p>
          </div>
        </div>
        {scoredArticles.length > 0 && (
          <span className="text-sm text-muted-foreground">{selectedArticles.length} selected</span>
        )}
      </div>

      {/* Batch context */}
      {collectionRun && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{collectionRun.id}</span>
          <span>•</span>
          <span>{new Date(collectionRun.started_at).toLocaleString()}</span>
          <span>•</span>
          <span>{collectionRun.keywords.join(", ")}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleScore} disabled={isScoring || disabled || articlesToScore === 0} className="gap-2">
          {isScoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {isScoring
            ? `Scoring… (${progress.current}/${progress.total})`
            : `Score ${articlesToScore} Articles`}
        </Button>

        {scoredArticles.length > 0 && (
          <>
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={filterType || ""}
                onChange={(e) => setFilterType((e.target.value || null) as BuyingIntentType | null)}
                className="bg-muted border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All Types</option>
                {ALL_INTENT_TYPES.map((t) => (
                  <option key={t} value={t}>{SIGNAL_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "score" | "date")}
              className="bg-muted border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="score">Sort by Impact</option>
              <option value="date">Sort by Date</option>
            </select>

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
          </>
        )}
      </div>

      {/* Scoring stats summary */}
      {stats && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs rounded-lg bg-muted/50 border border-border px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <Database className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Processed</span>
            <span className="text-foreground font-medium">{stats.totalScored}</span>
          </div>
          {(stats.fromCache ?? 0) > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Cached</span>
              <span className="text-primary font-medium">{stats.fromCache}</span>
            </div>
          )}
          {(stats.preFiltered ?? 0) > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Pre-filtered</span>
              <span className="text-muted-foreground font-medium">{stats.preFiltered}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Relevant</span>
            <span className="text-primary font-bold">{stats.totalRelevant}</span>
          </div>
        </div>
      )}

      {/* Dropped articles breakdown */}
      {droppedArticles.length > 0 && (
        <div className="rounded-lg bg-muted/30 border border-border">
          <button
            onClick={() => setShowDropped(!showDropped)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5" />
              <span>{droppedArticles.length} articles dropped by AI scoring</span>
            </div>
            <span className="text-[10px]">{showDropped ? "Hide" : "Show reasons"}</span>
          </button>
          {showDropped && (
            <div className="px-4 pb-3 space-y-1.5 max-h-48 overflow-y-auto">
              {droppedArticles.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-destructive/60 shrink-0 mt-0.5">✕</span>
                  <div className="min-w-0">
                    <p className="text-foreground/70 line-clamp-1">{d.title}</p>
                    <p className="text-muted-foreground/70">
                      {d.reason}
                      {d.score !== undefined && <span className="ml-1 font-mono">(score: {d.score})</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 space-y-1">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-destructive flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {err}
            </p>
          ))}
        </div>
      )}

      {/* No results message */}
      {!isScoring && stats && scoredArticles.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">No relevant signals found in this batch.</p>
          <p className="text-xs text-muted-foreground/70">
            All {stats.totalScored} articles were scored below the relevance threshold (min score: {MIN_BD_IMPACT_SCORE}). Try collecting with different keywords.
          </p>
        </div>
      )}

      {/* TABLE VIEW */}
      {filtered.length > 0 && viewMode === "table" && (
        <div className="space-y-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-2 font-medium w-8"></th>
                <th className="py-2 pr-2 font-medium w-8">#</th>
                <th className="py-2 pr-2 font-medium">Article</th>
                <th className="py-2 pr-2 font-medium w-24">Company</th>
                <th className="py-2 pr-2 font-medium w-20">Signal</th>
                <th className="py-2 pr-2 font-medium w-14 text-center">Score</th>
                <th className="py-2 pr-2 font-medium w-16">Confidence</th>
                <th className="py-2 font-medium w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sa, i) => {
                const isSelected = !!selectedArticles.find((s) => s.article.id === sa.article.id);
                return (
                  <tr
                    key={sa.article.id}
                    className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer group ${isSelected ? "bg-primary/5" : ""}`}
                    onClick={() => toggleSelect(sa)}
                  >
                    <td className="py-2.5 pr-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="accent-primary"
                      />
                    </td>
                    <td className="py-2.5 pr-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="py-2.5 pr-2">
                      <div className="line-clamp-1 text-foreground">{sa.article.title}</div>
                      <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                        <span>{sa.article.publishing_agency || "—"}</span>
                        {sa.article.published_at && (
                          <span>{new Date(sa.article.published_at).toLocaleDateString()}</span>
                        )}
                        <a
                          href={sa.article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="opacity-0 group-hover:opacity-100 text-primary hover:underline inline-flex items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </td>
                    <td className="py-2.5 pr-2 text-foreground font-medium truncate">{sa.scan.company || "—"}</td>
                    <td className="py-2.5 pr-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 whitespace-nowrap">
                        {SIGNAL_LABELS[sa.scan.buyingIntentType]}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-2 text-center">
                      <span className="font-display font-bold text-primary tabular-nums">{sa.scan.bdImpactScore}</span>
                    </td>
                    <td className="py-2.5 pr-2 text-xs">{sa.scan.confidence}</td>
                    <td className="py-2.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === sa.article.id ? null : sa.article.id); }}
                        className="text-muted-foreground hover:text-foreground p-1"
                      >
                        {expandedId === sa.article.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Expanded detail below table */}
          {expandedId && (() => {
            const sa = filtered.find((s) => s.article.id === expandedId);
            if (!sa) return null;
            return (
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-xs">
                <p className="text-foreground">{sa.scan.whyItMatters}</p>
                <div className="flex flex-wrap gap-3 text-muted-foreground">
                  {sa.scan.country && <span>📍 {[sa.scan.city, sa.scan.country].filter(Boolean).join(", ")}</span>}
                  {sa.scan.unitsMentioned && <span>📦 {sa.scan.unitsMentioned} units</span>}
                  {sa.scan.partnerOrSI && <span>🤝 {sa.scan.partnerOrSI}</span>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* DETAIL VIEW (card-based, same as before) */}
      {filtered.length > 0 && viewMode === "detail" && (
        <div className="grid gap-3">
          {filtered.map((sa) => (
            <ArticleCard
              key={sa.article.id}
              scoredArticle={sa}
              selected={!!selectedArticles.find((s) => s.article.id === sa.article.id)}
              onToggle={() => toggleSelect(sa)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
