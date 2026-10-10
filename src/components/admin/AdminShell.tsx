import { Link, Outlet, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  LayoutDashboard, Clock, CheckCircle2, CalendarX2, PauseCircle, Layers, ScrollText, Settings, LogOut, Menu, Send, Loader2, ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSubscriptions } from "@/lib/sendra";
import { cn } from "@/lib/utils";

function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_admin");
      if (error) throw error;
      return !!data;
    },
  });
}

function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

export function AdminShell() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const admin = useIsAdmin();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);

  if (admin.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!admin.data) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md animate-rise text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-pending/15 text-pending">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">Awaiting admin access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You're signed in as <span className="font-medium text-foreground">{user.email}</span>, but this account
            hasn't been authorised. Ask an existing admin to grant access in Settings.
          </p>
          <Button variant="outline" className="mt-6" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarContent email={user.email ?? ""} onSignOut={signOut} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0">
          <SidebarContent email={user.email ?? ""} onSignOut={signOut} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur lg:hidden">
        <Button size="icon" variant="ghost" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-display font-semibold">Sendra Admin</span>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarContent({ email, onSignOut, onNavigate }: { email: string; onSignOut: () => void; onNavigate?: () => void }) {
  const subs = useSubscriptions();
  const count = (s: string) => subs.data?.filter((x) => x.status === s).length;
  const link = "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
  const active = { className: "bg-sidebar-accent text-sidebar-accent-foreground" };

  const subLinks = [
    { s: "pending", label: "Pending", icon: Clock, key: "PENDING", tone: "text-pending" },
    { s: "active", label: "Active", icon: CheckCircle2, key: "ACTIVE", tone: "text-active" },
    { s: "expired", label: "Expired", icon: CalendarX2, key: "EXPIRED", tone: "text-expired" },
    { s: "suspended", label: "Suspended", icon: PauseCircle, key: "SUSPENDED", tone: "text-suspended" },
  ] as const;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 py-6">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/20">
          <Send className="h-4 w-4" />
        </div>
        <div>
          <p className="font-display text-[15px] font-semibold leading-none text-sidebar-accent-foreground">Sendra Admin</p>
          <p className="mt-1 text-[11px] text-sidebar-foreground/60">v2.0 console</p>
        </div>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3">
        <div className="space-y-1">
          <Link to="/dashboard" className={link} activeProps={active} onClick={onNavigate}>
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
        </div>
        <div>
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">Subscriptions</p>
          <div className="space-y-1">
            {subLinks.map((l) => (
              <Link key={l.s} to="/subscriptions/$status" params={{ status: l.s }} className={link} activeProps={active} onClick={onNavigate}>
                <l.icon className={cn("h-4 w-4", l.tone)} />
                <span className="flex-1">{l.label}</span>
                <span className="rounded-md bg-sidebar-accent px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/80">
                  {count(l.key) ?? "·"}
                </span>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">Manage</p>
          <div className="space-y-1">
            <Link to="/plans" className={link} activeProps={active} onClick={onNavigate}>
              <Layers className="h-4 w-4" /> Plans
            </Link>
            <Link to="/audit" className={link} activeProps={active} onClick={onNavigate}>
              <ScrollText className="h-4 w-4" /> Audit log
            </Link>
            <Link to="/settings" className={link} activeProps={active} onClick={onNavigate}>
              <Settings className="h-4 w-4" /> Settings
            </Link>
          </div>
        </div>
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-sidebar-primary/20 text-xs font-semibold uppercase text-sidebar-primary">
            {email.slice(0, 2)}
          </div>
          <p className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground/80">{email}</p>
          <button onClick={onSignOut} className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
