import { Badge } from "@/components/ui/badge";
import { Linkedin, Newspaper } from "lucide-react";
import type { ArticleSource } from "@/lib/types";
import { SOURCE_LABELS, SOURCE_COLORS } from "@/lib/types";

interface SourceBadgeProps {
  source: ArticleSource;
  size?: "sm" | "md";
}

const sourceIcons: Record<ArticleSource, typeof Newspaper> = {
  google_news: Newspaper,
  linkedin: Linkedin,
};

export function SourceBadge({ source, size = "sm" }: SourceBadgeProps) {
  const Icon = sourceIcons[source];
  const sizeClass = size === "sm" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";

  return (
    <Badge variant="outline" className={`border ${SOURCE_COLORS[source]} ${sizeClass} gap-1`}>
      <Icon className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} />
      {SOURCE_LABELS[source]}
    </Badge>
  );
}
