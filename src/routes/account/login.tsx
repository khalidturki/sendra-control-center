import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerAuthLayout, FormAlert, FormField } from "@/components/customer/CustomerAuthLayout";
import { authErrorMessage, completeHandoff, handoffParams, handoffSearch, readHandoff, type Handoff } from "@/lib/android-handoff";

export const Route = createFileRoute("/account/login")({
  validateSearch: handoffSearch,
  head: () => ({
    meta: [
      { title: "Log in — Sendra" },
      { name: "description", content: "Log in to your Sendra account to continue in the Sendra app." },
      { property: "og:title", content: "Log in — Sendra" },
      { property: "og:description", content: "Log in to your Sendra account to continue in the Sendra app." },
    ],
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address").max(255),
  password: z.string().min(1, "Enter your password").max(72),
});

function LoginPage() {
  const search = Route.useSearch();
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHandoff(readHandoff(search));
    supabase.auth.getUser().then(({ data }) => setCurrent(data.user?.email ?? null));
  }, [search]);

  async function finish() {
    if (!handoff) return;
    await completeHandoff(handoff);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    const p = schema.safeParse({ email, password });
    if (!p.success) return setErrors(Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])));
    setErrors({});
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword(p.data);
      if (error) throw error;
      if (handoff) await finish();
      else setCurrent(data.user.email ?? p.data.email);
    } catch (err) {
      setAlert(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function continueAs() {
    setLoading(true); setAlert(null);
    try { await finish(); } catch (err) { setAlert(authErrorMessage(err)); } finally { setLoading(false); }
  }
  async function signOut() {
    await supabase.auth.signOut({ scope: "local" });
    setCurrent(null);
  }

  if (current) {
    return (
      <CustomerAuthLayout title={handoff ? "Continue to Sendra" : "You're logged in"} subtitle={`Signed in as ${current}`}>
        <FormAlert message={alert} />
        {handoff ? (
          <Button className="mt-4 w-full" onClick={continueAs} disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Continue to the app</Button>
        ) : (
          <p className="text-sm text-muted-foreground">Open the Sendra app and tap "Log in" to use your account there.</p>
        )}
        <Button variant="outline" className="mt-3 w-full" onClick={signOut} disabled={loading}>Use a different account</Button>
      </CustomerAuthLayout>
    );
  }

  return (
    <CustomerAuthLayout title="Log in" subtitle={handoff ? "Log in to continue in the Sendra app." : "Log in to your Sendra account."}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormAlert message={alert} />
        <FormField id="email" label="Email" error={errors["email"]}>
          <Input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors["email"]} />
        </FormField>
        <FormField id="password" label="Password" error={errors["password"]}>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors["password"]} />
        </FormField>
        <div className="text-right text-sm">
          <Link to="/account/forgot-password" search={handoffParams(handoff)} className="font-medium text-primary hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" className="h-11 w-full" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Log in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Sendra?{" "}
        <Link to="/account/signup" search={handoffParams(handoff)} className="font-medium text-primary hover:underline">Create an account</Link>
      </p>
    </CustomerAuthLayout>
  );
}
