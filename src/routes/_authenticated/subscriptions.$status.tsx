import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/AdminShell";
import { StateBox, StatusBadge } from "@/components/admin/StatusBadge";
import { ActivateDialog, ConfirmActionDialog, CreateSubscriptionDialog, EditSubscriptionDialog, type ConfirmKind } from "@/components/admin/SubscriptionDialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errMsg, formatDate, formatMoney, usePlans, useSettings, useSubscriptions, type SubStatus, type SubscriptionRow } from "@/lib/sendra";

const MAP: Record<string, SubStatus> = { pending: "PENDING", active: "ACTIVE", expired: "EXPIRED", suspended: "SUSPENDED" };

export const Route = createFileRoute("/_authenticated/subscriptions/$status")({
  beforeLoad: ({ params }) => { if (!MAP[params.status]) throw notFound(); },
  head: ({ params }) => {
    const t = `${params.status[0]?.toUpperCase()}${params.status.slice(1)} subscriptions — Sendra Admin 2.0`;
    return { meta: [{ title: t }, { name: "description", content: `Manage ${params.status} Sendra subscriptions.` }, { property: "og:title", content: t }, { property: "og:description", content: `Manage ${params.status} Sendra subscriptions.` }] };
  },
  component: SubsPage,
});

function SubsPage() {
  const { status } = Route.useParams();
  const st = MAP[status]!;
  const subs = useSubscriptions();
  const plans = usePlans();
  const { data: settings } = useSettings();
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<SubscriptionRow | null>(null);
  const [act, setAct] = useState<{ sub: SubscriptionRow; mode: "approve" | "renew" } | null>(null);
  const [confirm, setConfirm] = useState<{ sub: SubscriptionRow; kind: ConfirmKind } | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (subs.data ?? []).filter((r) => r.status === st && (plan === "all" || r.plan_id === plan) &&
      (!s || [r.client.name, r.client.client_code, r.client.email, r.client.phone, r.client.company].some((v) => v?.toLowerCase().includes(s))));
  }, [subs.data, st, q, plan]);

  return (
    <div className="animate-rise">
      <PageHeader title={`${status[0]!.toUpperCase()}${status.slice(1)} subscriptions`} description="Search, filter and manage client subscriptions."
        actions={<Button onClick={() => setCreate(true)}><Plus className="h-4 w-4" /> New subscription</Button>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, client ID, email, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={plan} onValueChange={setPlan}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {plans.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {subs.error ? <StateBox tone="error" title="Couldn't load subscriptions" body={errMsg(subs.error)} action={<Button variant="outline" onClick={() => subs.refetch()}>Retry</Button>} />
        : subs.isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        : rows.length === 0 ? <StateBox title={q || plan !== "all" ? "No matches" : `No ${status} subscriptions`} body={q || plan !== "all" ? "Try a different search or filter." : "Subscriptions in this state will appear here."} />
        : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>{["Client ID", "Name", "Contact", "Plan", "Price", "Status", "Start", "Expiry", "Usage today", ""].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const lim = r.plan.daily_limit;
                  const pct = lim ? Math.min(100, (r.used_today / lim) * 100) : 0;
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{r.client.client_code}</td>
                      <td className="px-4 py-3"><p className="font-medium">{r.client.name}</p>{r.client.company && <p className="text-xs text-muted-foreground">{r.client.company}</p>}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground"><p>{r.client.email ?? "—"}</p><p>{r.client.phone}</p></td>
                      <td className="px-4 py-3">{r.plan.name}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatMoney(r.price, settings?.currency)}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDate(r.start_date)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDate(r.expiry_date)}</td>
                      <td className="min-w-32 px-4 py-3">
                        <p className="font-mono text-xs">{r.used_today.toLocaleString()} / {lim ? lim.toLocaleString() : "∞"}</p>
                        {lim && <div className="mt-1 h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${pct >= 100 ? "bg-suspended" : pct > 80 ? "bg-pending" : "bg-active"}`} style={{ width: `${pct}%` }} /></div>}
                      </td>
                      <td className="px-2 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {r.status === "PENDING" && <><DropdownMenuItem onClick={() => setAct({ sub: r, mode: "approve" })}>Approve</DropdownMenuItem><DropdownMenuItem onClick={() => setConfirm({ sub: r, kind: "reject" })}>Reject</DropdownMenuItem></>}
                            {(r.status === "ACTIVE" || r.status === "EXPIRED") && <DropdownMenuItem onClick={() => setAct({ sub: r, mode: "renew" })}>Renew / change plan</DropdownMenuItem>}
                            {r.status === "ACTIVE" && <DropdownMenuItem onClick={() => setConfirm({ sub: r, kind: "suspend" })}>Suspend</DropdownMenuItem>}
                            {r.status === "SUSPENDED" && <DropdownMenuItem onClick={() => setConfirm({ sub: r, kind: "reactivate" })}>Reactivate</DropdownMenuItem>}
                            <DropdownMenuItem onClick={() => setEdit(r)}>Edit details</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setConfirm({ sub: r, kind: "delete" })}>Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      <CreateSubscriptionDialog open={create} onOpenChange={setCreate} />
      <EditSubscriptionDialog sub={edit} onOpenChange={(o) => !o && setEdit(null)} />
      <ActivateDialog sub={act?.sub ?? null} mode={act?.mode ?? "approve"} onOpenChange={(o) => !o && setAct(null)} />
      <ConfirmActionDialog target={confirm} onOpenChange={(o) => !o && setConfirm(null)} />
    </div>
  );
}
