import { useState } from "react";
import { Sparkles, Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpportunityCard } from "@/components/signal/OpportunityCard";
import type { ScoredArticle, OpportunityPack } from "@/lib/types";
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
}

export function Step3Panel({ selectedArticles, enabled }: Step3PanelProps) {
  const [isEnriching, setIsEnriching] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<EnrichedResult[]>([]);

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
          });
          setResults([...newResults]);
        }
      }

      toast.success(`Generated ${newResults.length} opportunity packs`);
    } catch (e: any) {
      toast.error("Enrichment error: " + e.message);
    } finally {
      setIsEnriching(false);
    }
  };

  const handleDelete = async (index: number) => {
    const result = results[index];
    if (result.dbId) {
      await supabase.from("opportunity_packs").delete().eq("id", result.dbId);
    }
    setResults(results.filter((_, i) => i !== index));
    toast.success("Opportunity pack removed");
  };

  return (
    <section className={`rounded-xl border border-border bg-card p-6 space-y-5 animate-slide-up ${!enabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-display font-bold text-primary">
          3
        </div>
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground">Opportunity Intelligence</h2>
          <p className="text-sm text-muted-foreground">
            Deep analysis & CRM-ready action notes
            {enabled && selectedArticles.length > 0 && results.length === 0 && (
              <span className="text-foreground"> • {selectedArticles.length} articles selected for deep dive</span>
            )}
          </p>
        </div>
      </div>

      <Button
        onClick={handleDeepDive}
        disabled={isEnriching || !enabled}
        className="gap-2"
      >
        {isEnriching ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {isEnriching
          ? `Analysing ${currentIndex}/${selectedArticles.length}…`
          : `Deep Dive on ${selectedArticles.length} Selected`}
      </Button>

      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            <span>{results.length} opportunity packs generated</span>
          </div>
          <div className="space-y-6">
            {results.map((r, i) => (
              <div key={i} className="relative">
                <OpportunityCard
                  articleTitle={r.articleTitle}
                  articleUrl={r.articleUrl}
                  pack={r.pack}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(i)}
                  className="absolute top-4 right-4 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
