import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/AdminShell";
import { StateBox } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { errMsg, formatMoney, useInvalidateAll, usePlans, useSettings, type Plan } from "@/lib/sendra";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({ meta: [{ title: "Plans — Sendra Admin 2.0" }, { name: "description", content: "Manage Sendra subscription plans and daily limits." }, { property: "og:title", content: "Plans — Sendra Admin 2.0" }, { property: "og:description", content: "Manage Sendra subscription plans and daily limits." }] }),
  component: PlansPage,
});

function PlansPage() {
  const plans = usePlans();
  const { data: settings } = useSettings();
  const invalidate = useInvalidateAll();
  const [edit, setEdit] = useState<Plan | "new" | null>(null);
  const [del, setDel] = useState<Plan | null>(null);

  async function toggle(p: Plan) {
    const { error } = await supabase.from("plans").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast.error(errMsg(error));
    toast.success(`${p.name} ${p.is_active ? "deactivated" : "activated"}`);
    invalidate();
  }
  async function remove() {
    if (!del) return;
    const { error } = await supabase.from("plans").delete().eq("id", del.id);
    if (error) toast.error(error.code === "23503" ? "This plan is used by subscriptions. Deactivate it instead." : errMsg(error));
    else { toast.success("Plan removed"); invalidate(); }
    setDel(null);
  }

  return (
    <div className="animate-rise">
      <PageHeader title="Plans" description="Active plans are available to the Android app." actions={<Button onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Add plan</Button>} />
      {plans.error ? <StateBox tone="error" title="Couldn't load plans" body={errMsg(plans.error)} />
        : plans.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56" />)}</div>
        : !plans.data?.length ? <StateBox title="No plans yet" body="Add your first plan." />
        : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {plans.data.map((p) => (
              <div key={p.id} className={`flex flex-col rounded-xl border bg-card p-5 transition-all hover:shadow-md ${!p.is_active ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <Switch checked={p.is_active} onCheckedChange={() => toggle(p)} aria-label="Available" />
                </div>
                <p className="mt-3 font-display text-3xl font-semibold">{formatMoney(p.price, settings?.currency)}<span className="text-sm font-normal text-muted-foreground"> / {p.duration_days}d</span></p>
                <p className="mt-2 inline-flex w-fit rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">{p.daily_limit ? `${p.daily_limit.toLocaleString()} sends/day` : "Unlimited sends"}</p>
                <p className="mt-3 flex-1 text-sm text-muted-foreground">{p.description || "—"}</p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setEdit(p)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDel(p)} aria-label="Remove"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      <PlanDialog plan={edit} onClose={() => setEdit(null)} />
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove {del?.name}?</AlertDialogTitle><AlertDialogDescription>Plans in use by subscriptions can't be removed — deactivate them instead.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlanDialog({ plan, onClose }: { plan: Plan | "new" | null; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [f, setF] = useState({ name: "", description: "", price: "0", daily_limit: "", duration_days: "30", is_active: true, unlimited: false });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (plan === "new") setF({ name: "", description: "", price: "0", daily_limit: "200", duration_days: "30", is_active: true, unlimited: false });
    else if (plan) setF({ name: plan.name, description: plan.description, price: String(plan.price), daily_limit: String(plan.daily_limit ?? ""), duration_days: String(plan.duration_days), is_active: plan.is_active, unlimited: plan.daily_limit === null });
    setErr("");
  }, [plan]);

  async function save() {
    const price = Number(f.price), lim = Number(f.daily_limit), dur = Number(f.duration_days);
    if (!f.name.trim() || f.name.length > 60) return setErr("Name is required (max 60 chars)");
    if (!Number.isFinite(price) || price < 0) return setErr("Price must be 0 or more");
    if (!f.unlimited && (!Number.isInteger(lim) || lim < 1)) return setErr("Daily limit must be a whole number above 0");
    if (!Number.isInteger(dur) || dur < 1) return setErr("Duration must be at least 1 day");
    setSaving(true);
    const row = { name: f.name.trim(), description: f.description.trim().slice(0, 500), price, daily_limit: f.unlimited ? null : lim, duration_days: dur, is_active: f.is_active };
    const { error } = plan === "new" ? await supabase.from("plans").insert(row) : await supabase.from("plans").update(row).eq("id", (plan as Plan).id);
    setSaving(false);
    if (error) return setErr(error.code === "23505" ? "A plan with this name already exists" : errMsg(error));
    toast.success("Plan saved"); invalidate(); onClose();
  }

  return (
    <Dialog open={!!plan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{plan === "new" ? "Add plan" : "Edit plan"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Price</Label><Input type="number" min="0" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Duration (days)</Label><Input type="number" min="1" value={f.duration_days} onChange={(e) => setF({ ...f, duration_days: e.target.value })} /></div>
          </div>
          <label className="flex items-center justify-between text-sm"><span>Unlimited daily sends</span><Switch checked={f.unlimited} onCheckedChange={(v) => setF({ ...f, unlimited: v })} /></label>
          {!f.unlimited && <div className="space-y-1.5"><Label className="text-xs">Daily successful-send limit</Label><Input type="number" min="1" value={f.daily_limit} onChange={(e) => setF({ ...f, daily_limit: e.target.value })} /></div>}
          <div className="space-y-1.5"><Label className="text-xs">Description</Label><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <label className="flex items-center justify-between text-sm"><span>Available to clients</span><Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} /></label>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
