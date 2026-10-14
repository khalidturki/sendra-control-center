import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Ban, Check, Loader2, Search, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/AdminShell";
import { StateBox } from "@/components/admin/StatusBadge";
import { FilterTabs, ReviewBadge } from "@/components/admin/ReviewBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { errMsg, useInvalidateAll } from "@/lib/sendra";

export const Route = createFileRoute("/_authenticated/devices")({
  head: () => ({ meta: [{ title: "Device approvals — Sendra Admin 2.0" }, { name: "description", content: "Approve, replace or revoke the one phone allowed per customer account." }, { property: "og:title", content: "Device approvals — Sendra Admin 2.0" }, { property: "og:description", content: "Approve, replace or revoke the one phone allowed per customer account." }] }),
  component: DevicesPage,
});

const FILTERS = ["PENDING", "APPROVED", "REVOKED", "REJECTED", "ALL"] as const;

function DevicesPage() {
  const [f, setF] = useState<(typeof FILTERS)[number]>("PENDING");
  const [q, setQ] = useState("");
  const [act, setAct] = useState<{ id: string; approve: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateAll();
  const list = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("devices").select("*, client:clients(client_code,name,phone,email)").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });
  const all = list.data ?? [];
  const s = q.toLowerCase();
  const rows = all.filter((d) => (f === "ALL" || d.status === f) &&
    (!s || [d.client?.name, d.client?.client_code, d.device_name, d.installation_id].some((v) => v?.toLowerCase().includes(s))));
  const hasApproved = (clientId: string, id: string) => all.some((d) => d.client_id === clientId && d.status === "APPROVED" && d.id !== id);

  async function run() {
    if (!act) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_review_device", { _device_id: act.id, _approve: act.approve });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success(act.approve ? "Device approved" : "Device access removed");
    setAct(null); invalidate();
  }

  return (
    <div className="animate-rise">
      <PageHeader title="Device approvals" description="Each account may use one approved phone. New phones and reinstalls need your approval." />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <FilterTabs value={f} options={FILTERS} onChange={setF} />
        <div className="relative sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search customer or device…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {list.error ? <StateBox tone="error" title="Couldn't load devices" body={errMsg(list.error)} />
        : list.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        : !rows.length ? <StateBox title="Nothing here" body={f === "PENDING" ? "No phones are waiting for approval." : "No matching devices."} />
        : (
          <ul className="space-y-3">
            {rows.map((d) => {
              const replaces = hasApproved(d.client_id, d.id);
              return (
                <li key={d.id} className="flex flex-col gap-4 rounded-xl border bg-card p-5 md:flex-row md:items-center">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><Smartphone className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{d.client?.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{d.client?.client_code}</span>
                      <ReviewBadge status={d.status} />
                      {d.status === "PENDING" && replaces && <span className="rounded-md bg-pending/12 px-2 py-0.5 text-[11px] font-medium text-pending">Replaces current phone</span>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{d.device_name ?? "Unnamed device"} · <span className="font-mono text-xs">{d.installation_id.slice(0, 16)}…</span></p>
                    <p className="mt-1 text-xs text-muted-foreground">Requested {new Date(d.created_at).toLocaleString()}{d.last_seen_at ? ` · Last seen ${new Date(d.last_seen_at).toLocaleString()}` : ""}</p>
                  </div>
                  <div className="flex gap-2">
                    {d.status === "PENDING" && <>
                      <Button variant="outline" onClick={() => setAct({ id: d.id, approve: false, text: "This installation will be rejected. The customer can request again later." })}><Ban className="h-4 w-4" />Reject</Button>
                      <Button onClick={() => setAct({ id: d.id, approve: true, text: replaces ? "This phone will be approved and the customer's current phone will lose access immediately." : "This phone will be allowed to send for this account." })}><Check className="h-4 w-4" />Approve</Button>
                    </>}
                    {d.status === "APPROVED" && <Button variant="outline" onClick={() => setAct({ id: d.id, approve: false, text: "This phone will stop working immediately. The customer's account stays intact." })}><Ban className="h-4 w-4" />Revoke</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      <AlertDialog open={!!act} onOpenChange={(o) => { if (!o) setAct(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{act?.approve ? "Approve this device?" : "Remove device access?"}</AlertDialogTitle>
            <AlertDialogDescription>{act?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void run(); }}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
