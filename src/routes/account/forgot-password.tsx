import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerAuthLayout, FormAlert, FormField } from "@/components/customer/CustomerAuthLayout";
import { authErrorMessage, handoffParams, handoffSearch, readHandoff, type Handoff } from "@/lib/android-handoff";

export const Route = createFileRoute("/account/forgot-password")({
  validateSearch: handoffSearch,
  head: () => ({
    meta: [
      { title: "Forgot password — Sendra" },
      { name: "description", content: "Reset the password for your Sendra account." },
      { property: "og:title", content: "Forgot password — Sendra" },
      { property: "og:description", content: "Reset the password for your Sendra account." },
    ],
  }),
  component: ForgotPage,
});

const schema = z.string().trim().min(1, "Enter your email").email("Enter a valid email address").max(255);

function ForgotPage() {
  const search = Route.useSearch();
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [alert, setAlert] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => setHandoff(readHandoff(search)), [search]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    const p = schema.safeParse(email);
    if (!p.success) return setError(p.error.issues[0]?.message);
    setError(undefined);
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(p.data, { redirectTo: `${window.location.origin}/account/reset-password` });
    setLoading(false);
    if (err) return setAlert(authErrorMessage(err));
    setSent(true);
  }

  if (sent) {
    return (
      <CustomerAuthLayout title="Check your email">
        <div className="flex flex-col items-center text-center">
          <MailCheck className="h-10 w-10 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">If an account exists for <span className="font-medium text-foreground">{email}</span>, we sent a link to reset your password.</p>
          <Button asChild variant="outline" className="mt-6 w-full"><Link to="/account/login" search={handoffParams(handoff)}>Back to log in</Link></Button>
        </div>
      </CustomerAuthLayout>
    );
  }
  return (
    <CustomerAuthLayout title="Forgot password" subtitle="Enter your email and we'll send you a reset link.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormAlert message={alert} />
        <FormField id="email" label="Email" error={error}>
          <Input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} />
        </FormField>
        <Button type="submit" className="h-11 w-full" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Send reset link</Button>
      </form>
      <p className="mt-6 text-center text-sm"><Link to="/account/login" search={handoffParams(handoff)} className="font-medium text-primary hover:underline">Back to log in</Link></p>
    </CustomerAuthLayout>
  );
}
