import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildEmail, EmailParams } from "@/lib/email-builder";
import type { OpportunityPack, EnrichedContact } from "@/lib/types";

interface DraftEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: EnrichedContact;
  pack: OpportunityPack;
  articleTitle: string;
  articleUrl: string;
}

export function DraftEmailModal({ isOpen, onClose, contact, pack, articleTitle, articleUrl }: DraftEmailModalProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsGenerating(true);
      try {
        const params: EmailParams = {
          partnerName: contact.personName,
          partnerEmail: contact.email || "",
          pocName: contact.personName,
          companyName: contact.company,
          inferredIndustry: pack.companyProfile.inferredIndustry,
          deploymentRegion: pack.companyProfile.deploymentRegion,
          country: contact.country || null,
          eventType: pack.deploymentSignal.eventType,
          unitsMentioned: pack.deploymentSignal.scale === "100_PLUS" ? 100 : pack.deploymentSignal.scale === "10_TO_50" ? 50 : 0, // Roughly parse or ignore
          articleTitle,
          articleUrl,
          whyThisIsHot: pack.bdOpportunityAssessment.whyThisIsHot,
          strategicEntryPoint: pack.bdOpportunityAssessment.strategicEntryPoint,
        };

        const { subject: draftSubject, textBody } = buildEmail(params);
        setSubject(draftSubject);
        setBody(textBody);
      } catch (e) {
        console.error("Draft generation failed:", e);
        toast.error("Failed to generate draft. You can write it manually.");
      } finally {
        setIsGenerating(false);
      }
    } else {
      setSubject("");
      setBody("");
    }
  }, [isOpen, contact, pack, articleTitle, articleUrl]);

  const handleSend = async () => {
    if (!contact.email) {
      toast.error("Contact has no valid email address.");
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-partner-email", {
        body: {
          partnerEmail: contact.email,
          companyName: contact.company,
          customSubject: subject,
          customTextBody: body,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Email sent to ${contact.email}`);
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to send email: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Draft Email for {contact.personName || "Contact"}</DialogTitle>
          <DialogDescription>
            Review and edit the drafted email below. It will be sent via Ravikant's email.
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
            <div className="space-y-2">
              <Label>To</Label>
              <Input value={contact.email || "No email available"} disabled className="bg-muted/50 text-muted-foreground" />
            </div>
            
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input 
                value={subject} 
                onChange={(e) => setSubject(e.target.value)} 
                placeholder="Email Subject" 
              />
            </div>

            <div className="space-y-2 h-[calc(100%-140px)] flex flex-col min-h-[250px]">
              <div className="flex items-center justify-between">
                <Label>Message</Label>
                <span className="text-[10px] text-muted-foreground">Plain text formatting</span>
              </div>
              <Textarea 
                value={body} 
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hi there, ..."
                className="flex-1 font-mono text-sm resize-none whitespace-pre-wrap leading-relaxed"
              />
            </div>
          </div>
        )}

        <DialogFooter className="mt-auto pt-4 flex items-center gap-2 sm:justify-between border-t border-border">
          <Button variant="ghost" onClick={onClose} disabled={isSending}>Discard</Button>
          <Button onClick={handleSend} disabled={isSending || isGenerating || !contact.email} className="gap-2 px-6">
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isSending ? "Sending..." : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
