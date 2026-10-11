import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Users, CreditCard, Wallet, Zap, Clock, CheckCircle2, CalendarX2, PauseCircle, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/AdminShell";
import { StateBox } from "@/components/admin/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, useSettings, useSubscriptions, todayInTz, errMsg } from "@/lib/sendra";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Sendra Admin 2.0" },
      { name: "description", content: "Overview of Sendra clients, subscriptions, revenue and daily usage." },
      { property: "og:title", content: "Dashboard — Sendra Admin 2.0" },
      { property: "og:description", content: "Overview of Sendra clients, subscriptions, revenue and daily usage." },
    ],
  }),
  component: Dashboard,
});

function useDashboardExtras(tz?: string) {
  return useQuery({
    queryKey: ["dashboard-extras", tz],
    enabled: !!tz,
    queryFn: async () => {
      const since = new Date(Date.now() - 13 * 86400000);
      const sinceStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(since);
      const [clients, payments, usage, audit] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("payments").select("amount"),
        supabase.from("usage_records").select("usage_date").gte("usage_date", sinceStr),
        supabase.from("audit_logs").select("*").like("action", "subscription.%").order("created_at", { ascending: false }).limit(8),
      ]);
      for (const r of [clients, payments, usage, audit]) if (r.error) throw r.error;
      const revenue = (payments.data ?? []).reduce((a, p) => a + Number(p.amount), 0);
      const byDay = new Map<string, number>();
      for (let i = 13; i >= 0; i--) {
        byDay.set(new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() - i * 86400000)), 0);
      }
      for (const u of usage.data ?? []) byDay.set(u.usage_date, (byDay.get(u.usage_date) ?? 0) + 1);
      const trend = [...byDay.entries()].map(([date, sends]) => ({
        date: new Date(date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        sends,
      }));
      return { clients: clients.count ?? 0, revenue, trend, audit: audit.data ?? [] };
    },
  });
}

function Dashboard() {
  const settings = useSettings();
  const subs = useSubscriptions();
  const extras = useDashboardExtras(settings.data?.usage_timezone);
  const error = settings.error || subs.error || extras.error;
  const loading = subs.isLoading || extras.isLoading || settings.isLoading;

  if (error) return <StateBox tone="error" title="Couldn't load the dashboard" body={errMsg(error)} />;

  const list = subs.data ?? [];
  const c = (s: string) => list.filter((x) => x.status === s).length;
  const usedToday = settings.data ? list.filter((s) => s.status === "ACTIVE").reduce((a, s) => a + s.used_today, 0) : 0;
  const todayUsage = extras.data?.trend.at(-1)?.sends ?? 0;
  const currency = settings.data?.currency ?? "USD";

  const statusData = [
    { name: "Pending", value: c("PENDING"), color: "var(--pending)" },
    { name: "Active", value: c("ACTIVE"), color: "var(--active)" },
    { name: "Expired", value: c("EXPIRED"), color: "var(--expired)" },
    { name: "Suspended", value: c("SUSPENDED"), color: "var(--suspended)" },
  ];
  const totalSends = extras.data?.trend.reduce((a, t) => a + t.sends, 0) ?? 0;

  return (
    <div className="animate-rise">
      <PageHeader title="Dashboard" description={`Live figures · usage day resets at midnight ${settings.data?.usage_timezone ?? ""}`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat loading={loading} icon={Users} label="Total clients" value={extras.data?.clients ?? 0} hint={`${list.length} subscriptions`} accent />
        <Stat loading={loading} icon={Wallet} label="Recorded revenue" value={formatMoney(extras.data?.revenue, currency)} hint="All subscription payments" />
        <Stat loading={loading} icon={Zap} label="Successful sends today" value={todayUsage.toLocaleString()} hint={`${usedToday.toLocaleString()} by active clients`} />
        <Stat loading={loading} icon={CreditCard} label="Sends · last 14 days" value={totalSends.toLocaleString()} hint="Confirmed transactions only" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { k: "pending", label: "Pending", n: c("PENDING"), icon: Clock, tone: "text-pending bg-pending/10" },
          { k: "active", label: "Active", n: c("ACTIVE"), icon: CheckCircle2, tone: "text-active bg-active/10" },
          { k: "expired", label: "Expired", n: c("EXPIRED"), icon: CalendarX2, tone: "text-expired bg-expired/10" },
          { k: "suspended", label: "Suspended", n: c("SUSPENDED"), icon: PauseCircle, tone: "text-suspended bg-suspended/10" },
        ].map((s) => (
          <Link key={s.k} to="/subscriptions/$status" params={{ status: s.k }} className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
            <div className={cn("grid h-10 w-10 place-items-center rounded-lg", s.tone)}>
              <s.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              {loading ? <Skeleton className="mt-1 h-6 w-10" /> : <p className="font-display text-2xl font-semibold">{s.n}</p>}
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h3 className="font-semibold">Usage trend</h3>
          <p className="text-xs text-muted-foreground">Successful sends per day across all clients</p>
          <div className="mt-4 h-64">
            {loading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={extras.data?.trend ?? []}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="sends" stroke="var(--primary)" strokeWidth={2} fill="url(#g)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">Subscription status</h3>
          <p className="text-xs text-muted-foreground">Distribution across all subscriptions</p>
          <div className="relative mt-4 h-48">
            {loading ? <Skeleton className="h-full w-full" /> : list.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">No subscriptions yet</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="value" innerRadius={52} outerRadius={78} paddingAngle={3} strokeWidth={0}>
                      {statusData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <p className="font-display text-2xl font-semibold">{list.length}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">total</p>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {statusData.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="ml-auto font-mono">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="font-semibold">Recent subscription activity</h3>
            <p className="text-xs text-muted-foreground">Latest actions recorded in the audit log</p>
          </div>
          <Link to="/audit" className="text-xs font-medium text-primary hover:underline">View all</Link>
        </div>
        {loading ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : extras.data?.audit.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No activity yet. Create your first subscription to get started.</p>
        ) : (
          <ul className="divide-y">
            {extras.data?.audit.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="rounded-md bg-accent px-2 py-0.5 font-mono text-[11px] text-accent-foreground">{a.action}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{a.actor_email ?? "system"}</span>
                <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, loading, accent }: { icon: React.ElementType; label: string; value: React.ReactNode; hint?: string; loading?: boolean; accent?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl border p-5", accent ? "border-transparent bg-sidebar text-sidebar-accent-foreground" : "bg-card")}>
      {accent && <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-sidebar-primary/25 blur-2xl" />}
      <div className="relative flex items-center justify-between">
        <p className={cn("text-xs font-medium", accent ? "text-sidebar-foreground/80" : "text-muted-foreground")}>{label}</p>
        <Icon className={cn("h-4 w-4", accent ? "text-sidebar-primary" : "text-primary")} />
      </div>
      {loading ? <Skeleton className="relative mt-3 h-8 w-24" /> : <p className="relative mt-2 font-display text-3xl font-semibold">{value}</p>}
      {hint && <p className={cn("relative mt-1 text-xs", accent ? "text-sidebar-foreground/60" : "text-muted-foreground")}>{hint}</p>}
    </div>
  );
}
