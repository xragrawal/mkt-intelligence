import { useState, useEffect } from "react";
import { Header } from "@/components/signal/Header";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Edit2, Check, X, Users } from "lucide-react";
import { toast } from "sonner";

interface Partner {
  id: string;
  name: string;
  email: string;
  region: string;
  created_at: string;
}

const Partners = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", region: "" });
  const [editForm, setEditForm] = useState({ name: "", email: "", region: "" });

  useEffect(() => {
    loadPartners();
  }, []);

  const loadPartners = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("flytbase_partners")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load partners");
    setPartners(data || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!form.name || !form.email || !form.region) {
      toast.error("All fields are required");
      return;
    }
    const { error } = await supabase.from("flytbase_partners").insert({
      name: form.name,
      email: form.email,
      region: form.region,
    });
    if (error) {
      toast.error("Failed to add partner");
      return;
    }
    toast.success(`Added ${form.name}`);
    setForm({ name: "", email: "", region: "" });
    setAdding(false);
    loadPartners();
  };

  const handleUpdate = async (id: string) => {
    if (!editForm.name || !editForm.email || !editForm.region) {
      toast.error("All fields are required");
      return;
    }
    const { error } = await supabase
      .from("flytbase_partners")
      .update({ name: editForm.name, email: editForm.email, region: editForm.region })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update");
      return;
    }
    toast.success("Updated");
    setEditingId(null);
    loadPartners();
  };

  const handleDelete = async (partner: Partner) => {
    if (!confirm(`Delete ${partner.name}?`)) return;
    const { error } = await supabase.from("flytbase_partners").delete().eq("id", partner.id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success(`Deleted ${partner.name}`);
    loadPartners();
  };

  const startEdit = (p: Partner) => {
    setEditingId(p.id);
    setEditForm({ name: p.name, email: p.email, region: p.region });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-foreground">FlytBase Partners</h2>
              <p className="text-sm text-muted-foreground">Manage partners for lead matching by region</p>
            </div>
          </div>
          <Button onClick={() => setAdding(true)} disabled={adding} className="gap-2" size="sm">
            <Plus className="w-4 h-4" /> Add Partner
          </Button>
        </div>

        {/* Add form */}
        {adding && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">New Partner</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input placeholder="Partner name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input placeholder="Region (e.g. US, Brazil, India)" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} className="gap-1"><Check className="w-3 h-3" /> Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setForm({ name: "", email: "", region: "" }); }}><X className="w-3 h-3" /> Cancel</Button>
            </div>
          </div>
        )}

        {/* Partners table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground bg-muted/30">
                <th className="py-3 px-4 font-medium">#</th>
                <th className="py-3 px-4 font-medium">Name</th>
                <th className="py-3 px-4 font-medium">Email</th>
                <th className="py-3 px-4 font-medium">Region</th>
                <th className="py-3 px-4 font-medium">Added</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : partners.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No partners yet. Add your first partner above.</td></tr>
              ) : (
                partners.map((p, i) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4 text-muted-foreground tabular-nums">{i + 1}</td>
                    {editingId === p.id ? (
                      <>
                        <td className="py-2 px-4"><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-8 text-sm" /></td>
                        <td className="py-2 px-4"><Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="h-8 text-sm" /></td>
                        <td className="py-2 px-4"><Input value={editForm.region} onChange={(e) => setEditForm({ ...editForm, region: e.target.value })} className="h-8 text-sm" /></td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => handleUpdate(p.id)} className="h-7 px-2 text-primary"><Check className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-7 px-2 text-muted-foreground"><X className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-4 text-foreground font-medium">{p.name}</td>
                        <td className="py-3 px-4"><a href={`mailto:${p.email}`} className="text-primary hover:underline">{p.email}</a></td>
                        <td className="py-3 px-4 text-foreground">{p.region}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => startEdit(p)} className="h-7 px-2 text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(p)} className="h-7 px-2 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg bg-muted/30 border border-border px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">How partner matching works</p>
          <p>When Step 3 deep-dives an article, the AI extracts the deployment region. Partners are auto-matched when their region name appears in (or contains) the deployment region. You can always override the match manually in Step 3.</p>
        </div>
      </main>
    </div>
  );
};

export default Partners;
