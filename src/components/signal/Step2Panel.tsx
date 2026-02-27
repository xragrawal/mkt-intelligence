import { useState, useCallback } from "react";
import { Search, Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArticleCard } from "@/components/signal/ArticleCard";
import type { CollectionRunSummary, ScoredArticle, BuyingIntentType } from "@/lib/types";
import { SIGNAL_LABELS } from "@/lib/types";
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

export function Step2Panel({
  collectionRun,
  scoredArticles,
  onArticlesScored,
  selectedArticles,
  onSelectionChange,
}: Step2PanelProps) {
  const [isScoring, setIsScoring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filterType, setFilterType] = useState<BuyingIntentType | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "date">("score");

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
    setProgress(0);
    const results: ScoredArticle[] = [];

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/score-articles`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ batchId: collectionRun.id }),
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
              setProgress(parsed.current);
            } else if (parsed.type === "result") {
              results.push(parsed.data);
              onArticlesScored([...results]);
            } else if (parsed.type === "error") {
              console.warn("Scoring error for article:", parsed.message);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      onArticlesScored(results);
      toast.success(`Scored ${results.length} relevant signals`);
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

  return (
    <section className={`rounded-xl border border-border bg-card p-6 space-y-5 animate-slide-up ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-display font-bold text-primary">
            2
          </div>
          <div>
            <h2 className="text-lg font-display font-semibold text-foreground">Relevant Signals</h2>
            <p className="text-sm text-muted-foreground">AI-scored articles ranked by opportunity impact</p>
          </div>
        </div>
        {scoredArticles.length > 0 && (
          <span className="text-sm text-muted-foreground">{selectedArticles.length} selected</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleScore}
          disabled={isScoring || disabled}
          className="gap-2"
        >
          {isScoring ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {isScoring ? `Scoring… (${progress})` : "Find Relevant Signals"}
        </Button>

        {scoredArticles.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 ml-auto">
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
          </>
        )}
      </div>

      {filtered.length > 0 && (
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
