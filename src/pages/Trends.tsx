import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/signal/Header";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Globe, Trash2, ExternalLink, ChevronDown, ChevronUp, BarChart3, MapPin, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface MarketTrend {
  id: string;
  use_case_category: string;
  article_id: string;
  batch_id: string;
  article_title: string;
  article_url: string;
  company: string | null;
  country: string | null;
  bd_impact_score: number | null;
  buying_intent_type: string | null;
  why_it_matters: string | null;
  flytbase_mentioned: boolean | null;
  tagged_at: string;
  tagged_by: string | null;
  notes: string | null;
}

interface UseCaseCluster {
  category: string;
  articles: MarketTrend[];
  regions: string[];
  avgScore: number;
  latestDate: string;
}

export default function Trends() {
  const [trends, setTrends] = useState<MarketTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [filterRegion, setFilterRegion] = useState<string>("");

  useEffect(() => {
    loadTrends();
  }, []);

  const loadTrends = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("market_trends")
      .select("*")
      .order("tagged_at", { ascending: false });
    if (error) {
      toast.error("Failed to load trends");
      console.error(error);
    } else {
      setTrends((data as MarketTrend[]) || []);
    }
    setLoading(false);
  };

  const removeTrend = async (id: string) => {
    const { error } = await supabase.from("market_trends").delete().eq("id", id);
    if (error) {
      toast.error("Failed to remove");
    } else {
      setTrends((prev) => prev.filter((t) => t.id !== id));
      toast.success("Removed from trends");
    }
  };

  // Cluster by use_case_category
  const clusters = useMemo(() => {
    const map = new Map<string, MarketTrend[]>();
    for (const t of trends) {
      const cat = t.use_case_category || "Uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }

    const result: UseCaseCluster[] = [];
    for (const [category, articles] of map) {
      const regions = [...new Set(articles.map((a) => a.country).filter(Boolean) as string[])];
      const scores = articles.map((a) => a.bd_impact_score || 0);
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const latestDate = articles.reduce((latest, a) => (a.tagged_at > latest ? a.tagged_at : latest), articles[0].tagged_at);
      result.push({ category, articles, regions, avgScore, latestDate });
    }

    return result.sort((a, b) => b.articles.length - a.articles.length);
  }, [trends]);

  const allRegions = useMemo(() => {
    const set = new Set<string>();
    trends.forEach((t) => t.country && set.add(t.country));
    return [...set].sort();
  }, [trends]);

  const filteredClusters = filterRegion
    ? clusters
        .map((c) => ({
          ...c,
          articles: c.articles.filter((a) => a.country === filterRegion),
        }))
        .filter((c) => c.articles.length > 0)
    : clusters;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold text-foreground">Market Trends</h1>
              <p className="text-sm text-muted-foreground">
                Emerging use cases across geographies — tagged from scored articles
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {allRegions.length > 0 && (
              <select
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                className="bg-muted border border-border rounded-md px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All Regions</option>
                {allRegions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            )}
            <Badge variant="outline" className="text-xs">
              {trends.length} articles · {clusters.length} use cases
            </Badge>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty */}
        {!loading && trends.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
            <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              No trends tagged yet. Use the <span className="text-primary font-medium">📊 Tag as Trend</span> button in Step 2 to add articles here.
            </p>
          </div>
        )}

        {/* Clusters */}
        {!loading && filteredClusters.map((cluster) => (
          <div key={cluster.category} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => setExpandedCategory(expandedCategory === cluster.category ? null : cluster.category)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-display font-semibold text-foreground">{cluster.category}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {cluster.articles.length} article{cluster.articles.length !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {cluster.regions.length > 0 ? cluster.regions.join(", ") : "Unknown"}
                    </span>
                    <span>Avg Score: {cluster.avgScore}</span>
                  </div>
                </div>
              </div>
              {expandedCategory === cluster.category ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>

            {expandedCategory === cluster.category && (
              <div className="border-t border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 px-4 font-medium">Article</th>
                      <th className="py-2 px-2 font-medium w-24">Company</th>
                      <th className="py-2 px-2 font-medium w-20">Country</th>
                      <th className="py-2 px-2 font-medium w-20">Signal</th>
                      <th className="py-2 px-2 font-medium w-14 text-center">Score</th>
                      <th className="py-2 px-2 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cluster.articles.map((t) => (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4">
                          <a
                            href={t.article_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground hover:text-primary inline-flex items-center gap-1 line-clamp-1"
                          >
                            {t.article_title}
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
                          </a>
                          {t.why_it_matters && (
                            <p className="text-muted-foreground mt-0.5 line-clamp-1">{t.why_it_matters}</p>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-foreground break-words">{t.company || "—"}</td>
                        <td className="py-2.5 px-2 text-foreground">{t.country || "—"}</td>
                        <td className="py-2.5 px-2">
                          <Badge variant="outline" className="text-[10px] px-1 py-0 whitespace-normal leading-tight">
                            {t.buying_intent_type || "—"}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className="font-display font-bold text-primary tabular-nums">{t.bd_impact_score || "—"}</span>
                        </td>
                        <td className="py-2.5 px-2">
                          <button
                            onClick={() => removeTrend(t.id)}
                            className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                            title="Remove from trends"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
