import { useState } from "react";
import { Newspaper, Loader2, CheckCircle2, AlertCircle, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_KEYWORDS } from "@/lib/types";
import type { CollectionRunSummary } from "@/lib/types";
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

    try {
      const { data, error: fnError } = await supabase.functions.invoke("collect-news", {
        body: { keywords },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      onRunComplete(data.run);
      toast.success(`Collected ${data.run.articles_stored} articles`);
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
          <p className="text-sm text-muted-foreground">Gather the latest articles from configured sources</p>
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

      {/* Run summary */}
      {lastRun && (
        <div className="rounded-lg bg-muted/50 border border-border p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Run ID</span>
            <p className="font-mono text-xs text-foreground truncate">{lastRun.id}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Collected</span>
            <p className="text-foreground font-semibold">{lastRun.articles_collected}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Stored</span>
            <p className="text-foreground font-semibold">{lastRun.articles_stored}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Status</span>
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-foreground capitalize">{lastRun.status}</span>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
