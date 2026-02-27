import { ExternalLink, CheckSquare, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ScoredArticle, BuyingIntentType } from "@/lib/types";
import { SIGNAL_LABELS } from "@/lib/types";

interface ArticleCardProps {
  scoredArticle: ScoredArticle;
  selected: boolean;
  onToggle: () => void;
}

const intentBgClass: Record<BuyingIntentType, string> = {
  LIVE_DEPLOYMENT: "bg-signal-deployment/15 text-signal-deployment border-signal-deployment/30",
  CONTRACT_AWARD: "bg-signal-contract/15 text-signal-contract border-signal-contract/30",
  TENDER: "bg-signal-tender/15 text-signal-tender border-signal-tender/30",
  PARTNER_ANNOUNCEMENT: "bg-signal-partner/15 text-signal-partner border-signal-partner/30",
  EXPANSION: "bg-signal-expansion/15 text-signal-expansion border-signal-expansion/30",
  FUNDING: "bg-signal-funding/15 text-signal-funding border-signal-funding/30",
  REGULATION: "bg-signal-regulation/15 text-signal-regulation border-signal-regulation/30",
  OTHER: "bg-signal-other/15 text-signal-other border-signal-other/30",
};

const confidenceClass = {
  HIGH: "text-confidence-high",
  MEDIUM: "text-confidence-medium",
  LOW: "text-confidence-low",
};

export function ArticleCard({ scoredArticle, selected, onToggle }: ArticleCardProps) {
  const { article, scan } = scoredArticle;

  return (
    <div
      className={`rounded-lg border p-4 transition-all cursor-pointer hover:border-primary/40 ${
        selected ? "border-primary bg-primary/5" : "border-border bg-card"
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          {selected ? (
            <CheckSquare className="w-5 h-5 text-primary" />
          ) : (
            <Square className="w-5 h-5 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-medium text-foreground leading-snug line-clamp-2">
              {article.title}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xl font-display font-bold text-primary tabular-nums">
                {scan.bdImpactScore}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className={`border ${intentBgClass[scan.buyingIntentType]} text-xs px-2 py-0.5`}>
              {SIGNAL_LABELS[scan.buyingIntentType]}
            </Badge>

            {article.publishing_agency && (
              <span className="text-muted-foreground">{article.publishing_agency}</span>
            )}

            {article.published_at && (
              <span className="text-muted-foreground">
                {new Date(article.published_at).toLocaleDateString()}
              </span>
            )}

            {scan.company && (
              <span className="text-foreground font-medium">{scan.company}</span>
            )}

            {scan.country && (
              <span className="text-muted-foreground">{[scan.city, scan.country].filter(Boolean).join(", ")}</span>
            )}

            <span className={`font-medium ${confidenceClass[scan.confidence]}`}>
              {scan.confidence}
            </span>
          </div>

          {scan.whyItMatters && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {scan.whyItMatters}
            </p>
          )}

          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Read article <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
