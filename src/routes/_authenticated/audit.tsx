import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/AdminShell";
import { StateBox } from "@/components/admin/StatusBadge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errMsg } from "@/lib/sendra";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit log — Sendra Admin 2.0" }, { name: "description", content: "History of administrative actions in Sendra Admin." }, { property: "og:title", content: "Audit log — Sendra Admin 2.0" }, { property: "og:description", content: "History of administrative actions in Sendra Admin." }] }),
  component: AuditPage,
});

function AuditPage() {
  const [q, setQ] = useState("");
  const logs = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data;
    },
  });
  const s = q.toLowerCase();
  const rows = (logs.data ?? []).filter((l) => !s || l.action.includes(s) || l.actor_email?.toLowerCase().includes(s) || JSON.stringify(l.details).toLowerCase().includes(s));
  return (
    <div className="animate-rise">
      <PageHeader title="Audit log" description="Every change to clients, subscriptions, plans, payments, settings and admins." />
      <div className="relative mb-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search actions, admins, details…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {logs.error ? <StateBox tone="error" title="Couldn't load audit log" body={errMsg(logs.error)} />
        : logs.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        : !rows.length ? <StateBox title="No entries" />
        : (
          <ul className="divide-y rounded-xl border bg-card">
            {rows.map((l) => {
              const d = l.details as { new?: { name?: string }; old?: { name?: string }; email?: string };
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="rounded-md bg-accent px-2 py-0.5 font-mono text-[11px] text-accent-foreground">{l.action}</span>
                  <span className="text-muted-foreground">{d.new?.name ?? d.old?.name ?? d.email ?? l.entity_id?.slice(0, 8)}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{l.actor_email ?? "system"} · {new Date(l.created_at).toLocaleString()}</span>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
