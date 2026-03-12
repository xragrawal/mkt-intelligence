import { useState } from "react";
import { Copy, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Mail, Briefcase, Edit2, Check, XCircle, Loader2, Newspaper, Linkedin, Facebook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { OpportunityPack, EnrichedContact } from "@/lib/types";
import { SOURCE_LABELS, SOURCE_COLORS } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DraftEmailModal } from "./DraftEmailModal";

interface OpportunityCardProps {
  dbId?: string;
  articleTitle: string;
  articleUrl: string;
  articleSource?: string | null;
  pack: OpportunityPack;
  onPackUpdate?: (dbId: string, pack: OpportunityPack) => void;
  onSlackIt?: (contact: EnrichedContact) => void;
  onSendEmail?: (contact: EnrichedContact) => void;
}

const urgencyColor: Record<string, string> = {
  HIGH: "text-urgency-high",
  MEDIUM: "text-urgency-medium",
  LOW: "text-urgency-low",
};

const maturityBadge: Record<string, string> = {
  EARLY: "bg-signal-tender/15 text-signal-tender",
  SCALING: "bg-signal-expansion/15 text-signal-expansion",
  ENTERPRISE_GRADE: "bg-signal-contract/15 text-signal-contract",
};

export function OpportunityCard({ dbId, articleTitle, articleUrl, articleSource, pack, onPackUpdate, onSlackIt, onSendEmail }: OpportunityCardProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    profile: true,
    contacts: true,
    signal: true,
    assessment: true,
    crm: false,
  });

  const toggle = (key: string) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const copyToClipboard = () => {
    navigator.clipboard.writeText(pack.crmReadyNotes);
    toast.success("Copied to clipboard");
  };

  const score = pack.bdOpportunityAssessment.opportunityScore;
  const contacts = pack.enrichedContacts || [];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="min-w-0 text-left">
          <h3 className="text-sm font-display font-semibold text-foreground truncate">
            {articleTitle}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {articleSource && (
              <div className="flex">
                {articleSource === "google_news" && <span title="Google News" className="shrink-0 flex"><Newspaper className="w-3.5 h-3.5 text-muted-foreground" /></span>}
                {articleSource === "linkedin" && <span title="LinkedIn" className="shrink-0 flex"><Linkedin className="w-3.5 h-3.5 text-[#0A66C2]" /></span>}
                {articleSource === "facebook" && <span title="Facebook" className="shrink-0 flex"><Facebook className="w-3.5 h-3.5 text-[#1877F2]" /></span>}
                {!["google_news", "linkedin", "facebook"].includes(articleSource || "") && articleSource && (
                  <span className="text-[10px] text-muted-foreground font-medium">{SOURCE_LABELS[articleSource as keyof typeof SOURCE_LABELS] || articleSource}</span>
                )}
              </div>
            )}
            <a
              href={articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Read article <ExternalLink className="w-3 h-3" />
            </a>
          </div>
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

      {/* Section 2 — Contacts & Involved Parties */}
      <CollapsibleSection title="Enriched Contacts & Involved Parties" sectionKey="contacts" expanded={expandedSections.contacts} toggle={toggle}>
        <ContactsList 
          contacts={contacts} 
          dbId={dbId} 
          pack={pack} 
          onPackUpdate={onPackUpdate} 
          onSlackIt={onSlackIt}
          onSendEmail={onSendEmail}
          articleTitle={articleTitle}
          articleUrl={articleUrl}
        />
      </CollapsibleSection>

      {/* Section 3 — Market Signal */}
      <CollapsibleSection title="Market Signal" sectionKey="signal" expanded={expandedSections.signal} toggle={toggle}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Field label="Event" value={pack.deploymentSignal.eventType} />
          <Field label="Scale" value={pack.deploymentSignal.scale} />
          <div>
            <span className="text-muted-foreground text-xs">Urgency</span>
            <p className={`font-medium ${urgencyColor[pack.deploymentSignal.urgencyLevel] || ""}`}>
              {pack.deploymentSignal.urgencyLevel}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Expansion</span>
            <p className={`font-medium ${urgencyColor[pack.deploymentSignal.expansionLikelihood] || ""}`}>
              {pack.deploymentSignal.expansionLikelihood}
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 4 — Assessment */}
      <CollapsibleSection title="Opportunity Assessment" sectionKey="assessment" expanded={expandedSections.assessment} toggle={toggle}>
        <div className="space-y-3 text-sm">
          <TextBlock label="Why This Matters" value={pack.bdOpportunityAssessment.whyThisIsHot} />
          <TextBlock label="Entry Point" value={pack.bdOpportunityAssessment.strategicEntryPoint} />
          <TextBlock label="Partnership Angle" value={pack.bdOpportunityAssessment.partnershipAngle} />
          <TextBlock label="Risk Factors" value={pack.bdOpportunityAssessment.riskFactors} />
        </div>
      </CollapsibleSection>

      {/* Section 5 — CRM Notes */}
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

