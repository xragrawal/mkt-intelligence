import { useState } from "react";
import { Newspaper, Loader2, CheckCircle2, AlertCircle, X, Plus, ChevronDown, ChevronUp, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DEFAULT_KEYWORDS } from "@/lib/types";
import type { CollectionRunSummary, CollectedArticle, FetchedArticleSummary, PipelineBreakdown } from "@/lib/types";
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
  const [storedArticles, setStoredArticles] = useState<CollectedArticle[]>([]);
  const [allFetched, setAllFetched] = useState<FetchedArticleSummary[]>([]);
  const [pipeline, setPipeline] = useState<PipelineBreakdown | null>(null);
  const [showStored, setShowStored] = useState(false);

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
    setStoredArticles([]);
    setAllFetched([]);
    setPipeline(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("collect-news", {
        body: { keywords },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      onRunComplete(data.run);
      if (data.articles) {
        setStoredArticles(data.articles);
        setShowStored(true);
      }
      if (data.allFetched) setAllFetched(data.allFetched);
      if (data.pipeline) setPipeline(data.pipeline);
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
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-display font-bold text-primary">1</div>
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
            <Badge key={kw} variant="secondary" className="pl-3 pr-1.5 py-1.5 text-sm font-body gap-1.5">
              {kw}
              <button onClick={() => removeKeyword(kw)} className="ml-1 rounded-full hover:bg-muted p-0.5">
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
        <Button onClick={handleCollect} disabled={isCollecting || keywords.length === 0} className="gap-2">
          {isCollecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Newspaper className="w-4 h-4" />}
          {isCollecting ? "Collecting…" : "Collect Latest News"}
        </Button>
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>

      {/* Pipeline breakdown */}
      {lastRun && pipeline && (
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/50 border border-border p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-foreground capitalize font-medium">{lastRun.status}</span>
              <span>•</span>
              <span className="font-mono">{lastRun.id}</span>
            </div>

            {/* Pipeline funnel visualization */}
            <div className="space-y-1.5">
              <PipelineRow label="Fetched from RSS" value={pipeline.totalFetched} />
              <PipelineArrow dropped={pipeline.droppedByDedup} reason="duplicates removed" />
              <PipelineRow label="After dedup" value={pipeline.afterDedup} />
              <PipelineArrow dropped={pipeline.droppedByDateFilter} reason="older than 30 days" />
              <PipelineRow label="After date filter" value={pipeline.afterDateFilter} />
              {pipeline.droppedByCap > 0 && (
                <>
                  <PipelineArrow dropped={pipeline.droppedByCap} reason="capped at 20 for MVP" />
                </>
              )}
              <PipelineRow label="Stored for scoring" value={pipeline.afterCap} variant="highlight" />
            </div>

            {lastRun.articles_stored === 0 && (
              <p className="text-xs text-destructive/80 bg-destructive/10 rounded-md px-3 py-2">
                No articles passed the pipeline. Try different keywords or check if Google News has fresh results.
              </p>
            )}
          </div>

          {/* Stored articles */}
          {storedArticles.length > 0 && (
            <ArticleTableDialog
              label={`${storedArticles.length} stored articles (sent to scoring)`}
              articles={storedArticles}
            />
          )}

          {/* All fetched articles */}
          {allFetched.length > 0 && (
            <ArticleTableDialog
              label={`${allFetched.length} total fetched articles (before filters)`}
              articles={allFetched}
            />
          )}
        </div>
      )}
    </section>
  );
}

function PipelineRow({ label, value, variant }: { label: string; value: number; variant?: "highlight" }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground text-xs w-40">{label}</span>
      <span className={`font-display font-bold tabular-nums ${variant === "highlight" ? "text-primary" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function PipelineArrow({ dropped, reason }: { dropped: number; reason: string }) {
  if (dropped === 0) return null;
  return (
    <div className="flex items-center gap-2 pl-4 text-xs text-muted-foreground/70">
      <span>↓</span>
      <span className="text-destructive/60">−{dropped}</span>
      <span>{reason}</span>
    </div>
  );
}

function ArticleTableDialog({
  label,
  articles,
}: {
  label: string;
  articles: Array<{ id: string; title: string; url: string; keyword: string; publishing_agency?: string | null; published_at?: string | null }>;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-xs">
          <Table2 className="w-3.5 h-3.5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-display">{label}</DialogTitle>
        </DialogHeader>
        <div className="overflow-auto flex-1 -mx-6 px-6">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium w-8">#</th>
                <th className="py-2 pr-3 font-medium">Title</th>
                <th className="py-2 pr-3 font-medium w-32">Source</th>
                <th className="py-2 pr-3 font-medium w-24">Keyword</th>
                <th className="py-2 font-medium w-24">Published</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a, i) => (
                <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2 pr-3 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="py-2 pr-3 text-foreground leading-snug">{a.title}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{a.publishing_agency || "—"}</td>
                  <td className="py-2 pr-3">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{a.keyword}</Badge>
                  </td>
                  <td className="py-2 text-muted-foreground tabular-nums">
                    {a.published_at ? new Date(a.published_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
