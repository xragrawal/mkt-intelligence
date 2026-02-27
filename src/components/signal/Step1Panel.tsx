import { useState } from "react";
import { Newspaper, Loader2, CheckCircle2, AlertCircle, X, Plus, ChevronDown, ChevronUp, ExternalLink, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_KEYWORDS } from "@/lib/types";
import type { CollectionRunSummary, CollectedArticle } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Step1PanelProps {
  onRunComplete: (run: CollectionRunSummary) => void;
  lastRun: CollectionRunSummary | null;
}

export function Step1Panel({ onRunComplete, lastRun }: Step1PanelProps) {
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [inputValue, setInputValue] = useState("");
  const [isCollecting, setIsCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectedArticles, setCollectedArticles] = useState<CollectedArticle[]>([]);
  const [showArticles, setShowArticles] = useState(false);

  const addKeyword = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords([...keywords, trimmed]);
      setInputValue("");
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const handleCollect = async () => {
    if (keywords.length === 0) {
      toast.error("Add at least one keyword");
      return;
    }
    setIsCollecting(true);
    setError(null);
    setCollectedArticles([]);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("collect-news", {
        body: { keywords },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      onRunComplete(data.run);
      if (data.articles) {
        setCollectedArticles(data.articles);
        setShowArticles(true);
      }
      toast.success(`Stored ${data.run.articles_stored} articles (${data.run.articles_collected} fetched)`);
    } catch (e: any) {
      setError(e.message);
      toast.error("Collection failed: " + e.message);
    } finally {
      setIsCollecting(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-5 animate-slide-up">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-display font-bold text-primary">
          1
        </div>
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground">News Collection</h2>
          <p className="text-sm text-muted-foreground">Gather the latest articles from Google News RSS</p>
        </div>
      </div>

      {/* Keyword pills */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Keywords</label>
        <div className="flex flex-wrap gap-2">
          {keywords.map((kw) => (
            <Badge
              key={kw}
              variant="secondary"
              className="pl-3 pr-1.5 py-1.5 text-sm font-body gap-1.5"
            >
              {kw}
              <button
                onClick={() => removeKeyword(kw)}
                className="ml-1 rounded-full hover:bg-muted p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          <div className="flex items-center gap-1">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addKeyword()}
              placeholder="Add keyword…"
              className="bg-muted border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-36"
            />
            <Button size="sm" variant="ghost" onClick={addKeyword} className="px-2">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleCollect}
          disabled={isCollecting || keywords.length === 0}
          className="gap-2"
        >
          {isCollecting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Newspaper className="w-4 h-4" />
          )}
          {isCollecting ? "Collecting…" : "Collect Latest News"}
        </Button>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>

      {/* Run summary with pipeline breakdown */}
      {lastRun && (
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/50 border border-border p-4 space-y-3">
            {/* Pipeline funnel */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-foreground capitalize font-medium">{lastRun.status}</span>
              <span>•</span>
              <span className="font-mono">{lastRun.id}</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <PipelineStat label="Fetched from RSS" value={lastRun.articles_collected} />
              {lastRun.duplicates_removed !== undefined && (
                <PipelineStat label="Duplicates removed" value={lastRun.duplicates_removed} variant="dimmed" />
              )}
              {lastRun.after_dedup !== undefined && (
                <PipelineStat label="After dedup" value={lastRun.after_dedup} />
              )}
              {lastRun.date_filtered !== undefined && lastRun.date_filtered > 0 && (
                <PipelineStat label="Older than 7d" value={lastRun.date_filtered} variant="dimmed" />
              )}
              <PipelineStat label="Stored" value={lastRun.articles_stored} variant="highlight" />
            </div>

            {lastRun.articles_stored === 0 && (
              <p className="text-xs text-destructive/80 bg-destructive/10 rounded-md px-3 py-2">
                No articles passed the dedup + date filter. Try different keywords or check if Google News has fresh results for your terms.
              </p>
            )}
          </div>

          {/* Collected articles list */}
          {collectedArticles.length > 0 && (
            <div>
              <button
                onClick={() => setShowArticles(!showArticles)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showArticles ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {collectedArticles.length} collected articles
              </button>
              
              {showArticles && (
                <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {collectedArticles.map((a) => (
                    <div key={a.id} className="flex items-start gap-2 rounded-md bg-muted/30 border border-border/50 px-3 py-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground leading-snug line-clamp-1">{a.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-muted-foreground">
                          {a.publishing_agency && <span>{a.publishing_agency}</span>}
                          {a.published_at && (
                            <span>{new Date(a.published_at).toLocaleDateString()}</span>
                          )}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{a.keyword}</Badge>
                        </div>
                      </div>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 shrink-0 mt-0.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PipelineStat({ label, value, variant }: { label: string; value: number; variant?: "dimmed" | "highlight" }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-display font-bold text-sm tabular-nums ${
        variant === "highlight" ? "text-primary" : variant === "dimmed" ? "text-muted-foreground" : "text-foreground"
      }`}>
        {value}
      </span>
    </div>
  );
}
