import { useState } from "react";
import { Copy, CheckCircle2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OpportunityPack } from "@/lib/types";
import { toast } from "sonner";

interface OpportunityCardProps {
  articleTitle: string;
  articleUrl: string;
  pack: OpportunityPack;
}

const urgencyColor = {
  HIGH: "text-urgency-high",
  MEDIUM: "text-urgency-medium",
  LOW: "text-urgency-low",
};

const maturityBadge = {
  EARLY: "bg-signal-tender/15 text-signal-tender",
  SCALING: "bg-signal-expansion/15 text-signal-expansion",
  ENTERPRISE_GRADE: "bg-signal-contract/15 text-signal-contract",
};

export function OpportunityCard({ articleTitle, articleUrl, pack }: OpportunityCardProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    profile: true,
    signal: true,
    assessment: true,
    crm: true,
  });

  const toggle = (key: string) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const copyToClipboard = () => {
    navigator.clipboard.writeText(pack.crmReadyNotes);
    toast.success("Copied to clipboard");
  };

  const score = pack.bdOpportunityAssessment.opportunityScore;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-display font-semibold text-foreground truncate">
            {articleTitle}
          </h3>
          <a
            href={articleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
          >
            Source <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="relative w-14 h-14 shrink-0">
          <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="3"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="3"
              strokeDasharray={`${score}, 100`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-display font-bold text-primary">
            {score}
          </span>
        </div>
      </div>

      {/* Section 1 — Company Profile */}
      <CollapsibleSection title="Organisation Profile" sectionKey="profile" expanded={expandedSections.profile} toggle={toggle}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Field label="Company" value={pack.companyProfile.companyName} />
          <Field label="Industry" value={pack.companyProfile.inferredIndustry} />
          <Field label="Region" value={pack.companyProfile.deploymentRegion} />
          <Field label="Buyer Type" value={pack.companyProfile.likelyBuyerType} />
          <div>
            <span className="text-muted-foreground text-xs">Maturity</span>
            <p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${maturityBadge[pack.companyProfile.maturitySignal] || "bg-muted text-muted-foreground"}`}>
                {pack.companyProfile.maturitySignal}
              </span>
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 2 — Market Signal */}
      <CollapsibleSection title="Market Signal" sectionKey="signal" expanded={expandedSections.signal} toggle={toggle}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Field label="Event" value={pack.deploymentSignal.eventType} />
          <Field label="Scale" value={pack.deploymentSignal.scale} />
          <div>
            <span className="text-muted-foreground text-xs">Urgency</span>
            <p className={`font-medium ${urgencyColor[pack.deploymentSignal.urgencyLevel]}`}>
              {pack.deploymentSignal.urgencyLevel}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Expansion</span>
            <p className={`font-medium ${urgencyColor[pack.deploymentSignal.expansionLikelihood]}`}>
              {pack.deploymentSignal.expansionLikelihood}
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 3 — Assessment */}
      <CollapsibleSection title="Opportunity Assessment" sectionKey="assessment" expanded={expandedSections.assessment} toggle={toggle}>
        <div className="space-y-3 text-sm">
          <TextBlock label="Why This Matters" value={pack.bdOpportunityAssessment.whyThisIsHot} />
          <TextBlock label="Entry Point" value={pack.bdOpportunityAssessment.strategicEntryPoint} />
          <TextBlock label="Partnership Angle" value={pack.bdOpportunityAssessment.partnershipAngle} />
          <TextBlock label="Risk Factors" value={pack.bdOpportunityAssessment.riskFactors} />
        </div>
      </CollapsibleSection>

      {/* Section 4 — CRM Notes */}
      <CollapsibleSection title="Action Notes" sectionKey="crm" expanded={expandedSections.crm} toggle={toggle}>
        <div className="space-y-3">
          <pre className="whitespace-pre-wrap text-sm text-foreground bg-muted/50 rounded-lg p-4 font-body leading-relaxed border border-border">
            {pack.crmReadyNotes}
          </pre>
          <Button onClick={copyToClipboard} variant="outline" size="sm" className="gap-2">
            <Copy className="w-3.5 h-3.5" />
            Copy to Clipboard
          </Button>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function CollapsibleSection({
  title,
  sectionKey,
  expanded,
  toggle,
  children,
}: {
  title: string;
  sectionKey: string;
  expanded: boolean;
  toggle: (key: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => toggle(sectionKey)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
      >
        {title}
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expanded && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="text-foreground">{value}</p>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <p className="text-foreground leading-relaxed mt-0.5">{value}</p>
    </div>
  );
}