function ContactsList({ contacts, dbId, pack, onPackUpdate, onSlackIt, onSendEmail, articleTitle, articleUrl }: { contacts: EnrichedContact[], dbId?: string, pack: OpportunityPack, onPackUpdate?: (dbId: string, pack: OpportunityPack) => void, onSlackIt?: (contact: EnrichedContact) => void, onSendEmail?: (contact: EnrichedContact) => void, articleTitle: string, articleUrl: string }) {
  if (!contacts || contacts.length === 0) return <p className="text-sm text-muted-foreground">No contacts discovered.</p>;

  // Group by company
  const grouped = contacts.reduce((acc, c) => {
    if (!acc[c.company]) acc[c.company] = [];
    acc[c.company].push(c);
    return acc;
  }, {} as Record<string, EnrichedContact[]>);

  const handleContactUpdate = (updatedContact: EnrichedContact) => {
    if (!dbId || !onPackUpdate) return;
    const newContacts = contacts.map(c => {
      // update by matching email or name+company
      if (c.company === updatedContact.company && (c.email === updatedContact.email || c.personName === updatedContact.personName)) {
        return updatedContact;
      }
      return c;
    });
    const newPack = { ...pack, enrichedContacts: newContacts };
    // optimistic update upstream
    onPackUpdate(dbId, newPack);
  };

  const [draftContact, setDraftContact] = useState<EnrichedContact | null>(null);

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([company, compContacts]) => (
        <div key={company} className="space-y-3 border border-border rounded-lg p-4 bg-muted/10">
          <div className="flex items-center gap-2 border-b border-border/50 pb-2">
            <h4 className="font-semibold text-sm text-foreground">{company}</h4>
            {compContacts[0]?.companyWebsite && (
              <a href={compContacts[0].companyWebsite.startsWith('http') ? compContacts[0].companyWebsite : `https://${compContacts[0].companyWebsite}`} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline">
                {compContacts[0].companyWebsite.length > 30 ? "Website ↗" : compContacts[0].companyWebsite + (compContacts[0].companyWebsite.endsWith('↗') ? '' : ' ↗')}
              </a>
            )}
          </div>
          <div className="space-y-2">
            {compContacts.map((c, idx) => (
              <ContactRow 
                key={idx} 
                contact={c} 
                onUpdate={handleContactUpdate} 
                onSlackIt={() => onSlackIt?.(c)}
                onDraftEmail={() => onSendEmail?.(c)} 
              />
            ))}
          </div>
        </div>
      ))}
      {draftContact && (
        <DraftEmailModal 
          isOpen={!!draftContact} 
          onClose={() => setDraftContact(null)} 
          contact={draftContact} 
          pack={pack} 
          articleTitle={articleTitle} 
          articleUrl={articleUrl} 
        />
      )}
    </div>
  );
}

