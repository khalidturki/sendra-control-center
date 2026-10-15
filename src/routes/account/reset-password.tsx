import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerAuthLayout, FormAlert, FormField } from "@/components/customer/CustomerAuthLayout";
import { authErrorMessage } from "@/lib/android-handoff";

export const Route = createFileRoute("/account/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Sendra" },
      { name: "description", content: "Choose a new password for your Sendra account." },
      { property: "og:title", content: "Set a new password — Sendra" },
      { property: "og:description", content: "Choose a new password for your Sendra account." },
    ],
  }),
  component: ResetPage,
});

const schema = z
  .object({ password: z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters"), confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match" });

function ResetPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [f, setF] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    const t = setTimeout(() => supabase.auth.getSession().then(({ data: s }) => setReady((r) => r ?? !!s.session)), 1500);
    return () => { data.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    const p = schema.safeParse(f);
    if (!p.success) return setErrors(Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])));
    setErrors({});
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: p.data.password });
    if (error) { setLoading(false); return setAlert(authErrorMessage(error)); }
    await supabase.auth.signOut({ scope: "local" });
    setLoading(false);
    toast.success("Password updated. Log in with your new password.");
    navigate({ to: "/account/login", replace: true });
  }

  if (ready === null) return <CustomerAuthLayout title="Set a new password"><div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></CustomerAuthLayout>;
  if (!ready) {
    return (
      <CustomerAuthLayout title="Link expired" subtitle="This reset link is invalid or has expired.">
        <Button asChild className="w-full"><Link to="/account/forgot-password">Send a new link</Link></Button>
      </CustomerAuthLayout>
    );
  }
  return (
    <CustomerAuthLayout title="Set a new password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormAlert message={alert} />
        <FormField id="password" label="New password" error={errors["password"]}><Input id="password" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></FormField>
        <FormField id="confirm" label="Confirm new password" error={errors["confirm"]}><Input id="confirm" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></FormField>
        <Button type="submit" className="h-11 w-full" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Update password</Button>
      </form>
    </CustomerAuthLayout>
  );
}
