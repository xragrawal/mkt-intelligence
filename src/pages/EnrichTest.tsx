import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, CheckCircle, XCircle, AlertCircle, ExternalLink, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EnrichedContact {
  personName: string | null;
  title: string | null;
  company: string;
  companyWebsite: string | null;
  companyDomain: string | null;
  linkedinUrl: string | null;
  country: string | null;
  email: string | null;
  emailConfidence: "Verified" | "Estimated" | "Not Found";
  hunterVerified?: boolean | null;
  source: "article" | "apollo";
  leadType: string;
  leadPriority: "High" | "Medium" | "Low";
  notes: string | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  High: "bg-red-100 text-red-700 border-red-200",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Low: "bg-gray-100 text-gray-600 border-gray-200",
};

const CONFIDENCE_BADGE = (conf: string, hunterVerified?: boolean | null) => {
  // Hunter has run — show only tick or cross, nothing else
  if (hunterVerified === true) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
        <CheckCircle className="w-3 h-3" /> Valid
      </span>
    );
  }
  if (hunterVerified === false) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 border border-red-200">
        <XCircle className="w-3 h-3" /> Invalid
      </span>
    );
  }
  // Hunter hasn't run — show email confidence
  if (conf === "Verified") {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">
        <CheckCircle className="w-3 h-3" /> Verified
      </span>
    );
  }
  if (conf === "Estimated") {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-700 border border-yellow-200">
        <AlertCircle className="w-3 h-3" /> Estimated
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
      <XCircle className="w-3 h-3" /> Not Found
    </span>
  );
};

