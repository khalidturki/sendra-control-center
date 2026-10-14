import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/AdminShell";
import { StateBox } from "@/components/admin/StatusBadge";
import { FilterTabs, ReviewBadge } from "@/components/admin/ReviewBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { errMsg, formatMoney, useInvalidateAll, useSettings } from "@/lib/sendra";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [{ title: "Payment requests — Sendra Admin 2.0" }, { name: "description", content: "Verify customer payments to activate, renew or change plans." }, { property: "og:title", content: "Payment requests — Sendra Admin 2.0" }, { property: "og:description", content: "Verify customer payments to activate, renew or change plans." }] }),
  component: PaymentsPage,
});

const FILTERS = ["PENDING", "APPROVED", "REJECTED", "ALL"] as const;
const KIND: Record<string, string> = { PURCHASE: "First purchase", RENEWAL: "Renewal", PLAN_CHANGE: "Plan change" };

function PaymentsPage() {
  const [f, setF] = useState<(typeof FILTERS)[number]>("PENDING");
  const [q, setQ] = useState("");
  const [act, setAct] = useState<{ id: string; approve: boolean; label: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateAll();
  const settings = useSettings();
  const list = useQuery({
    queryKey: ["payment-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_requests")
        .select("*, client:clients(client_code,name,phone,email), plan:plans(name,daily_limit,duration_days)")
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });
  const s = q.toLowerCase();
  const rows = (list.data ?? []).filter((r) => (f === "ALL" || r.status === f) &&
    (!s || [r.client?.name, r.client?.client_code, r.client?.phone, r.payer_phone, r.reference].some((v) => v?.toLowerCase().includes(s))));

  async function run() {
    if (!act) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_review_payment", { _request_id: act.id, _approve: act.approve, ...(note.trim() ? { _note: note.trim() } : {}) });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success(act.approve ? "Payment approved — subscription updated" : "Payment request rejected");
    setAct(null); setNote(""); invalidate();
  }

  return (
    <div className="animate-rise">
      <PageHeader title="Payment requests" description="Customers pay by USSD, then you verify here. Only approval activates, renews or changes a plan." />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <FilterTabs value={f} options={FILTERS} onChange={setF} />
        <div className="relative sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search name, ID, phone…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {list.error ? <StateBox tone="error" title="Couldn't load payment requests" body={errMsg(list.error)} />
        : list.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        : !rows.length ? <StateBox title="Nothing here" body={f === "PENDING" ? "No payments are waiting for verification." : "No matching requests."} />
        : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-4 rounded-xl border bg-card p-5 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.client?.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{r.client?.client_code}</span>
                    <ReviewBadge status={r.status} />
                    <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">{KIND[r.kind]}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.plan?.name} · {r.plan?.daily_limit ? `${r.plan.daily_limit}/day` : "Unlimited"} · {r.plan?.duration_days} days
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Phone {r.payer_phone ?? r.client?.phone ?? "—"}{r.reference ? ` · Ref ${r.reference}` : ""} · {new Date(r.created_at).toLocaleString()}
                    {r.admin_note ? ` · Note: ${r.admin_note}` : ""}
                  </p>
                </div>
                <p className="font-display text-xl font-semibold">{formatMoney(r.amount, settings.data?.currency)}</p>
                {r.status === "PENDING" && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setAct({ id: r.id, approve: false, label: r.client?.name ?? "" })}><X className="h-4 w-4" />Reject</Button>
                    <Button onClick={() => setAct({ id: r.id, approve: true, label: r.client?.name ?? "" })}><Check className="h-4 w-4" />Approve</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      <AlertDialog open={!!act} onOpenChange={(o) => { if (!o) { setAct(null); setNote(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{act?.approve ? "Approve payment?" : "Reject payment?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {act?.approve ? `Only approve once you've confirmed the money from ${act?.label} arrived. The subscription will be activated, renewed or switched to the new plan, and the payment recorded.`
                : `The request from ${act?.label} will be closed. Their current subscription is not affected.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea placeholder="Optional note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void run(); }}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{act?.approve ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
