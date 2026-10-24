import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type SubStatus = Database["public"]["Enums"]["subscription_status"];
export type SubscriptionRow = Subscription & { client: Client; plan: Plan; used_today: number; dials_today: number; legacy_successes_today: number; reserved_today: number };

export const STATUSES: SubStatus[] = ["PENDING", "ACTIVE", "EXPIRED", "SUSPENDED"];

export function errMsg(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong";
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").single();
      if (error) throw error;
      return data;
    },
  });
}

export function formatMoney(n: number | string | null | undefined, currency = "USD") {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

export function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function todayInTz(tz: string) {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("sort_order").order("price");
      if (error) throw error;
      return data;
    },
  });
}

export function useSubscriptions() {
  const { data: settings } = useSettings();
  return useQuery({
    queryKey: ["subscriptions", settings?.usage_timezone],
    enabled: !!settings,
    queryFn: async (): Promise<SubscriptionRow[]> => {
      await supabase.rpc("mark_expired_subscriptions");
      const today = todayInTz(settings!.usage_timezone);
      const [subs, usage, reservations] = await Promise.all([
        supabase.from("subscriptions").select("*, client:clients(*), plan:plans(*)").order("created_at", { ascending: false }),
        supabase.from("usage_records").select("client_id,counting_basis").eq("usage_date", today),
        supabase.from("transaction_reservations").select("client_id").eq("usage_date", today).eq("status", "RESERVED"),
      ]);
      if (subs.error) throw subs.error;
      if (usage.error) throw usage.error;
      if (reservations.error) throw reservations.error;
      const counts = new Map<string, number>();
      const dials = new Map<string, number>();
      const legacy = new Map<string, number>();
      const reserved = new Map<string, number>();
      for (const r of reservations.data) reserved.set(r.client_id, (reserved.get(r.client_id) ?? 0) + 1);
      for (const u of usage.data) {
        counts.set(u.client_id, (counts.get(u.client_id) ?? 0) + 1);
        const target = u.counting_basis === "DIAL_ATTEMPT" ? dials : legacy;
        target.set(u.client_id, (target.get(u.client_id) ?? 0) + 1);
      }
      return (subs.data as unknown as (Subscription & { client: Client; plan: Plan })[]).map((s) => ({
        ...s,
        used_today: counts.get(s.client_id) ?? 0,
        dials_today: dials.get(s.client_id) ?? 0,
        legacy_successes_today: legacy.get(s.client_id) ?? 0,
        reserved_today: reserved.get(s.client_id) ?? 0,
      }));
    },
  });
}

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}