function ContactRow({ contact, onUpdate, onSlackIt, onDraftEmail }: { contact: EnrichedContact, onUpdate: (c: EnrichedContact) => void, onSlackIt?: () => void, onDraftEmail: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(contact.personName || "");
  const [titleDraft, setTitleDraft] = useState(contact.title || "");
  const [emailDraft, setEmailDraft] = useState(contact.email || "");
  const [isValidating, setIsValidating] = useState(false);

  const handleSave = async () => {
    setIsValidating(true);
    let newConfidence = contact.emailConfidence;
    
    // Only re-verify if email actually changed and isn't empty
    if (emailDraft.trim() !== (contact.email || "") && emailDraft.trim() !== "") {
      try {
        const { data, error } = await supabase.functions.invoke("verify-email", {
          body: { email: emailDraft.trim() }
        });
        if (data && data.verified) {
          newConfidence = "Verified";
          toast.success("Email verified by Hunter!");
        } else {
          newConfidence = "Not Found"; // or Invalid
          toast.error("Email marked as invalid by Hunter");
        }
      } catch (e: any) {
        console.error("Hunter validation failed:", e);
        newConfidence = "Estimated"; // fallback
      }
    } else if (emailDraft.trim() === "") {
        newConfidence = "Not Found";
    }

    const updatedContact = {
      ...contact,
      personName: nameDraft.trim() || null,
      title: titleDraft.trim() || null,
      email: emailDraft.trim() || null,
      emailConfidence: newConfidence,
    };
    
    onUpdate(updatedContact);
    setIsEditing(false);
    setIsValidating(false);
  };

  const handleCancel = () => {
    setNameDraft(contact.personName || "");
    setTitleDraft(contact.title || "");
    setEmailDraft(contact.email || "");
    setIsEditing(false);
  };

  const isInvalidEmail = contact.emailConfidence === "Not Found";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm p-2 rounded-md bg-background border border-border group hover:border-primary/30 transition-colors">
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-6 gap-y-2">
        {isEditing ? (
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <input 
              value={nameDraft} onChange={e => setNameDraft(e.target.value)} 
              placeholder="Name" className="h-7 text-xs bg-background border border-border rounded px-2 w-[120px]" 
            />
            <input 
              value={titleDraft} onChange={e => setTitleDraft(e.target.value)} 
              placeholder="Title" className="h-7 text-xs bg-background border border-border rounded px-2 w-[120px]" 
            />
            <input 
              value={emailDraft} onChange={e => setEmailDraft(e.target.value)} 
              placeholder="Email" type="email" className="h-7 text-xs bg-background border border-border rounded px-2 w-[160px]" 
              onKeyDown={e => e.key === "Enter" && handleSave()}
            />
            <div className="flex items-center">
              <button disabled={isValidating} onClick={handleSave} className="p-1 text-primary hover:text-primary/80 disabled:opacity-50">
                {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button disabled={isValidating} onClick={handleCancel} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Name & Title */}
            <div className="min-w-[150px] flex items-center gap-2">
              <div>
                <p className="font-medium text-foreground truncate">{contact.personName || "Unknown Name"}</p>
                <p className="text-[11px] text-muted-foreground truncate">{contact.title || "Unknown Role"}</p>
              </div>
              <button onClick={() => setIsEditing(true)} className="p-1 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
            {/* Email */}
            <div className="min-w-[150px] flex items-center gap-1.5">
              <span className={`text-[12px] ${!contact.email ? 'text-muted-foreground placeholder' : ''}`}>
                {contact.email || "No email"}
              </span>
              {contact.email && (
                contact.emailConfidence === "Verified" ? <span className="w-2 h-2 rounded-full bg-green-500" title="Verified by Hunter"/> :
                contact.emailConfidence === "Estimated" ? <span className="w-2 h-2 rounded-full bg-yellow-400" title="Estimated"/> :
                <span className="w-2 h-2 rounded-full bg-red-500" title="Invalid / Not Found"/>
              )}
            </div>
          </>
        )}
      </div>
      
      {!isEditing && (
        <div className="flex items-center gap-1 shrink-0">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 text-xs px-2 gap-1.5 text-muted-foreground hover:text-[#4A154B]"
            disabled={isInvalidEmail || !contact.email}
            onClick={() => {
              if (isInvalidEmail || !contact.email) {
                toast.error("Valid email required");
              } else {
                onSlackIt?.();
              }
            }}
          >
            <Briefcase className="w-3 h-3" /> Slack it
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 text-xs px-2 gap-1.5 text-muted-foreground hover:text-primary"
            disabled={isInvalidEmail || !contact.email}
            onClick={() => {
              if (isInvalidEmail || !contact.email) {
                toast.error("Valid email required");
              } else {
                onDraftEmail();
              }
            }}
          >
            <Mail className="w-3 h-3" /> Draft Email
          </Button>
        </div>
      )}
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
    <div className="border-b border-border last:border-b-0 text-left">
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
    <div className="text-left">
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="text-foreground">{value}</p>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-left">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <p className="text-foreground leading-relaxed mt-0.5">{value}</p>
    </div>
  );
}
