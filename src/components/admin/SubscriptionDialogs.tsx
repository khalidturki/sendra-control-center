import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errMsg, formatMoney, usePlans, useInvalidateAll, type SubscriptionRow } from "@/lib/sendra";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.union([z.literal(""), z.string().trim().email("Invalid email").max(255)]),
  phone: z.string().trim().max(40),
  company: z.string().trim().max(120),
});

function Field({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function PlanSelect({ value, onChange, onlyActive = true }: { value: string; onChange: (v: string) => void; onlyActive?: boolean }) {
  const plans = usePlans();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={plans.isLoading ? "Loading plans…" : "Choose a plan"} /></SelectTrigger>
      <SelectContent>
        {plans.data?.filter((p) => !onlyActive || p.is_active || p.id === value).map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name} · {p.daily_limit ? `${p.daily_limit.toLocaleString()}/day` : "Unlimited"} · {formatMoney(p.price)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ---------------- Create ---------------- */
export function CreateSubscriptionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidateAll();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "" });
  const [clientId, setClientId] = useState("");
  const [planId, setPlanId] = useState("");
  const [notes, setNotes] = useState("");
  const [activateNow, setActivateNow] = useState(false);
  const [recordPayment, setRecordPayment] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const eligible = useQuery({
    queryKey: ["eligible-clients"],
    enabled: open && mode === "existing",
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name, client_code, subscriptions(status)").order("name");
      if (error) throw error;
      return data.filter((c) => !c.subscriptions.some((s) => s.status !== "EXPIRED"));
    },
  });

  useEffect(() => {
    if (open) {
      setForm({ name: "", email: "", phone: "", company: "" });
      setClientId(""); setPlanId(""); setNotes(""); setActivateNow(false); setRecordPayment(true); setErrors({}); setMode("new");
    }
  }, [open]);

  async function save() {
    const errs: Record<string, string> = {};
    let parsed: z.infer<typeof clientSchema> | null = null;
    if (mode === "new") {
      const r = clientSchema.safeParse(form);
      if (!r.success) r.error.issues.forEach((i) => (errs[String(i.path[0])] = i.message));
      else parsed = r.data;
    } else if (!clientId) errs.client = "Select a client";
    if (!planId) errs.plan = "Select a plan";
    if (notes.length > 1000) errs.notes = "Max 1000 characters";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      let cid = clientId;
      if (mode === "new" && parsed) {
        const { data, error } = await supabase.from("clients").insert({
          name: parsed.name, email: parsed.email || null, phone: parsed.phone || null, company: parsed.company || null,
        }).select("id").single();
        if (error) throw error;
        cid = data.id;
      }
      const { data: plan } = await supabase.from("plans").select("price").eq("id", planId).single();
      const { data: sub, error } = await supabase.from("subscriptions").insert({
        client_id: cid, plan_id: planId, price: plan?.price ?? 0, notes: notes.trim() || null,
      }).select("id").single();
      if (error) throw error;
      if (activateNow) {
        const { error: e2 } = await supabase.rpc("admin_activate_subscription", { _subscription_id: sub.id, _record_payment: recordPayment });
        if (e2) throw e2;
      }
      toast.success(activateNow ? "Subscription created and activated" : "Subscription created as pending");
      invalidate();
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New subscription</DialogTitle>
          <DialogDescription>Create a client subscription. Pending subscriptions need approval before use.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "new" | "existing")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new">New client</TabsTrigger>
            <TabsTrigger value="existing">Existing client</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid gap-4">
          {mode === "new" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Client name *" error={errors["name"]}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field></div>
              <Field label="Email" error={errors["email"]}><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Phone" error={errors["phone"]}><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <div className="sm:col-span-2"><Field label="Company" error={errors["company"]}><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field></div>
            </div>
          ) : (
            <Field label="Client *" error={errors["client"]}>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder={eligible.isLoading ? "Loading…" : eligible.data?.length ? "Choose a client" : "No clients without an open subscription"} /></SelectTrigger>
                <SelectContent>
                  {eligible.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.client_code}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Plan *" error={errors["plan"]}><PlanSelect value={planId} onChange={setPlanId} /></Field>
          <Field label="Notes" error={errors["notes"]}><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Approve and activate immediately</span>
              <Switch checked={activateNow} onCheckedChange={setActivateNow} />
            </label>
            {activateNow && (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Record payment of plan price</span>
                <Switch checked={recordPayment} onCheckedChange={setRecordPayment} />
              </label>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Edit ---------------- */
function toLocalInput(d: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  const off = dt.getTimezoneOffset();
  return new Date(dt.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function EditSubscriptionDialog({ sub, onOpenChange }: { sub: SubscriptionRow | null; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidateAll();
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "" });
  const [planId, setPlanId] = useState("");
  const [price, setPrice] = useState("0");
  const [start, setStart] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    if (!sub) return;
    setForm({ name: sub.client.name, email: sub.client.email ?? "", phone: sub.client.phone ?? "", company: sub.client.company ?? "" });
    setPlanId(sub.plan_id); setPrice(String(sub.price)); setStart(toLocalInput(sub.start_date)); setExpiry(toLocalInput(sub.expiry_date));
    setNotes(sub.notes ?? ""); setApiKey(sub.client.api_key); setErrors({});
  }, [sub]);

  async function save() {
    if (!sub) return;
    const errs: Record<string, string> = {};
    const r = clientSchema.safeParse(form);
    if (!r.success) r.error.issues.forEach((i) => (errs[String(i.path[0])] = i.message));
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) errs.price = "Enter a valid price";
    if (sub.status !== "PENDING") {
      if (!start) errs.start = "Required";
      if (!expiry) errs.expiry = "Required";
      if (start && expiry && new Date(expiry) <= new Date(start)) errs.expiry = "Expiry must be after start";
    }
    setErrors(errs);
    if (Object.keys(errs).length || !r.success) return;
    setSaving(true);
    try {
      const c = await supabase.from("clients").update({
        name: r.data.name, email: r.data.email || null, phone: r.data.phone || null, company: r.data.company || null,
      }).eq("id", sub.client_id);
      if (c.error) throw c.error;
      const s = await supabase.from("subscriptions").update({
        plan_id: planId, price: p, notes: notes.trim() || null,
        start_date: start ? new Date(start).toISOString() : null,
        expiry_date: expiry ? new Date(expiry).toISOString() : null,
      }).eq("id", sub.id);
      if (s.error) throw s.error;
      toast.success("Changes saved");
      invalidate();
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function rotate() {
    if (!sub) return;
    setRotating(true);
    const { data, error } = await supabase.rpc("admin_rotate_api_key", { _client_id: sub.client_id });
    setRotating(false);
    if (error) return void toast.error(errMsg(error));
    setApiKey(data);
    invalidate();
    toast.success("API key rotated — the old key no longer works");
  }

  return (
    <Dialog open={!!sub} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {sub?.client.name}</DialogTitle>
          <DialogDescription>Update client details and subscription terms.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:col-span-2">Client</p>
            <div className="sm:col-span-2"><Field label="Name *" error={errors["name"]}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field></div>
            <Field label="Email" error={errors["email"]}><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone" error={errors["phone"]}><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field></div>
          </section>
          <section className="grid gap-3 sm:grid-cols-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:col-span-2">Subscription</p>
            <Field label="Plan"><PlanSelect value={planId} onChange={setPlanId} /></Field>
            <Field label="Price" error={errors["price"]}><Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
            <Field label="Start" error={errors["start"]}><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Expiry" error={errors["expiry"]}><Input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
          </section>
          <section className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><KeyRound className="h-3.5 w-3.5" /> Android API credentials</p>
            <div className="grid gap-2 text-xs">
              <div className="flex items-center gap-2"><span className="w-20 text-muted-foreground">Client ID</span><code className="font-mono">{sub?.client.client_code}</code></div>
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-muted-foreground">API key</span>
                <code className="min-w-0 flex-1 truncate font-mono">{apiKey}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(apiKey); toast.success("Copied"); }}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
              <Button size="sm" variant="outline" className="mt-1 w-fit" onClick={rotate} disabled={rotating}>
                {rotating && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Rotate key
              </Button>
            </div>
          </section>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Approve / Renew ---------------- */
export function ActivateDialog({ sub, mode, onOpenChange }: { sub: SubscriptionRow | null; mode: "approve" | "renew"; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidateAll();
  const plans = usePlans();
  const [planId, setPlanId] = useState("");
  const [days, setDays] = useState("30");
  const [recordPayment, setRecordPayment] = useState(true);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const plan = plans.data?.find((p) => p.id === planId);
  useEffect(() => {
    if (sub) { setPlanId(sub.plan_id); setDays(String(sub.plan.duration_days)); setRecordPayment(true); setAmount(String(sub.plan.price)); setError(""); }
  }, [sub]);
  useEffect(() => { if (plan) { setAmount(String(plan.price)); setDays(String(plan.duration_days)); } }, [plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!sub) return;
    const d = Number(days); const a = Number(amount);
    if (!Number.isInteger(d) || d < 1 || d > 3650) return void setError("Duration must be 1–3650 days");
    if (recordPayment && (!Number.isFinite(a) || a < 0)) return void setError("Enter a valid payment amount");
    setSaving(true);
    const { error } = await supabase.rpc("admin_activate_subscription", {
      _subscription_id: sub.id, _plan_id: planId, _days: d, _record_payment: recordPayment, _payment_amount: a,
    });
    setSaving(false);
    if (error) return void toast.error(errMsg(error));
    toast.success(mode === "approve" ? "Subscription approved" : "Subscription renewed");
    invalidate();
    onOpenChange(false);
  }

  const extending = sub?.status === "ACTIVE" && sub.expiry_date && new Date(sub.expiry_date) > new Date();
  return (
    <Dialog open={!!sub} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "approve" ? "Approve subscription" : "Renew or change plan"}</DialogTitle>
          <DialogDescription>
            {sub?.client.name} · {extending ? "time is added to the current expiry date" : "the new period starts now"}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Plan"><PlanSelect value={planId} onChange={setPlanId} /></Field>
          <Field label="Duration (days)"><Input type="number" min="1" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
            <label className="flex items-center justify-between text-sm"><span>Record a payment</span><Switch checked={recordPayment} onCheckedChange={setRecordPayment} /></label>
            {recordPayment && <Field label="Amount"><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{mode === "approve" ? "Approve" : "Renew"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Confirm ---------------- */
export type ConfirmKind = "reject" | "suspend" | "reactivate" | "delete";
const confirmCopy: Record<ConfirmKind, { title: string; body: string; cta: string; danger: boolean }> = {
  reject: { title: "Reject this request?", body: "The pending subscription will be removed. The client record stays so you can create a new subscription later.", cta: "Reject", danger: true },
  suspend: { title: "Suspend subscription?", body: "Automation will be blocked immediately until an admin reactivates it.", cta: "Suspend", danger: true },
  reactivate: { title: "Reactivate subscription?", body: "The client can use the service again. If the period has already ended it will move to Expired instead.", cta: "Reactivate", danger: false },
  delete: { title: "Delete subscription permanently?", body: "This removes the subscription. Usage history is kept for the client. This cannot be undone.", cta: "Delete", danger: true },
};

export function ConfirmActionDialog({ target, onOpenChange }: { target: { sub: SubscriptionRow; kind: ConfirmKind } | null; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState(false);
  const copy = target ? confirmCopy[target.kind] : null;

  async function run(e: React.MouseEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    const { sub, kind } = target;
    const res = kind === "suspend" || kind === "reactivate"
      ? await supabase.rpc("admin_set_suspended", { _subscription_id: sub.id, _suspend: kind === "suspend" })
      : await supabase.from("subscriptions").delete().eq("id", sub.id);
    setBusy(false);
    if (res.error) return void toast.error(errMsg(res.error));
    toast.success(`${confirmCopy[kind].cta} complete`);
    invalidate();
    onOpenChange(false);
  }

  return (
    <AlertDialog open={!!target} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{target?.sub.client.name}</span> ({target?.sub.client.client_code}) — {copy?.body}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={run} disabled={busy} className={copy?.danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{copy?.cta}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