function exportToCsv(articleContacts: EnrichedContact[], apolloContacts: EnrichedContact[], articleTitle?: string) {
  const headers = ["Source", "Person Name", "Title", "Company", "Website", "Domain", "LinkedIn", "Country", "Email", "Email Confidence", "Hunter Verified", "Lead Type", "Priority", "Notes"];
  const toRow = (c: EnrichedContact) => [
    c.source === "apollo" ? "Apollo" : "Article",
    c.personName || "",
    c.title || "",
    c.company || "",
    c.companyWebsite || "",
    c.companyDomain || "",
    c.linkedinUrl || "",
    c.country || "",
    c.email || "",
    c.emailConfidence || "",
    c.hunterVerified == null ? "" : c.hunterVerified ? "Yes" : "No",
    c.leadType || "",
    c.leadPriority || "",
    c.notes || "",
  ];
  const allContacts = [...articleContacts, ...apolloContacts];
  const csv = [headers, ...allContacts.map(toRow)]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `enriched-contacts-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ContactTable({ contacts, copyEmail }: { contacts: EnrichedContact[]; copyEmail: (e: string) => void }) {
  if (contacts.length === 0) {
    return <p className="text-xs text-muted-foreground italic px-1">No contacts found.</p>;
  }
  return (
    <div className="border rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Person</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Company</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Country</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Email</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Confidence</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Lead Type</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Priority</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Links</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c, i) => (
            <tr key={i} className={`border-b last:border-0 hover:bg-muted/20 ${c.leadPriority === "High" ? "bg-red-50/30" : ""}`}>
              <td className="py-2.5 px-3 align-top">
                <div className="font-medium text-foreground">{c.personName || <span className="text-muted-foreground italic">Unknown</span>}</div>
                {c.title && <div className="text-muted-foreground mt-0.5">{c.title}</div>}
              </td>
              <td className="py-2.5 px-3 align-top">
                <div className="font-medium text-foreground">{c.company}</div>
                {c.companyDomain && <div className="text-muted-foreground mt-0.5">{c.companyDomain}</div>}
              </td>
              <td className="py-2.5 px-3 align-top text-muted-foreground">{c.country || "—"}</td>
              <td className="py-2.5 px-3 align-top">
                {c.email ? (
                  <div className="flex items-center gap-1 group">
                    <span className="font-mono text-foreground">{c.email}</span>
                    <button onClick={() => copyEmail(c.email!)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Copy className="w-3 h-3 text-muted-foreground hover:text-primary" />
                    </button>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="py-2.5 px-3 align-top">
                {CONFIDENCE_BADGE(c.emailConfidence, c.hunterVerified)}
              </td>
              <td className="py-2.5 px-3 align-top text-muted-foreground">{c.leadType}</td>
              <td className="py-2.5 px-3 align-top">
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${PRIORITY_COLORS[c.leadPriority] || ""}`}>
                  {c.leadPriority}
                </span>
              </td>
              <td className="py-2.5 px-3 align-top">
                <div className="flex items-center gap-2">
                  {c.companyWebsite && (
                    <a href={c.companyWebsite} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary" title="Company website">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {c.linkedinUrl && (
                    <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-[#0077B5]" title="LinkedIn">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    </a>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EnrichTest() {
  const [articleUrl, setArticleUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [articleContacts, setArticleContacts] = useState<EnrichedContact[]>([]);
  const [apolloContacts, setApolloContacts] = useState<EnrichedContact[]>([]);
  const [articleTitle, setArticleTitle] = useState<string>("");
  const [ran, setRan] = useState(false);

  const handleEnrich = async () => {
    if (!articleUrl.trim()) {
      toast.error("Please enter an article URL");
      return;
    }
    setLoading(true);
    setArticleContacts([]);
    setApolloContacts([]);
    setRan(false);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-contacts-test", {
        body: { articleUrl: articleUrl.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const ac: EnrichedContact[] = data.articleContacts || [];
      const apc: EnrichedContact[] = data.apolloContacts || [];
      setArticleContacts(ac);
      setApolloContacts(apc);
      setArticleTitle(data.articleTitle || "");
      setRan(true);
      toast.success(`${ac.length} from article · ${apc.length} new from Apollo`);
    } catch (e: any) {
      toast.error("Enrichment failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success("Email copied");
  };

  const allContacts = [...articleContacts, ...apolloContacts];
  const withEmailCount = allContacts.filter(c => c.email).length;
  const verifiedCount = allContacts.filter(c => c.hunterVerified === true || (c.emailConfidence === "Verified" && c.hunterVerified !== false)).length;
  const highCount = allContacts.filter(c => c.leadPriority === "High").length;

  return (
    <div className="min-h-screen bg-background p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">TEST AGENT</span>
          <span className="text-xs text-muted-foreground">Not connected to main pipeline</span>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Data Enrichment Agent</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Jina fetches article → GPT-4o extracts entities → Apollo discovers contacts → Hunter verifies emails
        </p>
      </div>

      {/* Input */}
      <div className="flex gap-3 mb-8">
        <Input
          placeholder="https://... paste article URL here"
          value={articleUrl}
          onChange={e => setArticleUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !loading && handleEnrich()}
          className="flex-1 font-mono text-sm"
          disabled={loading}
        />
        <Button onClick={handleEnrich} disabled={loading || !articleUrl.trim()} className="gap-2 px-6">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {loading ? "Enriching..." : "Enrich"}
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="border rounded-xl p-10 text-center text-muted-foreground bg-muted/30">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="font-medium">Analyzing article...</p>
          <p className="text-xs mt-1">Jina fetch → GPT-4o extract → Apollo match + exec search → Hunter verify</p>
          <p className="text-xs mt-1 text-muted-foreground/60">Usually 30–90 seconds depending on number of companies</p>
        </div>
      )}

      {/* Results */}
      {ran && !loading && (
        <>
          {/* Article title */}
          {articleTitle && (
            <div className="mb-4">
              <p className="text-sm font-medium text-foreground">{articleTitle}</p>
              <a href={articleUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5 w-fit">
                {articleUrl} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Summary bar */}
          <div className="flex items-center gap-4 mb-6 p-3 rounded-lg bg-muted/40 border">
            <span className="text-sm"><span className="font-semibold text-foreground">{articleContacts.length}</span> <span className="text-muted-foreground">from article</span></span>
            <span className="text-sm"><span className="font-semibold text-blue-600">{apolloContacts.length}</span> <span className="text-muted-foreground">from Apollo</span></span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-sm"><span className="font-semibold text-foreground">{withEmailCount}</span> <span className="text-muted-foreground">with email</span></span>
            <span className="text-sm"><span className="font-semibold text-green-600">{verifiedCount}</span> <span className="text-muted-foreground">verified</span></span>
            <span className="text-sm"><span className="font-semibold text-red-600">{highCount}</span> <span className="text-muted-foreground">high priority</span></span>
            <div className="ml-auto">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => exportToCsv(articleContacts, apolloContacts, articleTitle)} disabled={allContacts.length === 0}>
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
            </div>
          </div>

          {allContacts.length === 0 ? (
            <div className="border rounded-xl p-10 text-center text-muted-foreground">
              No contacts found. Try a different article URL.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Table 1: From article */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-foreground">From Article</h2>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted border text-muted-foreground">{articleContacts.length}</span>
                  <span className="text-xs text-muted-foreground">Named people &amp; companies extracted by GPT-4o</span>
                </div>
                <ContactTable contacts={articleContacts} copyEmail={copyEmail} />
              </div>

              {/* Table 2: Apollo delta */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-foreground">Apollo Discovery</h2>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 border border-blue-200 text-blue-700">{apolloContacts.length}</span>
                  <span className="text-xs text-muted-foreground">Decision-makers found via Apollo not named in article</span>
                </div>
                {apolloContacts.length === 0 ? (
                  <div className="border rounded-xl p-5 text-xs text-muted-foreground bg-muted/20 space-y-1">
                    <p className="font-medium text-foreground">No Apollo contacts found for this article.</p>
                    <p>Apollo indexes commercial &amp; enterprise companies. It works best for:</p>
                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                      <li>Mid-to-large logistics, energy, utilities, infrastructure companies</li>
                      <li>Enterprise tech firms, inspection service companies, security firms</li>
                      <li>Publicly-listed or VC-backed companies with LinkedIn presence</li>
                    </ul>
                    <p className="text-muted-foreground/70 mt-1">Small volunteer orgs (fire brigades, local councils) and niche operators typically aren't indexed. Try an article about a large enterprise deployment to see Apollo's value.</p>
                  </div>
                ) : (
                  <ContactTable contacts={apolloContacts} copyEmail={copyEmail} />
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {allContacts.some(c => c.notes) && (
            <div className="mt-6 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
              {allContacts.filter(c => c.notes).map((c, i) => (
                <div key={i} className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                  <span className="font-medium text-foreground">{c.personName || c.company}:</span> {c.notes}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
