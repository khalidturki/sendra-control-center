import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomerAuthLayout, FormAlert, FormField } from "@/components/customer/CustomerAuthLayout";
import { authErrorMessage, completeHandoff, handoffParams, handoffSearch, readHandoff, type Handoff } from "@/lib/android-handoff";

export const Route = createFileRoute("/account/signup")({
  validateSearch: handoffSearch,
  head: () => ({
    meta: [
      { title: "Create account — Sendra" },
      { name: "description", content: "Create your Sendra customer account." },
      { property: "og:title", content: "Create account — Sendra" },
      { property: "og:description", content: "Create your Sendra customer account." },
    ],
  }),
  component: SignupPage,
});

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(120, "Name is too long"),
    phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number, e.g. +252612345678"),
    email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address").max(255),
    password: z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match" });

function SignupPage() {
  const search = Route.useSearch();
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [f, setF] = useState({ name: "", phone: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => setHandoff(readHandoff(search)), [search]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    const p = schema.safeParse(f);
    if (!p.success) return setErrors(Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])));
    setErrors({});
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: p.data.email,
        password: p.data.password,
        options: { emailRedirectTo: `${window.location.origin}/account/login`, data: { name: p.data.name, phone: p.data.phone } },
      });
      if (error) throw error;
      if (data.user && data.user.identities?.length === 0) throw new Error("already registered");
      if (data.session && handoff) await completeHandoff(handoff);
      else setSent(true);
    } catch (err) {
      setAlert(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  if (sent) {
    return (
      <CustomerAuthLayout title="Check your email">
        <div className="flex flex-col items-center text-center">
          <MailCheck className="h-10 w-10 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">We sent a confirmation link to <span className="font-medium text-foreground">{f.email}</span>. Open it on this phone, then log in.</p>
          <Button asChild variant="outline" className="mt-6 w-full"><Link to="/account/login" search={handoffParams(handoff)}>Back to log in</Link></Button>
        </div>
      </CustomerAuthLayout>
    );
  }

  return (
    <CustomerAuthLayout title="Create account" subtitle="After signing up, your device and plan are approved by the Sendra team.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormAlert message={alert} />
        <FormField id="name" label="Full name" error={errors["name"]}><Input id="name" autoComplete="name" value={f.name} onChange={set("name")} aria-invalid={!!errors["name"]} /></FormField>
        <FormField id="phone" label="Phone number" error={errors["phone"]}><Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+252612345678" value={f.phone} onChange={set("phone")} aria-invalid={!!errors["phone"]} /></FormField>
        <FormField id="email" label="Email" error={errors["email"]}><Input id="email" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set("email")} aria-invalid={!!errors["email"]} /></FormField>
        <FormField id="password" label="Password" error={errors["password"]}><Input id="password" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} aria-invalid={!!errors["password"]} /></FormField>
        <FormField id="confirm" label="Confirm password" error={errors["confirm"]}><Input id="confirm" type="password" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} aria-invalid={!!errors["confirm"]} /></FormField>
        <Button type="submit" className="h-11 w-full" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/account/login" search={handoffParams(handoff)} className="font-medium text-primary hover:underline">Log in</Link>
      </p>
    </CustomerAuthLayout>
  );
}
