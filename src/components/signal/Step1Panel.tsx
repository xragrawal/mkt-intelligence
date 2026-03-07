import { useState, useMemo } from "react";
import { Newspaper, Loader2, CheckCircle2, AlertCircle, X, Plus, Table2, ExternalLink, Clock, CalendarDays, Globe, Linkedin, Filter, FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_KEYWORDS, DEFAULT_FILTER_DAYS, FILTER_DAY_OPTIONS, MAX_ARTICLES_STORED, NEWS_REGIONS } from "@/lib/types";
import type { CollectionRunSummary, CollectedArticle, FetchedArticleSummary, PipelineBreakdown, NewsRegion } from "@/lib/types";
import { SourceBadge } from "@/components/signal/SourceBadge";
import { toast } from "sonner";

interface Step1PanelProps {
  onRunComplete: (run: CollectionRunSummary) => void;
  lastRun: CollectionRunSummary | null;
}

interface LastRunInfo {
  id: string;
  completedAt: string;
  articlesStored: number;
  articlesCollected: number;
}

export function Step1Panel({ onRunComplete, lastRun }: Step1PanelProps) {
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [inputValue, setInputValue] = useState("");
  const [filterDays, setFilterDays] = useState(DEFAULT_FILTER_DAYS);
  const [region, setRegion] = useState<NewsRegion>("Global");
  const [isCollecting, setIsCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storedArticles, setStoredArticles] = useState<(CollectedArticle | FetchedArticleSummary)[]>([]);
  const [allFetched, setAllFetched] = useState<FetchedArticleSummary[]>([]);
  const [pipeline, setPipeline] = useState<PipelineBreakdown | null>(null);
  const [lastRunInfo, setLastRunInfo] = useState<LastRunInfo | null>(null);

  // Source toggles
  const [useGoogleNews, setUseGoogleNews] = useState(true);
  const [useLinkedIn, setUseLinkedIn] = useState(false);

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
    if (!useGoogleNews && !useLinkedIn) {
      toast.error("Enable at least one source");
      return;
    }

    setIsCollecting(true);
    setError(null);
    setStoredArticles([]);
    setAllFetched([]);
    setPipeline(null);
    setLastRunInfo(null);

    const allStoredArticles: (CollectedArticle | FetchedArticleSummary)[] = [];
    const allFetchedArticles: FetchedArticleSummary[] = [];
    let combinedPipeline: PipelineBreakdown = {
      totalFetched: 0, afterDedup: 0, afterDateFilter: 0, afterCap: 0,
      droppedByDedup: 0, droppedByDateFilter: 0, droppedByCap: 0,
      crossBatchDupes: 0, newArticles: 0,
    };
    let lastCompletedRun: CollectionRunSummary | null = null;

    try {
      // Run Google News collection (use raw fetch with extended timeout for Global region)
      if (useGoogleNews) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min timeout
        
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collect-news`;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ keywords, filterDays, region }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(errText || `HTTP ${resp.status}`);
        }
        const data = await resp.json();

        if (data?.error) throw new Error(data.error);
        if (data?.error) throw new Error(data.error);

        lastCompletedRun = data.run;
        if (data.articles) allStoredArticles.push(...data.articles);
        if (data.allFetched) allFetchedArticles.push(...data.allFetched);
        if (data.pipeline) {
          combinedPipeline.totalFetched += data.pipeline.totalFetched;
          combinedPipeline.afterDedup += data.pipeline.afterDedup;
          combinedPipeline.afterDateFilter += data.pipeline.afterDateFilter;
          combinedPipeline.afterCap += data.pipeline.afterCap;
          combinedPipeline.droppedByDedup += data.pipeline.droppedByDedup;
          combinedPipeline.droppedByDateFilter += data.pipeline.droppedByDateFilter;
          combinedPipeline.droppedByCap += data.pipeline.droppedByCap;
        }
        if (data.lastRunForKeywords) setLastRunInfo(data.lastRunForKeywords);
      }

      // Run LinkedIn collection
      if (useLinkedIn) {
        try {
          const liController = new AbortController();
          const liTimeoutId = setTimeout(() => liController.abort(), 120000); // 2 min timeout
          const liUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collect-linkedin`;
          const liResp = await fetch(liUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ keywords, filterDays }),
            signal: liController.signal,
          });
          clearTimeout(liTimeoutId);

          if (!liResp.ok) {
            const errText = await liResp.text();
            toast.error("LinkedIn collection failed: " + (errText || `HTTP ${liResp.status}`));
          } else {
            const data = await liResp.json();
            if (data?.error) {
              toast.error("LinkedIn: " + data.error);
            } else {
              // Merge LinkedIn results
              if (!lastCompletedRun) lastCompletedRun = data.run;
              else {
                lastCompletedRun = {
                  ...lastCompletedRun,
                  articles_collected: lastCompletedRun.articles_collected + (data.run?.articles_collected || 0),
                  articles_stored: lastCompletedRun.articles_stored + (data.run?.articles_stored || 0),
                };
              }
              if (data.articles) allStoredArticles.push(...data.articles);
              if (data.allFetched) allFetchedArticles.push(...data.allFetched);
              if (data.pipeline) {
                combinedPipeline.totalFetched += data.pipeline.totalFetched;
                combinedPipeline.afterDedup += data.pipeline.afterDedup;
                combinedPipeline.afterDateFilter += data.pipeline.afterDateFilter;
                combinedPipeline.afterCap += data.pipeline.afterCap;
                combinedPipeline.droppedByDedup += data.pipeline.droppedByDedup;
                combinedPipeline.droppedByDateFilter += data.pipeline.droppedByDateFilter || 0;
                combinedPipeline.droppedByCap += data.pipeline.droppedByCap;
              }
              toast.success(`LinkedIn: ${data.run?.articles_stored || 0} articles stored`);
            }
          }
        } catch (liErr: any) {
          toast.error("LinkedIn collection failed: " + liErr.message);
        }
      }

      if (lastCompletedRun) {
        onRunComplete(lastCompletedRun);
        setStoredArticles(allStoredArticles);
        setAllFetched(allFetchedArticles);
        setPipeline(combinedPipeline);
        toast.success(`Total: ${lastCompletedRun.articles_stored} articles stored (${lastCompletedRun.articles_collected} fetched)`);
      }
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
          <p className="text-sm text-muted-foreground">Gather the latest articles from your selected sources</p>
        </div>
      </div>

      {/* Source toggles */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Sources</label>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <Switch checked={useGoogleNews} onCheckedChange={setUseGoogleNews} />
            <div className="flex items-center gap-1.5">
              <Newspaper className="w-4 h-4 text-source-gnews" />
              <span className={`text-sm ${useGoogleNews ? "text-foreground" : "text-muted-foreground"}`}>Google News</span>
            </div>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <Switch checked={useLinkedIn} onCheckedChange={setUseLinkedIn} />
            <div className="flex items-center gap-1.5">
              <Linkedin className="w-4 h-4 text-source-linkedin" />
              <span className={`text-sm ${useLinkedIn ? "text-foreground" : "text-muted-foreground"}`}>LinkedIn</span>
            </div>
          </label>
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

      {/* Date range & region selector — only show region if Google News enabled */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <label className="text-sm text-muted-foreground">Last</label>
          <select
            value={filterDays}
            onChange={(e) => setFilterDays(Number(e.target.value))}
            className="bg-muted border border-border rounded-md px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {FILTER_DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </div>

        {useGoogleNews && (
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <label className="text-sm text-muted-foreground">Region</label>
            <Select value={region} onValueChange={(v) => setRegion(v as NewsRegion)}>
              <SelectTrigger className="w-[140px] h-8 text-sm bg-muted border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NEWS_REGIONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Last run intelligence */}
        {lastRunInfo && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Last run:</span>
            <span className="text-foreground font-medium">
              {new Date(lastRunInfo.completedAt).toLocaleDateString()} {new Date(lastRunInfo.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span>•</span>
            <span>{lastRunInfo.articlesStored} stored / {lastRunInfo.articlesCollected} fetched</span>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="flex items-center gap-4">
        <Button onClick={handleCollect} disabled={isCollecting || keywords.length === 0 || (!useGoogleNews && !useLinkedIn)} className="gap-2">
          {isCollecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Newspaper className="w-4 h-4" />}
          {isCollecting ? "Collecting…" : "Collect Latest News"}
        </Button>
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="line-clamp-1">{error}</span>
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
              <span className="font-mono truncate">{lastRun.id}</span>
              <span>•</span>
              <span>{new Date(lastRun.started_at).toLocaleString()}</span>
            </div>

            <div className="space-y-1.5">
              <PipelineRow label="Fetched from sources" value={pipeline.totalFetched} />
              <PipelineArrow dropped={pipeline.droppedByDedup} reason="duplicates removed" />
              <PipelineRow label="After dedup" value={pipeline.afterDedup} />
              <PipelineArrow dropped={pipeline.droppedByDateFilter} reason={`older than ${filterDays} days`} />
              <PipelineRow label="After date filter" value={pipeline.afterDateFilter} />
              {pipeline.droppedByCap > 0 && (
                <PipelineArrow dropped={pipeline.droppedByCap} reason={`capped at ${MAX_ARTICLES_STORED}`} />
              )}
              <PipelineRow label="Stored for scoring" value={pipeline.afterCap} variant="highlight" />
            </div>

            {lastRun.articles_stored === 0 && (
              <p className="text-xs text-destructive/80 bg-destructive/10 rounded-md px-3 py-2">
                No articles passed the pipeline. Try different keywords or a wider date range.
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
              showFunnelFilters
              filterDays={filterDays}
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
      <span className="text-muted-foreground text-xs w-48">{label}</span>
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

// --- Client-side dedup helpers (mirror backend logic) ---
const STOP_WORDS = new Set(["the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out", "has", "its", "how", "who", "what", "when", "where", "why", "with", "from", "they", "been", "have", "will", "this", "that", "than", "then", "into", "over", "also", "new", "more"]);

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

function getContentWords(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter(w => w.length >= 3 && !STOP_WORDS.has(w)));
}

function titleSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const w of a) { if (b.has(w)) overlap++; }
  return overlap / Math.min(a.size, b.size);
}

function getUrlSlug(url: string): string {
  try { return new URL(url).pathname.toLowerCase().replace(/\/+/g, "/").replace(/\/$/, ""); }
  catch { return url; }
}

type ArticleRow = { id: string; title: string; url: string; keyword: string; publishing_agency?: string | null; published_at?: string | null; source?: string };

function clientDedup(articles: ArticleRow[]): { kept: Set<string>; removed: number } {
  const kept = new Set<string>();
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const seenSlugs = new Set<string>();
  const seenAgencyTime = new Set<string>();
  const seenContentWords: Array<{ words: Set<string> }> = [];

  for (const a of articles) {
    if (seenUrls.has(a.url)) continue;
    const normTitle = normalizeTitle(a.title);
    if (seenTitles.has(normTitle)) continue;
    if (a.publishing_agency && a.published_at) {
      const key = `${a.publishing_agency}|${a.published_at}`;
      if (seenAgencyTime.has(key)) continue;
      seenAgencyTime.add(key);
    }
    const slug = getUrlSlug(a.url);
    if (seenSlugs.has(slug)) continue;
    const words = getContentWords(a.title);
    let isDup = false;
    for (const existing of seenContentWords) {
      if (titleSimilarity(words, existing.words) >= 0.8) { isDup = true; break; }
    }
    if (isDup) continue;

    kept.add(a.id);
    seenUrls.add(a.url);
    seenTitles.add(normTitle);
    seenSlugs.add(slug);
    seenContentWords.push({ words });
  }

  return { kept, removed: articles.length - kept.size };
}

function ArticleTableDialog({
  label,
  articles,
  showFunnelFilters = false,
  filterDays = 30,
}: {
  label: string;
  articles: ArticleRow[];
  showFunnelFilters?: boolean;
  filterDays?: number;
}) {
  const [dedupEnabled, setDedupEnabled] = useState(false);
  const [dateFilterEnabled, setDateFilterEnabled] = useState(false);

  const dedupResult = useMemo(() => clientDedup(articles), [articles]);

  const filteredArticles = useMemo(() => {
    let result = articles;

    if (dedupEnabled) {
      result = result.filter(a => dedupResult.kept.has(a.id));
    }

    if (dateFilterEnabled) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filterDays);
      result = result.filter(a => {
        if (!a.published_at) return true;
        return new Date(a.published_at) >= cutoff;
      });
    }

    return result;
  }, [articles, dedupEnabled, dateFilterEnabled, dedupResult, filterDays]);

  const dedupCount = dedupResult.removed;
  const dateDropped = dedupEnabled
    ? articles.filter(a => dedupResult.kept.has(a.id)).length - articles.filter(a => dedupResult.kept.has(a.id) && (!a.published_at || new Date(a.published_at) >= (() => { const d = new Date(); d.setDate(d.getDate() - filterDays); return d; })())).length
    : articles.length - articles.filter(a => !a.published_at || new Date(a.published_at) >= (() => { const d = new Date(); d.setDate(d.getDate() - filterDays); return d; })()).length;

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
          <DialogTitle className="text-base font-display">
            {showFunnelFilters ? `${filteredArticles.length} of ${articles.length} articles` : label}
          </DialogTitle>
        </DialogHeader>

        {showFunnelFilters && (
          <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border">
            <span className="text-xs text-muted-foreground mr-1">Funnel filters:</span>
            <Button
              variant={dedupEnabled ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-xs h-7 px-2.5"
              onClick={() => setDedupEnabled(!dedupEnabled)}
            >
              {dedupEnabled ? <FilterX className="w-3 h-3" /> : <Filter className="w-3 h-3" />}
              Dedup
              <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-0.5 font-mono">
                −{dedupCount}
              </Badge>
            </Button>
            <Button
              variant={dateFilterEnabled ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-xs h-7 px-2.5"
              onClick={() => setDateFilterEnabled(!dateFilterEnabled)}
            >
              {dateFilterEnabled ? <FilterX className="w-3 h-3" /> : <Filter className="w-3 h-3" />}
              ≤ {filterDays} days
              <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-0.5 font-mono">
                −{dateDropped}
              </Badge>
            </Button>

            {(dedupEnabled || dateFilterEnabled) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2 text-muted-foreground"
                onClick={() => { setDedupEnabled(false); setDateFilterEnabled(false); }}
              >
                Clear all
              </Button>
            )}

            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              Showing <span className="text-foreground font-medium">{filteredArticles.length}</span> of {articles.length}
            </span>
          </div>
        )}

        <div className="overflow-auto flex-1 -mx-6 px-6">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-2 font-medium w-8">#</th>
                <th className="py-2 pr-2 font-medium">Title</th>
                <th className="py-2 pr-2 font-medium w-20">Source</th>
                <th className="py-2 pr-2 font-medium w-28">Publisher</th>
                <th className="py-2 pr-2 font-medium w-20">Keyword</th>
                <th className="py-2 font-medium w-20">Published</th>
              </tr>
            </thead>
            <tbody>
              {filteredArticles.map((a, i) => (
                <tr key={a.id + i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2 pr-2 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="py-2 pr-2 text-foreground leading-snug">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary hover:underline inline-flex items-start gap-1 group"
                    >
                      <span className="line-clamp-2">{a.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                    </a>
                  </td>
                  <td className="py-2 pr-2">
                    {a.source === "linkedin" ? <SourceBadge source="linkedin" /> : <SourceBadge source="google_news" />}
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground truncate max-w-[120px]">{a.publishing_agency || "—"}</td>
                  <td className="py-2 pr-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{a.keyword}</Badge>
                  </td>
                  <td className="py-2 text-muted-foreground tabular-nums whitespace-nowrap">
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
